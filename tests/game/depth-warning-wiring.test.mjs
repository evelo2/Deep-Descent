// Drives a REAL Game/reef (not just warnKindFor in isolation) through a
// first-encounter depth warning: state flips to 'warn', the dive genuinely
// freezes (air/diver/crush-timer all stop), the seen flag persists before
// dismissal, dismissal resumes play, and a still-owed second warning queues
// rather than being lost. Same harness pattern as
// tests/game/open-ctx-chain.test.mjs — this project has been bitten before by
// a wiring bug that every unit test missed (the hoardcleared ctx-drop, dead
// for a year); that guard is the precedent for this one.
// Run: node tests/game/depth-warning-wiring.test.mjs

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
import { WORLD, crushDepthM } from '../../src/config.js';
import { makeDiverWorld } from '../../src/core/world/index.js';
import { metresDown } from '../../src/render/depthgauge.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ctx = mkCtx();
const input = { poll() {}, endFrame() {}, pressed: () => false, consumeStart: () => false, consumeButton: () => false, consumeTapFire: () => false, fireHeld: () => false, fireDown: () => false, vector: () => ({ x: 0, y: 0 }), aimVector: () => null, isTouch: false, hitButtonAt: () => null, pressButton() {}, _btnTouch: false };
const audio = new Proxy({}, { get: () => () => {} });
const particles = { update() {}, draw() {}, bubble() {}, sparkle() {}, burst() {}, ring() {}, spawn() {} };
const economy = { state: { salvage: 0, rentals: {}, slots: 3, loadout: [], reefRelics: {}, lifeMax: 6, seen: { oxygenLine: false, crushLine: false } }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } };
const progression = { badges: {}, stats: {}, progress: {} };
const achievements = { unlock() {} };
const world = makeDiverWorld({ viewport: WORLD });

const game = new Game(ctx, input, audio, particles, { draw() {} }, { economy, progression, achievements }, world);
const reef = game._reef;

reef.start(1);
check('reef starts in playing state', reef._shell.state === 'playing');

// Put the diver just inside the crush-warning band (valveLevel 0). This depth
// is also past the oxygen line, so both flags are owed — crush must win.
const targetDepthM = crushDepthM(0) - 5;
reef.diver.y = WORLD.SURFACE + targetDepthM * 10;
check('diver depth lands in the crush warning band', Math.abs(metresDown(reef.diver.y) - targetDepthM) < 0.01);

reef.update(1 / 60);   // the triggering frame

check('one update() flips the shell into warn state', reef._shell.state === 'warn');
check('the crush warning fired (outranks the milder oxygen one)', reef._warnKind === 'crushLine');
check('the crushLine seen flag was persisted at that instant, before dismissal', reef.meta.seen.crushLine === true);

// Snapshot AFTER the state is already 'warn' — this is the frozen baseline a
// further update() must not disturb.
const airFrozen = reef.air;
const yFrozen = reef.diver.y;
const crushFrozen = { ...reef._crush };

for (let i = 0; i < 5; i++) reef.update(1 / 60);   // a handful of frames is enough
check('air did not drain while the modal is up', reef.air === airFrozen);
check('the diver did not move while the modal is up', reef.diver.y === yFrozen);
check('the crush timer did not advance while the modal is up', reef._crush.t === crushFrozen.t && reef._crush.phase === crushFrozen.phase);

reef.onAction();
check('onAction() dismisses the modal back to playing', reef._shell.state === 'playing');

// The diver is still past the oxygen line, and it's still unseen: the next
// update() must queue THAT warning rather than silently resuming play.
reef.update(1 / 60);
check('the still-owed oxygen warning fires on the next update() (not lost)', reef._shell.state === 'warn' && reef._warnKind === 'oxygenLine');
check('the oxygenLine seen flag was persisted too', reef.meta.seen.oxygenLine === true);

reef.onAction();
check('dismissing the second modal also resumes play', reef._shell.state === 'playing');

// Both flags are now set — no further warning should ever fire again, even
// across several more frames at the same lethal depth.
for (let i = 0; i < 3; i++) reef.update(1 / 60);
check('with both flags set, no further warning ever fires', reef._shell.state === 'playing');

// --- Touch dismissal: the modal must be genuinely dismissable on touch ------
// This project has frozen touch devices twice before (see CLAUDE.md gotchas)
// precisely because a mouse-only pass missed device-specific wiring — the
// gameplay touch buttons and main.js's touchstart shortcut both skip the
// 'warn' state, so a touch player had NO way to reach _warnScreen's own
// "Tap to continue" prompt. A fresh Game/reef with isTouch:true drives the
// real trigger, then simulates a genuine tap the same way main.js's
// mousedown/touchstart handlers resolve one: hitButtonAt() finds whatever rect
// _syncTouchButtons published for this frame's state, pressButton() registers
// it, and the reef's update() consumes it via consumeButton() next frame.
const touchBtnHits = new Set();
const touchInput = {
  poll() {}, endFrame() { touchBtnHits.clear(); }, pressed: () => false, consumeStart: () => false,
  consumeTapFire: () => false, fireHeld: () => false, fireDown: () => false,
  vector: () => ({ x: 0, y: 0 }), aimVector: () => null,
  isTouch: true, touchButtons: [], _btnTouch: false,
  hitButtonAt(x, y) {
    for (const b of this.touchButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  },
  pressButton(id) { touchBtnHits.add(id); },
  consumeButton(id) { if (touchBtnHits.has(id)) { touchBtnHits.delete(id); return true; } return false; },
};
const touchEconomy = { state: { salvage: 0, rentals: {}, slots: 3, loadout: [], reefRelics: {}, lifeMax: 6, seen: { oxygenLine: false, crushLine: false } }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } };
const touchGame = new Game(mkCtx(), touchInput, audio, particles, { draw() {} },
  { economy: touchEconomy, progression: { badges: {}, stats: {}, progress: {} }, achievements: { unlock() {} } },
  makeDiverWorld({ viewport: WORLD }));
const touchReef = touchGame._reef;

touchReef.start(1);
touchReef.diver.y = WORLD.SURFACE + (crushDepthM(0) - 5) * 10;
touchReef.update(1 / 60);   // the triggering frame
check('touch: one update() flips the shell into warn state', touchReef._shell.state === 'warn');

// A further update() runs _syncTouchButtons with the CURRENT ('warn') state
// (the triggering frame above synced buttons for the OLD 'playing' state,
// before the trigger fired later in that same frame).
touchReef.update(1 / 60);
const warnRect = touchInput.touchButtons.find((b) => b.id === 'warnclose');
check('touch: a dismiss rect is published for the warn modal', !!warnRect);
check('touch: the rect covers the whole screen (tap-anywhere, like aboutclose)',
  !!warnRect && warnRect.x === 0 && warnRect.y === 0 && warnRect.w === WORLD.W && warnRect.h === WORLD.H);

const hit = touchInput.hitButtonAt(WORLD.W / 2, WORLD.H / 2);   // a tap anywhere on screen
check('touch: a tap anywhere on screen hits the dismiss rect', hit === 'warnclose');
touchInput.pressButton(hit);
touchReef.update(1 / 60);   // the reef consumes the button press and dismisses
check('touch: the tap genuinely returns the state to playing (no soft-lock)', touchReef._shell.state === 'playing');

console.log(`ok depth-warning-wiring.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
