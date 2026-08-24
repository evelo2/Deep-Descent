// Regression (Phase 7): the shell's _syncTouchButtons() computes the in-play
// on-screen buttons from the dive run-state (zone/boat/carried/weapons/…). Phase 6
// moved that state into the reef MiniGame, but this method kept reading it off the
// shell — where it is undefined. On a touch device that meant `this.weapons.length`
// threw a TypeError every frame while playing (and sail/shop/weapon/flare/torch/jump
// never rendered). This proves the reads now route through this._reef.
// Run: node tests/game/touch-buttons.test.mjs

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
// A TOUCH input: touchButtons is where _syncTouchButtons writes its hit-test list.
const input = { isTouch: true, touchButtons: [] };
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
reef.start(1);
game.state = 'playing';

// The run-state lives on the reef, NOT the shell — the exact split that broke this.
check('shell does not hold the run-state (weapons/zone/carried)',
  game.weapons === undefined && game.zone === undefined && game.carried === undefined);
check('reef owns the run-state', Array.isArray(reef.weapons) && typeof reef.zone === 'string');

// Core regression: syncing touch buttons while playing must NOT throw (pre-fix,
// this.weapons.length dereferenced undefined) and must populate gameplay buttons.
let threw = null;
try { game._syncTouchButtons(); } catch (e) { threw = e; }
check('_syncTouchButtons does not throw on touch while playing', threw === null);
const ids = () => game._touchBtns.map((b) => b.id);
check('the FIRE (aim) button is present while playing on touch', ids().includes('aim'));
check('pause + mute buttons present', ids().includes('pause') && ids().includes('mute'));

// Sail + shop are gated on reef geometry: force the "at the boat, hold empty,
// ready to sail" situation and confirm both buttons appear (they read r.*).
reef.zone = 'reef';
reef.carried = 0;
reef.relicBanked = true;             // makes the canSail getter true
reef.boat = { contains: () => true };
game._syncTouchButtons();
check('sail button appears at the boat when ready to sail', ids().includes('sail'));
check('shop button appears at the boat when hold is empty', ids().includes('shop'));

// And they vanish once carrying loot (still no throw — routing is live).
reef.carried = 3;
game._syncTouchButtons();
check('sail/shop hidden while carrying loot', !ids().includes('sail') && !ids().includes('shop'));

console.log(`touch-buttons: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
