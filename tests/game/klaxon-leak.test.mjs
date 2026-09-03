// The klaxon must never outlive the alarm. update()'s crush block only runs
// for `zone === 'reef'` — every nested zone (stage, whirlpool) and every other
// reef zone (belly, temple, abyss) returns EARLY, several of them before the
// crush block is ever reached (see the `if (this.zone === 'stage') { ...;
// return; }` / `'whirlpool'` lines near the top of update()). If the klaxon
// were only driven from inside that block, a diver who was alarmed in the
// reef and then entered a stage or whirlpool would carry a blaring emergency
// klaxon through an entire unrelated minigame. The fix is one line at the very
// top of update() — before every early return in the function — that
// re-derives audio.setKlaxon fresh from `_crush.phase === 'alarmed' &&
// zone === 'reef'` every single frame, rather than toggling it once and
// trusting some later branch to turn it off again.
// This test forces the alarmed state directly and drives the REAL update()
// through each zone/lifecycle transition, watching only what reaches
// audio.setKlaxon — the state machine itself (crushStep/crushRecover) is
// covered by tests/game/crush-timer.test.mjs.
// Run: node tests/game/klaxon-leak.test.mjs

// Cave builds an offscreen fog canvas, so document.createElement must return a
// canvas-like stub (copied from tests/minigames/reef-seam.test.mjs).
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
import { WORLD, DEPTH } from '../../src/config.js';
import { makeDiverWorld } from '../../src/core/world/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ctx = mkCtx();
const input = { poll() {}, endFrame() {}, pressed: () => false, consumeStart: () => false, consumeButton: () => false, consumeTapFire: () => false, fireHeld: () => false, fireDown: () => false, vector: () => ({ x: 0, y: 0 }), aimVector: () => null, isTouch: false, hitButtonAt: () => null, pressButton() {}, _btnTouch: false };
// Every audio call is a no-op EXCEPT setKlaxon, which records what it was told.
const klaxonCalls = [];
const audio = new Proxy({}, { get: (t, p) => (p === 'setKlaxon' ? (on) => klaxonCalls.push(on) : () => () => {}) });
const particles = { update() {}, draw() {}, bubble() {}, sparkle() {}, burst() {}, ring() {}, spawn() {} };
const services = {
  economy: { state: { salvage: 0, loadout: [] }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } },
  progression: { badges: {}, stats: {}, progress: {} },
  achievements: { unlock() {} },
};
const world = makeDiverWorld({ viewport: WORLD });
const game = new Game(ctx, input, audio, particles, { draw() {} }, services, world);
const reef = game._reef;
check('game._reef exists', !!reef && reef.id === 'reef');

// Nested-zone physics are proved elsewhere (stage-seam / whirlpool-seam); stub
// them inert here so this test isolates exactly one thing: does update()'s own
// early return for these zones leak the klaxon.
reef._stage.update = () => {};
reef._whirl.update = () => {};

reef.start(1);
game.state = 'playing';
check('a fresh run starts safe, not alarmed', reef._crush.phase === 'safe');

const last = () => klaxonCalls[klaxonCalls.length - 1];

// --- alarmed in the reef sounds the horn -------------------------------------
reef._crush = { phase: 'alarmed', t: DEPTH.crushTimer };
reef.zone = 'reef';
klaxonCalls.length = 0;
reef.update(1 / 60);
check('alarmed in the reef sounds the klaxon', klaxonCalls.includes(true) && last() === true);

// --- entering a nested zone WHILE alarmed must silence it immediately -------
// This is the exact leak: update() returns early for these zones before ever
// reaching the crush block, so a toggle-only-inside-the-block implementation
// would leave the horn on for the whole nested minigame.
for (const zone of ['stage', 'whirlpool']) {
  reef._crush = { phase: 'alarmed', t: DEPTH.crushTimer };   // still alarmed, untouched
  reef.zone = zone;
  klaxonCalls.length = 0;
  reef.update(1 / 60);
  check(`entering ${zone} while alarmed silences the klaxon on the very next frame`,
    last() === false);
  // ...and it stays silenced for as long as the nested zone runs, however many
  // frames that takes — not just the one transition frame.
  reef.update(1 / 60); reef.update(1 / 60);
  check(`${zone} stays silent across further frames, not just the transition`,
    !klaxonCalls.includes(true));
}

// --- the non-reef `else` branch (belly / temple / abyss) also silences it ---
for (const zone of ['belly', 'temple', 'abyss']) {
  reef._crush = { phase: 'alarmed', t: DEPTH.crushTimer };
  reef.zone = zone;
  klaxonCalls.length = 0;
  reef.update(1 / 60);
  check(`${zone} while alarmed silences the klaxon`, last() === false);
}

// --- docking (crushRecover) clears the alarm; the klaxon must follow --------
reef._crush = { phase: 'alarmed', t: 5 };
reef.zone = 'reef';
klaxonCalls.length = 0;
reef.update(1 / 60);
check('still alarmed sounds before recovery', last() === true);
reef._crush.phase = 'safe';   // exactly what crushRecover() does on docking
klaxonCalls.length = 0;
reef.update(1 / 60);
check('recovering to safe silences the klaxon', last() === false);

// --- death / game-over must not leave the horn sounding ----------------------
// A 'crushed' diver failed the timer — 'crushed' !== 'alarmed', so the
// authoritative line already silences it regardless of shell state. (The real
// alarmed->crushed transition + _gameOver() plumbing is proved by
// tests/game/crush-timer.test.mjs and reef-seam.test.mjs; this test only needs
// to show the klaxon follows the resulting phase.)
reef._crush = { phase: 'crushed', t: 0 };
reef.zone = 'reef';
klaxonCalls.length = 0;
reef.update(1 / 60);
check('a crushed diver is not sounding the klaxon', last() === false);
game.state = 'gameover';
klaxonCalls.length = 0;
reef.update(1 / 60);
check('a game-over-state frame is not sounding the klaxon', last() === false);
game.state = 'playing';

// --- a new run starts safe, not carrying a prior alarm -----------------------
reef._crush = { phase: 'alarmed', t: 3 };   // simulate dying alarmed
reef.start(1);
check('start() resets the crush state machine itself, not just the klaxon',
  reef._crush.phase === 'safe');
game.state = 'playing';
klaxonCalls.length = 0;
reef.update(1 / 60);
check('a fresh run never sounds the klaxon', !klaxonCalls.includes(true));

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok klaxon-leak.test.mjs (${passed} checks)`);
