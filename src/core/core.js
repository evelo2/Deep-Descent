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
    /** @type {import('./contract.js').MiniGame|null} */
    this.active = null;
  }

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

  /** Add a MiniGame to the roster (keyed by its `id`). */
  register(minigame) {
    this.registry.set(minigame.id, minigame);
    return this;
  }

  /** Activate a registered mode by id and hand it the Host via enter(). */
  boot(id) {
    const mg = this.registry.get(id);
    if (!mg) throw new Error(`Core.boot: no minigame registered as '${id}'`);
    this.active = mg;
    mg.enter(this.host);
    return mg;
  }

  /** Advance the active mode one frame. No-op before boot. */
  update(dt) {
    if (this.active) this.active.update(dt);
  }

  /** Draw the active mode. No-op before boot. */
  render(ctx) {
    if (this.active) this.active.render(ctx);
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
