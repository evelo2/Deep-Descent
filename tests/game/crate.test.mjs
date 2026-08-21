// Supply-crate loot table: crates should MOSTLY refill staples (harpoons/air)
// and only RARELY grant a weapon or a consumable buff. Tests the pure weighted
// picker and asserts the resulting distribution matches that intent.
// Run: node tests/game/crate.test.mjs

import { pickWeighted, CRATE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// Evenly sample r∈[0,1) and tally the outcomes for a given `allowed` mask.
function tally(weights, allowed, n = 10000) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const k = pickWeighted(weights, allowed, (i + 0.5) / n);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

const ALL = { harpoons: true, air: true, flares: true, gold: true, consumable: true, weapon: true };

// --- Proportionality ---
{
  const t = tally(CRATE.weights, ALL);
  const total = 10000;
  for (const k of Object.keys(CRATE.weights)) {
    const expect = CRATE.weights[k] / Object.values(CRATE.weights).reduce((a, b) => a + b, 0);
    const got = (t[k] || 0) / total;
    check(`${k} share ≈ its weight (${(expect * 100).toFixed(0)}%)`, Math.abs(got - expect) < 0.01);
  }
}

// --- Intent: staples common, weapon/consumable rare ---
{
  const t = tally(CRATE.weights, ALL);
  const staples = (t.harpoons + t.air) / 10000;
  const weapon = (t.weapon || 0) / 10000;
  const consumable = (t.consumable || 0) / 10000;
  check('harpoons + air are the majority of crates', staples > 0.5);
  check('a weapon is a rare crate result (<15%)', weapon < 0.15);
  check('a consumable is a rare crate result (<15%)', consumable < 0.15);
  check('weapons are rarer than the staples', weapon < t.harpoons / 10000 && weapon < t.air / 10000);
}

// --- Availability gating + weight redistribution ---
{
  // No weapon available and no consumable: those weights redistribute to the rest.
  const allowed = { harpoons: true, air: true, flares: true, gold: true, consumable: false, weapon: false };
  const t = tally(CRATE.weights, allowed);
  check('never returns a disallowed outcome (weapon)', !t.weapon);
  check('never returns a disallowed outcome (consumable)', !t.consumable);
  check('allowed outcomes still cover every roll', (t.harpoons + t.air + t.flares + t.gold) === 10000);
}

// --- Nothing allowed → null (caller falls back to gold) ---
{
  check('all-disallowed returns null', pickWeighted(CRATE.weights, {}, 0.5) === null);
  check('empty weights returns null', pickWeighted({}, ALL, 0.5) === null);
}

// --- Roll clamping ---
{
  check('r below 0 is clamped (returns a valid key)', Object.keys(CRATE.weights).includes(pickWeighted(CRATE.weights, ALL, -5)));
  check('r at/above 1 is clamped (returns a valid key)', Object.keys(CRATE.weights).includes(pickWeighted(CRATE.weights, ALL, 1)));
}

console.log(`crate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
