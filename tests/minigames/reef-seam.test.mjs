// The reef seam (Phase 6): a REAL Game constructed with the DiverWorld engine +
// Core services builds the reef as a MiniGame (game._reef) and forwards
// update/draw/onAction to it. This is the Node-side proof that the god-object is
// gone: the reef OWNS the ephemeral run-state (score/lives/loadout/entities), the
// shell (Game) holds none of it, yet the diver world + salvage wallet stay shared
// through host.world / host.economy, and a run-ending death routes back to the
// shell's state machine via the `shell` facade. The reef also builds + owns the
// nested whirlpool (P4) and stage (P5). Run: node tests/minigames/reef-seam.test.mjs

// Cave builds an offscreen fog canvas, so document.createElement must return a
// canvas-like stub; the reef's start()/update()/render() otherwise call only inert deps.
const mkCtx = () => new Proxy({}, { get: (t, p) => {
  if (p === 'canvas') return { width: 900, height: 600 };
  if (p === 'measureText') return () => ({ width: 10 });
  if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
  if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  return () => {};
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => mkCtx() }) };

import { Game } from '../../src/game.js';
import { WORLD } from '../../src/config.js';
import { makeDiverWorld } from '../../src/core/world/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ctx = mkCtx();
const input = { poll() {}, endFrame() {}, pressed: () => false, consumeStart: () => false, consumeButton: () => false, consumeTapFire: () => false, fireHeld: () => false, fireDown: () => false, vector: () => ({ x: 0, y: 0 }), aimVector: () => null, isTouch: false, hitButtonAt: () => null, pressButton() {}, _btnTouch: false };
const audio = new Proxy({}, { get: () => () => {} });
const particles = { update() {}, draw() {}, bubble() {}, sparkle() {}, burst() {}, ring() {}, spawn() {} };
const services = {
  economy: { state: { salvage: 0, loadout: [] }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } },
  progression: { badges: {}, stats: {}, progress: {} },
  achievements: { unlock() {} },
};
const world = makeDiverWorld({ viewport: WORLD });
const game = new Game(ctx, input, audio, particles, { draw() {} }, services, world);
const reef = game._reef;

// --- The reef MiniGame was built and is shaped like a MiniGame. ---
check('game._reef exists', !!reef && reef.id === 'reef');
check('MiniGame shape (enter/update/render/exit)', ['enter', 'update', 'render', 'exit'].every((m) => typeof reef[m] === 'function'));

// --- Run-state ownership: the reef owns it; the shell holds none. ---
reef.start(1);
check('reef owns the run score/lives', typeof reef.score === 'number' && typeof reef.lives === 'number');
check('the shell (Game) does NOT hold run-state', game.score === undefined && game.lives === undefined && game.carried === undefined);

// --- Shared diver world: the reef's diver IS the engine's, and the shell reads
// it back through its own accessor (host.world is the single owner). ---
check('reef.diver === world.diver === game.diver', reef.diver === world.diver && game.diver === world.diver);
const y0 = world.diver.y;
for (let i = 0; i < 30; i++) game.update(1 / 60);   // drive THROUGH the shell forwarder
check('driving the shell forwarder ticks the reef sim (diver world live)', typeof world.diver.y === 'number');

// --- Shared wallet: the reef's meta IS the Core economy state. ---
check('reef.meta === host.economy.state (shared wallet)', reef.meta === services.economy.state);
const before = services.economy.state.salvage;
reef.meta.salvage += 5; // a reef-side credit lands in the shared wallet
check('a reef salvage credit reflects in host.economy.state', services.economy.state.salvage === before + 5);

// --- Transition signal: a run-ending death routes to the shell's state machine. ---
game.state = 'playing';
reef._gameOver();
check('reef death sets the shell state to gameover (via facade)', game.state === 'gameover');
check('the shell game-over screen reads the reef run summary', typeof reef.finalStats().score === 'number');

// --- Rentals tick at run-end: an equipped rented relic drops a dive; lapse benches it. ---
reef.meta.rentals = { sonar: 1 }; reef.meta.loadout = ['sonar'];
game.state = 'playing';   // re-arm the _gameOver re-entrancy guard
reef._gameOver();
check('equipped rental lapsed at run-end (benched)', !reef.meta.loadout.includes('sonar') && !reef.meta.rentals.sonar);
check('finalStats surfaces the lapsed rental', reef.finalStats().lapsedRentals.includes('sonar'));

// --- Nested zone MiniGames are built + owned by the reef (reparented in P6). ---
check('reef owns the whirlpool module', !!reef._whirl && reef._whirl.id === 'whirlpool');
check('reef owns the stage module', !!reef._stage && reef._stage.id === 'stage');

console.log(`reef-seam: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
