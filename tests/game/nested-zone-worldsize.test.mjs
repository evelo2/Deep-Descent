// Deep Reefs bug: the temple, whale belly and abyss must be a FIXED size
// regardless of the host reef's tier. _generateWorld() calls setWorldSize(this.reef)
// and never resets it, so _generateTemple/_generateAbyss/_generateBelly built
// their Cave off the still-live tier-4 WORLD.WW/WH at reef 21 — a 4800x18090
// nested zone instead of the intended 2760x4200 baseline — while their value
// functions stayed fraction-of-WORLD.WH (so cost scaled and reward did not).
// Drives a REAL Game/reef through reef 21 -> each nested zone -> back, the
// same harness pattern as tests/game/depth-warning-wiring.test.mjs.
// Run: node tests/game/nested-zone-worldsize.test.mjs

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
import { Whale } from '../../src/entities/whale.js';
import { makeDiverWorld } from '../../src/core/world/index.js';

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

const BASE_WW = 2760, BASE_WH = 4200;   // tier 1 — the intended nested-zone baseline
const TIER4_WW = 4800, TIER4_WH = 18090;
const CELL = 60;
const gh = (wh) => Math.ceil(wh / CELL);

reef.start(21);
check('reef 21 generates the tier-4 world', WORLD.WW === TIER4_WW && WORLD.WH === TIER4_WH);
const reefCave = reef.cave;
check('the reef cave itself is tier-4 sized', reefCave.GH === gh(TIER4_WH));

// --- Temple ----------------------------------------------------------------
reef._enterTemple({ x: WORLD.WW / 2, y: WORLD.WH * 0.5 });
check('temple generates at baseline width',  WORLD.WW === BASE_WW);
check('temple generates at baseline height', WORLD.WH === BASE_WH);
check('the temple cave itself is baseline-sized (GH 70, not 302)', reef.cave.GH === gh(BASE_WH));
reef._exitTemple();
check('returning from the temple restores the tier-4 width',  WORLD.WW === TIER4_WW);
check('returning from the temple restores the tier-4 height', WORLD.WH === TIER4_WH);
check('returning from the temple restores the SAME tier-4 cave object', reef.cave === reefCave);
check('the restored reef cave is still tier-4 sized', reef.cave.GH === gh(TIER4_WH));

// --- Abyss -------------------------------------------------------------------
reef._enterAbyss({ x: WORLD.WW / 2, y: WORLD.WH * 0.5 });
check('abyss generates at baseline width',  WORLD.WW === BASE_WW);
check('abyss generates at baseline height', WORLD.WH === BASE_WH);
check('the abyss cave itself is baseline-sized', reef.cave.GH === gh(BASE_WH));
reef._exitAbyss();
check('returning from the abyss restores the tier-4 width',  WORLD.WW === TIER4_WW);
check('returning from the abyss restores the tier-4 height', WORLD.WH === TIER4_WH);
check('returning from the abyss restores the SAME tier-4 cave object', reef.cave === reefCave);

// --- Whale belly --------------------------------------------------------------
const whale = new Whale(WORLD.WW / 2, WORLD.WH * 0.5);
reef.whales.push(whale);
reef._enterWhale(whale);
check('belly generates at baseline width',  WORLD.WW === BASE_WW);
check('belly generates at baseline height', WORLD.WH === BASE_WH);
check('the belly cave itself is baseline-sized', reef.cave.GH === gh(BASE_WH));
reef._exitWhale();
check('returning from the belly restores the tier-4 width',  WORLD.WW === TIER4_WW);
check('returning from the belly restores the tier-4 height', WORLD.WH === TIER4_WH);
check('returning from the belly restores the SAME tier-4 cave object', reef.cave === reefCave);

// --- The camera clamp actually uses live WORLD.WW/WH after the round-trip --
// _placeDiver clamps camX/camY to WORLD.WW/WH - W/H; if those were left at
// baseline after restoring a tier-4 reef, the camera (and so the playable
// area) would be clamped to a fraction of the real cave — the "shrink" bug.
reef._placeDiver(WORLD.WW - 10, WORLD.WH - 10, 0);
check('the camera clamp reflects the restored tier-4 extents, not baseline',
  reef.camX > BASE_WW - 900 && reef.camY > BASE_WH - 600);

console.log(`ok nested-zone-worldsize.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
