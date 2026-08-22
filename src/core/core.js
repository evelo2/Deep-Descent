// Core — the platform shell. It owns the roster of MiniGames, the active-mode
// pointer, the per-frame delegation (update/render), and the result→credit flow
// when a mode exits. It holds NO gameplay: modes implement the MiniGame
// contract and receive the Host facade on enter. See core/contract.js.
//
// Phase 1 posture: `creditResult` is injected but defaults to a no-op-with-hook
// (the reward pipeline is wired in Phase 2). Everything else is real, so the
// game can already boot and run *through* the Core with zero behavior change.

export class Core {
  /**
   * @param {Object} [opts]
   * @param {import('./contract.js').Host} [opts.host] Facade passed to each
   *        MiniGame on enter().
   * @param {(result: import('./contract.js').MiniGameResult) => void} [opts.creditResult]
   *        Credits a mode's exit result to the shared economy. Defaults to a
   *        no-op hook in Phase 1.
   */
  constructor({ host, creditResult } = {}) {
    this.host = host;
    this.creditResult = creditResult || (() => {});
    /** @type {Map<string, import('./contract.js').MiniGame>} */
    this.registry = new Map();
    /** @type {import('./contract.js').MiniGame|null} */
    this.active = null;
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
