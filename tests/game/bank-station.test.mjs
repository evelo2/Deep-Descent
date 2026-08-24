// Regression test: the banking DECISION. The boat banks a haul at full value;
// a dive bell banks it at a depth-scaled discount (deeper bell = bigger cut) of
// BOTH score and gold — so carrying a deep haul up to the boat is a real gamble
// against the safe-but-lossy bell. Drives the real Reef.prototype._bankLoot()
// and the pure bellBankRate() formula.
// Run: node tests/game/bank-station.test.mjs

import { Reef } from '../../src/minigames/reef/index.js';
import { WORLD, BELL, GOLD, bellBankRate } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

const bank = Reef.prototype._bankLoot;

function stub(carried, carryingRelic = false) {
  return {
    carried, score: 0, gold: 0, reefBanked: 0, bankPulse: 0,
    carryingRelic, relicBanked: false,
    audio: { bank() {} },
    _bankLoot: bank,
  };
}

// --- bellBankRate formula: full-ish shallow, steeper the deeper you go. -------
{
  const shallowY = BELL.minDepthFrac * WORLD.WH;   // shallowest a bell can be
  const deepY = WORLD.WH;                          // world floor
  const rShallow = bellBankRate(shallowY);
  const rDeep = bellBankRate(deepY);
  check('shallow bell rate = 1 − bankDiscountMin', near(rShallow, 1 - BELL.bankDiscountMin));
  check('deep bell rate = 1 − bankDiscountMax', near(rDeep, 1 - BELL.bankDiscountMax));
  check('deeper bell pays strictly less', rDeep < rShallow);
  check('a mid bell sits between the two', (() => {
    const mid = bellBankRate((BELL.minDepthFrac + 1) / 2 * WORLD.WH);
    return mid < rShallow && mid > rDeep;
  })());
  check('rate is clamped to [1−max, 1−min] above the floor', near(bellBankRate(WORLD.WH * 2), 1 - BELL.bankDiscountMax));
  check('rate never exceeds full value', bellBankRate(0) <= 1);
}

// --- _bankLoot at the boat (rate 1): full value to score + gold. --------------
{
  const s = stub(1000);
  s._bankLoot();   // default rate = 1
  check('boat: full carried → score', s.score === 1000);
  check('boat: gold = carried × GOLD.rate', s.gold === Math.round(1000 * GOLD.rate));
  check('boat: reefBanked gets full value', s.reefBanked === 1000);
  check('boat: carried resets to 0', s.carried === 0);
}

// --- _bankLoot at a bell (rate < 1): discounts BOTH score and gold. -----------
{
  const rate = 0.7;
  const s = stub(1000);
  s._bankLoot(rate);
  const value = Math.round(1000 * rate);   // 700
  check('bell: score gets the discounted value', s.score === value);
  check('bell: gold is off the discounted value (not full)', s.gold === Math.round(value * GOLD.rate));
  check('bell: reefBanked (sail progress) is discounted too', s.reefBanked === value);
  check('bell: a discounted bank yields less than the boat would', value < 1000);
}

// --- Banking the relic completes the objective regardless of the discount. ----
{
  const s = stub(2000, true);   // carrying the relic
  s._bankLoot(0.65);            // banked at a deep bell
  check('relic banks the objective even at a bell discount', s.relicBanked === true);
  check('relic no longer carried after banking', s.carryingRelic === false);
  check('relic value is still discounted at the bell', s.score === Math.round(2000 * 0.65));
}

console.log(`bank-station: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
