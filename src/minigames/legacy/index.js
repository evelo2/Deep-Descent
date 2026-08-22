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
 * @returns {import('../../core/contract.js').MiniGame & { game: Game }}
 */
export function createLegacyMiniGame({ ctx, input, audio, particles, background }) {
  const game = new Game(ctx, input, audio, particles, background);
  return {
    id: 'legacy',
    game,
    enter(_host) { /* Game self-boots to the menu; nothing to do in Phase 1. */ },
    update(dt) { game.update(dt); },
    render(_ctx) { game.draw(); },
    exit() { return { outcome: game.state }; },
  };
}
