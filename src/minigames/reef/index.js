// The Reef — the core dive loop extracted as the main MiniGame (Phase 6; see
// docs/platform/migration-plan.md + the P6 design spec). This is the payoff of
// the strangler-fig migration: the reef dive loop, its three cave-reusing zones
// (abyss + mini-sub, temple, whale belly), and the extraction timer move out of
// the monolithic `game.js` god-object, leaving `game.js` as the Core shell
// (menu/router/screens/services). The reef also builds and owns the nested
// whirlpool (P4) and stage (P5) MiniGames.
//
// SHAPE: like the whirlpool/stage, a nested reef-driven MiniGame
// (id/enter/update/render/exit) — the shell delegates the in-dive tick/render to
// it. It is NOT Core.boot-ed this phase (promoting it to a Core-level registered
// MiniGame with the real host is deferred; see the spec §8).
//
// STATE OWNERSHIP: unlike the earlier zones, the reef OWNS the ephemeral run-state
// (score/gold/lives/carried, loadout, entity arrays, zone/sub state, extraction).
// Its methods use natural `this.x`. The shell's four run-coupled screens
// (shop/dry-dock/sail/game-over) read/act on it through this module's public
// surface (`this._reef.score`, `.shopBuy()`, `.finalStats()`, …).
//
// BOUNDARY:
//   host.world     — diver/camera/air (engine-owned, P3), installed as instance
//                    accessors on the Reef; host.economy/progression/achievements
//                    (the persistent meta spine — salvage/badges/Steam);
//                    host.audio/input/particles, host.viewport (live W/H).
//   shell          — the handful of shell-owned things the reef reaches back for:
//                    the top-level `state` (set on dive transitions), the
//                    `controlScheme` (HUD hints), and the persisted `hi`/`hiReef`
//                    best-record (menu displays them; reef updates at game-over).
//   ctx, bg        — the canvas 2D context + the Background renderer.

/**
 * @param {Object} deps
 * @param {import('../../core/contract.js').Host} deps.host  Shared services;
 *   requires the opt-in `world` capability + the economy/progression spine.
 * @param {Object} deps.shell  The shell facade (shell-owned state the reef reaches
 *   back for: state/controlScheme/hi/hiReef). Currently backed by the legacy Game.
 * @param {CanvasRenderingContext2D} deps.ctx  The canvas 2D context.
 * @param {Object} deps.bg  The Background renderer.
 * @returns {import('../../core/contract.js').MiniGame}
 */
export function makeReef({ host, shell, ctx, bg }) {
  return new Reef({ host, shell, ctx, bg });
}

class Reef {
  constructor({ host, shell, ctx, bg }) {
    this.id = 'reef';
    this.host = host;
    this._shell = shell;
    this.ctx = ctx;
    this.bg = bg;
    // (Task 2 ports the dive state + world accessors + nested whirl/stage here.)
  }

  // --- MiniGame shape (filled in by Task 2) ---
  enter(_host) {}
  update(_dt) {}
  render(_ctx) {}
  exit() {}
}
