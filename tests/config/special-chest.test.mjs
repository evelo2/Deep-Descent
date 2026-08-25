// specialChestChance: 5% at reef 1, +2.5pp/reef, capped at 25%; a Dry Dock
// boost adds +20pp up to a 45% boosted cap. Pure — no rng.
import { SPECIAL_CHEST, specialChestChance, GUARDIAN } from '../../src/config.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

check(near(specialChestChance(1, false), 0.05), 'reef 1 = 5%');
check(near(specialChestChance(2, false), 0.075), 'reef 2 = 7.5%');
check(near(specialChestChance(9, false), 0.25), 'reef 9 hits the 25% cap');
check(near(specialChestChance(20, false), 0.25), 'far reefs stay capped at 25%');
check(near(specialChestChance(1, true), 0.25), 'reef 1 boosted = 5% + 20pp');
check(near(specialChestChance(9, true), 0.45), 'reef 9 boosted hits the 45% cap');
check(near(specialChestChance(20, true), 0.45), 'boosted stays capped at 45%');
check(SPECIAL_CHEST.minDepthFrac > 0.6 && SPECIAL_CHEST.minDepthFrac < 0.7, 'depth gate is the last third');
check(GUARDIAN.hp > 0 && GUARDIAN.killBonus > 0 && GUARDIAN.range > 0, 'guardian constants are positive');
console.log(`ok special-chest.test.mjs (${pass} checks)`);
