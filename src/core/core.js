// @ts-check
// Core — the platform shell. It owns the roster of MiniGames, the active-mode
// pointer, the per-frame delegation (update/render), and the result→credit flow
// when a mode exits. It holds NO gameplay: modes implement the MiniGame
// contract and receive the Host facade on enter. See core/contract.js.
//
// Phase 2 posture: `creditResult` is now REAL — it credits a mode's exit result
// to the shared economy/progression/achievements services on the Host, one code
// path every minigame flows through. It remains overridable via the constructor
// (tests inject a spy). The legacy game self-credits inline in its own _gameOver
// (it must persist mid-run and show badges instantly, and nothing routes its
// exit() yet), so its result is flagged `credited` and this path skips it — no
// double-count.

import { assertManifest } from './manifest.js';
import { GRANDFATHERED } from './grandfathered-ids.js';
import { restrictHost } from './host.js';

export class Core {
  /**
   * @param {Object} [opts]
   * @param {import('./contract.js').Host} [opts.host] Facade passed to each
   *        MiniGame on enter().
   * @param {(result: import('./contract.js').MiniGameResult) => void} [opts.creditResult]
   *        Overrides the default credit path (mainly for tests).
   */
  constructor({ host, creditResult } = {}) {
    this.host = host;
    // An injected creditResult overrides the real prototype method (spy/tests).
    if (creditResult) this.creditResult = creditResult;
    /** @type {Map<string, import('./contract.js').MiniGame>} */
    this.registry = new Map();
    /** @type {Map<string, *>} id -> manifest, for minigames that declared one */
    this.manifests = new Map();
    /** @type {Map<string, *>} id -> the capability-restricted host it receives */
    this._hosts = new Map();
    /** @type {import('./contract.js').MiniGame[]} the mode stack; base = home */
    this._stack = [];
    /** @type {{op:'open',id:string,ctx?:any}|{op:'close',result?:any}|null} */
    this._pending = null;
  }

  /** The active (top-of-stack) minigame, or null before boot. */
  get active() { return this._stack[this._stack.length - 1] || null; }

  /** The id of the active minigame, or null. */
  activeId() { return this.active ? this.active.id : null; }

  /**
   * Credit a MiniGameResult to the shared spine, uniformly for every mode:
   * salvage → economy.earn, run stats → progression.recordRun, achievement ids
   * → achievements.unlock. Results already self-credited by their mode carry
   * `credited: true` and are skipped. Missing services / fields are no-ops, so
   * this never throws.
   * @param {import('./contract.js').MiniGameResult} [result]
   */
  creditResult(result) {
    if (!result || result.credited) return;
    const { economy, progression, achievements } = this.host || {};
    if (result.salvage && economy) economy.earn({ salvage: result.salvage });
    if (result.stats && progression) {
      progression.recordRun({ runStats: result.stats.summary, runDelta: result.stats.delta });
    }
    if (Array.isArray(result.achievements) && achievements) {
      for (const id of result.achievements) achievements.unlock(id);
    }
  }

  /**
   * Add a MiniGame to the roster (keyed by its `id`). An optional contract-v1
   * manifest is validated here and refused loudly on mismatch, so a broken
   * manifest fails at boot rather than at some later frame. Registering without
   * a manifest stays supported (and yields the unrestricted Host).
   * @param {import('./contract.js').MiniGame} minigame
   * @param {*} [manifest]
   */
  register(minigame, manifest) {
    if (manifest) {
      assertManifest(manifest, { grandfathered: GRANDFATHERED });
      if (manifest.id !== minigame.id) {
        throw new Error(
          `Core.register: manifest id '${manifest.id}' does not match minigame id '${minigame.id}'`);
      }
      this.manifests.set(minigame.id, manifest);
      this._hosts.set(minigame.id, restrictHost(this.host, manifest.capabilities));
    }
    this.registry.set(minigame.id, minigame);
    return this;
  }

  /** The registered manifest for `id`, or undefined if it registered without one. */
  manifestFor(id) { return this.manifests.get(id); }

  /** The Host a minigame receives: capability-restricted when it declared a
   *  manifest, the full Host otherwise. */
  _hostFor(id) {
    const h = this._hosts.get(id);
    return h === undefined ? this.host : h;
  }

  /** Registered minigames' identity for the About screen: id, display name,
   *  and version (falling back to the id / '—' when a minigame omits them). */
  versions() {
    return [...this.registry.values()].map((m) => ({
      id: m.id, name: m.name || m.id, version: m.version || '—',
    }));
  }

  /** Activate a registered mode by id and hand it the Host via enter(). */
  boot(id) {
    const mg = this.registry.get(id);
    if (!mg) throw new Error(`Core.boot: no minigame registered as '${id}'`);
    this._stack = [mg];
    mg.enter(this._hostFor(mg.id));
    return mg;
  }

  /** Queue pushing minigame `id` onto the stack (applied next frame). An
   *  optional `ctx` is forwarded to the mode's enter(host, ctx). */
  open(id, ctx) { this._pending = { op: 'open', id, ctx }; }

  /** Queue popping the top minigame, crediting `result` (applied next frame). */
  close(result) { this._pending = { op: 'close', result }; }

  /** Apply a queued open/close at the frame boundary. */
  _applyPending() {
    const p = this._pending;
    if (!p) return;
    this._pending = null;
    if (p.op === 'open') {
      const mg = this.registry.get(p.id);
      if (!mg) throw new Error(`Core.open: no minigame registered as '${p.id}'`);
      this._stack.push(mg);
      mg.enter(this._hostFor(mg.id), p.ctx);
    } else if (p.op === 'close') {
      if (this._stack.length <= 1) return;          // never pop the base
      const mg = this._stack.pop();
      const result = mg.exit ? mg.exit() : p.result;
      if (result) this.creditResult(result);
    }
  }

  /** Advance the active mode one frame. No-op before boot. */
  update(dt) {
    this._applyPending();
    const a = this.active;
    if (a) a.update(dt);
  }

  /** Draw the active mode. No-op before boot. */
  render(ctx) {
    const a = this.active;
    if (a) a.render(ctx);
  }

  /**
   * End the active mode: call its exit(), route any result through
   * creditResult, and return the result. Safe when there's no active mode or
   * the mode has no exit().
   */
  exitActive() {
    const mg = this.active;
    if (!mg) return undefined;
    const result = mg.exit ? mg.exit() : undefined;
    if (result) this.creditResult(result);
    return result;
  }
}
