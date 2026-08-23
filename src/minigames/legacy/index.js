// The legacy MiniGame — the entire current Deep Descent (the reef world and all
// its zones) wrapped, untouched, as a single MiniGame plugged into the Core.
// This is the strangler-fig anchor: in Phase 1 the platform boots and drives the
// real game *through* the contract with ZERO behavior change. Later phases carve
// individual zones out of `Game` into their own MiniGames; whatever remains keeps
// running here until the reef itself is extracted (Phase 5).
//
// The wrapper constructs and holds the `Game` instance. `Game` already owns its
// own ctx (used by draw()) and polls input each frame, so:
//   - enter()  is a no-op — Game boots itself to the menu on construction.
//   - update() delegates straight to Game.update(dt).
//   - render() calls Game.draw() (Game draws with the ctx it was built with; the
//     ctx handed to render is the same one, so nothing changes).
//   - exit()   reports the terminal state as the outcome (real rewards flow
//              through the Host in Phase 2).
// `.game` is exposed so the boot layer (main.js) can keep its input-event
// wiring pointed at the live instance until input is formalized in a later phase.

import { Game } from '../../game.js';

/**
 * @param {Object} deps
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {*} deps.input
 * @param {*} deps.audio
 * @param {*} deps.particles
 * @param {*} deps.background
 * @param {*} [deps.economy]       Core wallet service (Phase 2).
 * @param {*} [deps.progression]   Core badges/stats/tiers service (Phase 2).
 * @param {*} [deps.achievements]  Core Steam-bridge service (Phase 2).
 * @param {*} [deps.world]         DiverWorld engine (Phase 3) — the game's diver/
 *                                 camera/air become engine-owned (host.world).
 * @returns {import('../../core/contract.js').MiniGame & { game: Game }}
 */
export function createLegacyMiniGame({ ctx, input, audio, particles, background, economy, progression, achievements, world }) {
  // Phase 2: hand the game the Core services so its meta state (wallet, badges,
  // stats, tiers) IS the Core's — one shared economy. The game keeps crediting
  // inline in its own _gameOver (it persists mid-run and shows badges instantly,
  // and nothing routes its exit() yet), so those services are the very objects
  // it mutates. `services` is only passed when all three are present.
  const services = economy && progression && achievements ? { economy, progression, achievements } : undefined;
  const game = new Game(ctx, input, audio, particles, background, services, world);
  return {
    id: 'legacy',
    game,
    enter(_host) { /* Game self-boots to the menu; nothing to do here. */ },
    update(dt) { game.update(dt); },
    render(_ctx) { game.draw(); },
    // A report-only MiniGameResult: the game has ALREADY self-credited this run
    // through the shared services, so `credited` tells Core.creditResult to skip
    // it (no double-count). outcome maps the terminal state; a still-'playing'
    // state means an early bail-out.
    exit() {
      const outcome = game.state === 'playing' ? 'bailed' : (game.won ? 'won' : 'lost');
      return { outcome, score: game.score, reef: game.reef, credited: true };
    },
  };
}
