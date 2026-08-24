// The DiverWorld engine seam (Phase 3): a REAL Game constructed with the engine
// sources its diver/camera FROM the engine — same object, same values, both
// directions — so host.world genuinely owns the diver world. Post-P6 the diver is
// CONSTRUCTED by the reef MiniGame (not the shell), and _placeDiver lives on the
// reef. Post-P7 the shell keeps ONLY the accessors it still reads directly —
// camX/camY (main.js reads game.camX for ambient bubbles) + diver (touch-button
// geometry); the air/airMax shell shims were dropped (the reef reads air through
// its own accessors; the engine's air ownership is covered by core/world.test.mjs).
// Run: node tests/core/world-seam.test.mjs

// Minimal DOM/storage stubs — the Game constructor reads localStorage and guards
// document.getElementById; it calls NO methods on input/audio/particles/bg/ctx.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null };

import { Game } from '../../src/game.js';
import { WORLD } from '../../src/config.js';
import { makeDiverWorld } from '../../src/core/world/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const stub = {};   // inert dep — the constructor never calls into these
// Minimal Core services so the reef MiniGame builds (it owns diver construction now).
const services = {
  economy: { state: { salvage: 0, loadout: [] }, earn() {} },
  progression: { badges: {}, stats: {}, progress: {} },
  achievements: { unlock() {} },
};
const world = makeDiverWorld({ viewport: WORLD });
const game = new Game(stub, stub, stub, stub, stub, services, world);

// --- Identity: the game's diver IS the engine's diver (accessor, not a copy) —
// the reef constructed it into the engine, the shell reads it back through host.world.
check('game.diver === world.diver (same object)', game.diver === world.diver);
check('the diver was constructed into the engine (by the reef)', game.diver && typeof game.diver.x === 'number');

// --- Two-way routing for the camera primitives the shell still owns (camX/camY). ---
game.camX = 7; game.camY = 9;
check('game.camX/camY write → world', world.camX === 7 && world.camY === 9);
world.camX = 99;
check('world.camX → game.camX read', game.camX === 99);

// --- The air/airMax shell shims were removed in P7: the shell no longer routes
// them (nothing on the shell reads air). Writing game.air must NOT leak into the
// engine — it is a plain own-property now, proving the shim was truly dropped. ---
game.air = 3;
check('game.air is NOT wired to the engine (shim dropped in P7)', world.air !== 3);

// --- _placeDiver (now on the reef) delegates to the engine: shared diver moved. ---
game._reef._placeDiver(1380, 300, 5);
check('_placeDiver moved the shared diver', world.diver.x === 1380 && world.diver.vx === 5);
check('_placeDiver clamped camX via the engine', world.camX === 930 && game.camX === 930);
check('_placeDiver clamped camY via the engine (top)', world.camY === 0);

// --- A fresh reference world stays isolated (no shared module state). ---
const world2 = makeDiverWorld({ viewport: WORLD });
check('a second engine is independent', world2.diver === null && world2 !== world);

console.log(`world-seam: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
