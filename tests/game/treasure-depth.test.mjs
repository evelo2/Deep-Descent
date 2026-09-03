// The deep economy: treasure GROWS with tier and MIGRATES downward, and its
// value keys off ABSOLUTE METRES rather than a fraction of world height (the
// old chestValue would have paid the same at 1800 m as at 411 m). Tier 1 must
// be untouched. Run: node tests/game/treasure-depth.test.mjs

import { TREASURE_TIER, treasureTier, treasureDepthWeight, chestValueAt, treasureValueMult, tier1FloorM } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- counts grow by tier, and tier 1 is exactly what main shipped ---------
check('tier 1 still scatters 40 loose treasures', treasureTier(1).loose === 40);
check('tier 1 still spreads 34 shells',           treasureTier(1).shells === 34);
check('tier 1 still seats 4 wrecks',              treasureTier(1).wrecks === 4);
check('tier 2 is richer', treasureTier(4).loose === 70 && treasureTier(4).shells === 50 && treasureTier(4).wrecks === 6);
check('tier 3 is richer still', treasureTier(11).loose === 110);
check('tier 4 is richest', treasureTier(21).loose === 160 && treasureTier(21).wrecks === 12);
for (let i = 1; i < TREASURE_TIER.length; i++) {
  check(`tier ${i + 1} has more loose treasure than tier ${i}`, TREASURE_TIER[i].loose > TREASURE_TIER[i - 1].loose);
}
// Counts must grow SLOWER than area (7.5x), so a deep reef reads as vast and
// sparse with its wealth concentrated, not as a pinata.
check('loose treasure grows slower than the world area does',
  TREASURE_TIER[3].loose / TREASURE_TIER[0].loose < 7.5);

// --- the downward migration ------------------------------------------------
check('tier 1 placement is uniform — the regression anchor',
  treasureDepthWeight(0.1, 1) === treasureDepthWeight(0.9, 1));
check('tier 2 favours the deep', treasureDepthWeight(0.9, 4) > treasureDepthWeight(0.1, 4));
check('the bias strengthens with every tier',
  treasureDepthWeight(0.1, 21) < treasureDepthWeight(0.1, 11) &&
  treasureDepthWeight(0.1, 11) < treasureDepthWeight(0.1, 4));
check('the deepest water is always the most favoured in a biased tier',
  treasureDepthWeight(1, 21) > treasureDepthWeight(0.5, 21));
check('a weight is always a usable probability', [0, 0.5, 1].every((f) =>
  [1, 4, 11, 21].every((r) => treasureDepthWeight(f, r) >= 0 && treasureDepthWeight(f, r) <= 1)));
check('the shallows are never worth literally nothing', treasureDepthWeight(0, 21) > 0);
check('out-of-range and junk fractions clamp',
  treasureDepthWeight(-1, 21) === treasureDepthWeight(0, 21) &&
  treasureDepthWeight(2, 21) === treasureDepthWeight(1, 21) &&
  treasureDepthWeight(NaN, 21) === treasureDepthWeight(0, 21));

// --- values rebase onto absolute metres ------------------------------------
check('a surface chest is still worth 200', chestValueAt(0) === 200);
check('a chest at the tier-1 floor is still worth exactly 600 — unchanged from main',
  chestValueAt(tier1FloorM) === 600);
check('a chest at the tier-4 floor pays far more than one at the tier-1 floor',
  chestValueAt(1800) > chestValueAt(411) * 2.5);
check('chest value rises monotonically with depth', chestValueAt(900) > chestValueAt(500));

check('loose treasure inside tier-1 depths is worth exactly what it always was',
  treasureValueMult(0) === 1 && treasureValueMult(200) === 1 && treasureValueMult(tier1FloorM) === 1);
check('below the tier-1 floor the multiplier opens up', treasureValueMult(900) > 1);
check('a gem at the tier-4 floor is worth several times a shallow one',
  treasureValueMult(1800) > 2.5);
check('the multiplier rises monotonically', treasureValueMult(1500) > treasureValueMult(1000));

console.log(`ok treasure-depth.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
