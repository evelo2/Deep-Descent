// Reef-gated bonus-zone spawn curve (balance 2026-08-23): bonus-zone portals
// (temple/stage/abyss/whirlpool) are rare on early reefs and ramp with depth,
// capped — replacing three independent, non-gated rolls that stacked ~1.7
// portals/reef from reef 1. Run: node tests/game/bonus-zone-spawn.test.mjs

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null };

import { bonusZoneChance } from '../../src/minigames/reef/index.js';
import { GAME } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const near = (a, b) => Math.abs(a - b) < 1e-9;

const { base, perReef, cap } = GAME.bonusZone;

check('reef 1 is the base chance (rare)', near(bonusZoneChance(1), base));
check('reef 1 base is small (~2%)', bonusZoneChance(1) <= 0.05);
check('reef 2 = base + 1 step', near(bonusZoneChance(2), base + perReef));
check('reef 5 = base + 4 steps', near(bonusZoneChance(5), base + 4 * perReef));
check('the curve is monotonically increasing until the cap', bonusZoneChance(4) < bonusZoneChance(5) && bonusZoneChance(5) < bonusZoneChance(6));
check('deep reefs hit the cap', near(bonusZoneChance(100), cap));
check('never exceeds the cap', bonusZoneChance(50) <= cap && bonusZoneChance(9) <= cap);
check('reef 1 never negative / guarded below 1', bonusZoneChance(0) === base && bonusZoneChance(-3) === base);

console.log(`bonus-zone-spawn: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
