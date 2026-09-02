// The Depth Valve (shop item) holds pressure below its line: deeper than
// VALVE.holdDepthM the DEPTH TERM of the air drain stops growing, so the world
// floor costs the same air as the valve's line. The baseline breath and every
// drain multiplier (reef penalty, abyss 150%, wetsuit, extraction lapse) are
// untouched — the valve only clamps the depth the pressure is charged at.
// Pure function, shared by update() + this test. Run: node tests/game/valve-air.test.mjs

// Cave's constructor touches the DOM; the shop checks below drive hand-built
// stubs so no world-gen runs, but importing the reef still needs the stub the
// other reef-side tests use. Mirror abyss-air's.
globalThis.document = {
  createElement: () => {
    const ctx = {
      fillRect() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      translate() {}, scale() {}, rotate() {}, drawImage() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {}, quadraticCurveTo() {}, strokeRect() {},
    };
    return { width: 0, height: 0, getContext: () => ctx };
  },
};

import { Reef } from '../../src/minigames/reef/index.js';
import { AIR, DEPTH, VALVE, crushDepthM, valveDiscount, airDepthTerm } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const near = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

// --- crush depth: one Valve level per world tier ---------------------------
check('no valve crushes at 400 m',  crushDepthM(0) === 400);
check('Lv1 crushes at 720 m',       crushDepthM(1) === 720);
check('Lv2 crushes at 1160 m',      crushDepthM(2) === 1160);
check('Lv3 crushes at 1820 m',      crushDepthM(3) === 1820);
check('each level reaches its tier floor: Lv1 clears 700 m', crushDepthM(1) > 700);
check('Lv2 clears the 1150 m floor',  crushDepthM(2) > 1150);
check('Lv3 clears the 1800 m floor',  crushDepthM(3) > 1800);
check('no valve does NOT clear the 700 m tier-2 floor', crushDepthM(0) < 700);

// --- clamps: a corrupt level must never crash a dive -----------------------
check('level 4 clamps to Lv3',    crushDepthM(4) === crushDepthM(3));
check('level -1 clamps to Lv0',   crushDepthM(-1) === crushDepthM(0));
check('NaN clamps to Lv0',        crushDepthM(NaN) === crushDepthM(0));
check('undefined clamps to Lv0',  crushDepthM(undefined) === crushDepthM(0));

// --- the oxygen line steepens the depth term, and only below 250 m ---------
check('the oxygen line sits at 250 m', DEPTH.oxygenLineM === 250);
check('the steepening factor is 1.6',  DEPTH.oxygenSteepen === 1.6);
check('the crush timer is 14 s', DEPTH.crushTimer === 14);
check('the timer recovers at 1 s per 1.5 s of safe water', DEPTH.crushRecoverRatio === 1.5);
check('the gauge starts warning 40 m above crush depth', DEPTH.approachWarnM === 40);
const perM = AIR.drainDepthFactor * 10;
check('above the line the term is the unchanged linear rate',
  near(airDepthTerm(100, 0), 100 * perM));
check('at the line exactly, still linear',
  near(airDepthTerm(250, 0), 250 * perM));
check('below the line the marginal rate is 1.6x',
  near(airDepthTerm(350, 0) - airDepthTerm(250, 0), 100 * perM * 1.6));
check('the term is monotonic in depth', airDepthTerm(800, 0) > airDepthTerm(400, 0));

// --- the tier-floor costs the discount ladder is sized against -------------
check('unvalved at 400 m costs ~3.5/s',      near(airDepthTerm(400, 0), 3.53, 0.05));
check('Lv1 at the 700 m tier-2 floor ~4.2/s', near(airDepthTerm(700, 1), 4.19, 0.05));
check('Lv2 at the 1150 m tier-3 floor ~4.5/s', near(airDepthTerm(1150, 2), 4.50, 0.05));
check('Lv3 at the 1800 m tier-4 floor ~4.7/s', near(airDepthTerm(1800, 3), 4.72, 0.05));
check('a properly equipped diver pays about the same at every tier floor',
  Math.max(airDepthTerm(400, 0), airDepthTerm(700, 1), airDepthTerm(1150, 2), airDepthTerm(1800, 3)) -
  Math.min(airDepthTerm(400, 0), airDepthTerm(700, 1), airDepthTerm(1150, 2), airDepthTerm(1800, 3)) < 1.3);

// --- parity with the shipped 2026-09-01 clamp, where it was tuned ----------
// The old valve clamped the depth term at VALVE.holdDepthM (150 m), charging
// 150 * 10 * drainDepthFactor = 1.08/s at any depth below it.
const oldClamped = VALVE.holdDepthM * 10 * AIR.drainDepthFactor;
check('Lv1 at 240 m stays within 5% of the clamp it replaces',
  Math.abs(airDepthTerm(240, 1) - oldClamped) / oldClamped < 0.05);
// At the old 411 m floor the numbers DELIBERATELY diverge — the oxygen line
// raised the unvalved cost there too, so the valve's share of the saving falls
// from 34% to 23%. Pinned as a new number, not as parity (see the spec).
check('Lv1 at the old 411 m floor is the new pinned 2.19/s',
  near(airDepthTerm(411, 1), 2.19, 0.05));
check('and that is still a real saving over no valve at all',
  airDepthTerm(411, 1) < airDepthTerm(411, 0) * 0.65);

// --- the discounts themselves ---------------------------------------------
check('no valve discounts nothing', valveDiscount(0) === 0);
check('the discount grows with every level',
  valveDiscount(1) < valveDiscount(2) && valveDiscount(2) < valveDiscount(3));
check('even Lv3 never makes depth free', valveDiscount(3) < 1);
check('a discounted term is always cheaper than an undiscounted one',
  airDepthTerm(1000, 2) < airDepthTerm(1000, 0));

console.log(`valve-air: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
