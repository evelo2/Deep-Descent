// Deep Reefs world tiers: the world steps through four fixed sizes at reefs
// 4, 11 and 21, and stops growing at 40. Tier 1 must be byte-identical to the
// pre-Deep-Reefs world (2760 x 4200) — that is the regression anchor for the
// whole feature. Run: node tests/game/world-tiers.test.mjs

import { WORLD, WORLD_TIERS, worldTier, worldSize, setWorldSize, tier1FloorM } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- tier boundaries: the whole point of a stepped table -------------------
check('reef 1 is tier 0',   worldTier(1) === 0);
check('reef 3 is tier 0',   worldTier(3) === 0);
check('reef 4 steps to tier 1',  worldTier(4) === 1);
check('reef 10 is still tier 1', worldTier(10) === 1);
check('reef 11 steps to tier 2', worldTier(11) === 2);
check('reef 20 is still tier 2', worldTier(20) === 2);
check('reef 21 steps to tier 3', worldTier(21) === 3);
check('reef 40 is tier 3',       worldTier(40) === 3);
check('reef 41 stays tier 3 — 40 caps size, it is not an ending', worldTier(41) === 3);
check('reef 999 stays tier 3',   worldTier(999) === 3);

// --- clamps: world generation must never fail -----------------------------
check('reef 0 clamps to tier 0',        worldTier(0) === 0);
check('negative reef clamps to tier 0', worldTier(-5) === 0);
check('NaN clamps to tier 0',           worldTier(NaN) === 0);
check('undefined clamps to tier 0',     worldTier(undefined) === 0);
check('a fractional reef floors',       worldTier(4.9) === 1);

// --- the sizes themselves (value tests: change a number, fail a test) -----
check('tier 1 width is unchanged from main',  worldSize(1).WW === 2760);
check('tier 1 height is unchanged from main', worldSize(1).WH === 4200);
check('tier 2 is 3600 x 7090',  worldSize(4).WW === 3600 && worldSize(4).WH === 7090);
check('tier 3 is 4200 x 11590', worldSize(11).WW === 4200 && worldSize(11).WH === 11590);
check('tier 4 is 4800 x 18090', worldSize(21).WW === 4800 && worldSize(21).WH === 18090);

// --- the floors in metres, which is what the player actually experiences --
const floorM = (reef) => (worldSize(reef).WH - WORLD.SURFACE) / 10;
check('tier 1 floor is 411 m',  Math.round(floorM(1)) === 411);
check('tier 2 floor is 700 m',  Math.round(floorM(4)) === 700);
check('tier 3 floor is 1150 m', Math.round(floorM(11)) === 1150);
check('tier 4 floor is 1800 m', Math.round(floorM(21)) === 1800);
check('tier1FloorM matches the tier 1 floor', Math.round(tier1FloorM) === 411);

// --- every tier is strictly deeper AND wider than the one above it --------
for (let i = 1; i < WORLD_TIERS.length; i++) {
  check(`tier ${i + 1} is deeper than tier ${i}`, WORLD_TIERS[i].WH > WORLD_TIERS[i - 1].WH);
  check(`tier ${i + 1} is wider than tier ${i}`,  WORLD_TIERS[i].WW > WORLD_TIERS[i - 1].WW);
}

// --- setWorldSize mutates WORLD live (never captured at module scope) -----
setWorldSize(21);
check('setWorldSize(21) sets WORLD.WW live', WORLD.WW === 4800);
check('setWorldSize(21) sets WORLD.WH live', WORLD.WH === 18090);
setWorldSize(1);
check('setWorldSize(1) restores the tier 1 world', WORLD.WW === 2760 && WORLD.WH === 4200);

console.log(`ok world-tiers.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
