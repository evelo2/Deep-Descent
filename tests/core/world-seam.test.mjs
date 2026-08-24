// The DiverWorld engine seam (Phase 3): a REAL Game constructed with the engine
// sources its diver/camera/air FROM the engine — same object, same values, both
// directions — so host.world genuinely owns the diver world. Post-P6 the diver is
// CONSTRUCTED by the reef MiniGame (not the shell), and _placeDiver lives on the
// reef — but the shell's own camX/camY/air/airMax accessors still route to the
// engine (main.js reads game.camX). Run: node tests/core/world-seam.test.mjs

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

// --- Two-way routing for the primitives on the SHELL's accessors (air/airMax/camX/camY). ---
game.airMax = 123;
check('game.airMax write → world.airMax', world.airMax === 123);
world.air = 45;
check('world.air → game.air read', game.air === 45);
game.camX = 7; game.camY = 9;
check('game.camX/camY write → world', world.camX === 7 && world.camY === 9);
world.camX = 99;
check('world.camX → game.camX read', game.camX === 99);

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
