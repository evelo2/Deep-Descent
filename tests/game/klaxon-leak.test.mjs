// The klaxon must never outlive the alarm. update()'s crush block only runs
// for `zone === 'reef'` — every nested zone (stage, whirlpool) and every other
// reef zone (belly, temple, abyss) returns EARLY, several of them before the
// crush block is ever reached (see the `if (this.zone === 'stage') { ...;
// return; }` / `'whirlpool'` lines near the top of update()). If the klaxon
// were only driven from inside that block, a diver who was alarmed in the
// reef and then entered a stage or whirlpool would carry a blaring emergency
// klaxon through an entire unrelated minigame. The fix is one line at the very
// top of update() — before every early return in the function — that
// re-derives audio.setKlaxon fresh from `_shell.state === 'playing' &&
// zone === 'reef' && _crush.phase === 'alarmed'` every single frame, rather
// than toggling it once and trusting some later branch to turn it off again.
//
// Two things that line depends on turned out to have their own gaps (fix
// round 1):
//  - `_crush` used to be assigned only inside start(), never in the
//    constructor — but main.js's RAF loop calls update(dt) unconditionally
//    from frame one, while the shell is still at 'menu', long before start()
//    ever runs. Reading `this._crush.phase` before checking shell state threw.
//  - `_gameOver()` never touches `_crush`/`zone` — a death from any cause
//    OTHER than the crush timer itself (air, a creature) while merely
//    'alarmed' freezes `_crush` at 'alarmed' forever, since the crush block
//    that would otherwise step it back to safe is unreachable once the shell
//    leaves 'playing'. Gating the authoritative line on
//    `_shell.state === 'playing'` (checked FIRST, short-circuiting before
//    `_crush`/`zone` are even read) closes both: the pre-start() case (no
//    `_crush` read at all while state is 'menu') and every non-'playing'
//    death screen (game-over/pause/shop/menu).
//
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

const last = () => klaxonCalls[klaxonCalls.length - 1];

// --- CRITICAL: the real boot sequence calls update() before start() --------
// main.js boots the legacy minigame and runs an unconditional RAF loop
// calling update(dt) from frame one, while the shell is still at 'menu' —
// long before the player ever presses start. `_crush` must exist from
// construction (not just from start()) or this throws.
check('shell starts at menu, not playing', game.state === 'menu');
let threw = null;
try { reef.update(1 / 60); } catch (e) { threw = e; }
check('update() before start() does not throw', threw === null);
if (threw) console.error('  threw:', threw);
check('the klaxon never sounds before a run has begun', !klaxonCalls.includes(true));

// --- normal play -------------------------------------------------------------
reef.start(1);
game.state = 'playing';
check('a fresh run starts safe, not alarmed', reef._crush.phase === 'safe');

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
reef.zone = 'reef';

// --- docking (crushRecover) clears the alarm; the klaxon must follow --------
reef._crush = { phase: 'alarmed', t: 5 };
klaxonCalls.length = 0;
reef.update(1 / 60);
check('still alarmed sounds before recovery', last() === true);
reef._crush.phase = 'safe';   // exactly what crushRecover() does on docking
klaxonCalls.length = 0;
reef.update(1 / 60);
check('recovering to safe silences the klaxon', last() === false);

// --- crush death must not leave the horn sounding ----------------------------
// A 'crushed' diver failed the timer — the gate's phase check alone would
// already close this ('crushed' !== 'alarmed'), but shell state closes it too
// (see the NON-crush case below, where the phase check alone would NOT).
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

// --- CRITICAL: a NON-crush death while still merely 'alarmed' ---------------
// _gameOver() never touches _crush or zone. Die from a creature or from air
// while the crush countdown is running but has not yet expired — entirely
// plausible, a shark hit during the alarm — and `_crush.phase` freezes at
// 'alarmed' forever (the crush block that would otherwise recover it is
// unreachable once the shell leaves 'playing'). Only the shell-state gate
// closes this; the phase check alone does not, because the phase genuinely
// never changes.
reef._crush = { phase: 'alarmed', t: 5 };
reef.zone = 'reef';
reef.lives = -1000;   // force the very next hit to end the run outright
reef._loseLife('killed');   // a creature hit — NOT the crush timer
check('the death was not caused by crushing', reef.deathCause === 'killed');
check('game-over was reached', game.state === 'gameover');
check("_crush is still frozen at 'alarmed' — the exact bug this guards against",
  reef._crush.phase === 'alarmed');
klaxonCalls.length = 0;
for (let i = 0; i < 5; i++) reef.update(1 / 60);
check('the klaxon stays silent throughout the whole game-over screen',
  !klaxonCalls.includes(true));
game.state = 'playing';   // restore for the remaining checks below

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
