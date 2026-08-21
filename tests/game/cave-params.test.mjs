// Per-reef cave scaling: deeper reefs carve more routes (parallel descent
// shafts), longer tunnels, and more forks — a sprawling multi-route map instead
// of one corridor. Run: node tests/game/cave-params.test.mjs
import { caveParams, CAVE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- reef 1 is exactly the baseline: 1 shaft + (CAVE.miners−1) wanderers = the
//     original 5 miners, same steps/branch (no change for early reefs). ---
{
  const p = caveParams(1);
  check('reef 1: a single descent shaft', p.shafts === 1);
  check('reef 1: wanderers = CAVE.miners − 1', p.wanderers === CAVE.miners - 1);
  check('reef 1: shafts + wanderers = original miner count', p.shafts + p.wanderers === CAVE.miners);
  check('reef 1 steps = baseline', p.steps === CAVE.minerSteps);
  check('reef 1 branch = baseline', Math.abs(p.branch - CAVE.branchChance) < 1e-9);
}

// --- monotonic growth: more routes, longer tunnels, more forks the deeper you go ---
{
  let okShaft = true, okWander = true, okSteps = true, okBranch = true;
  for (let r = 1; r < 14; r++) {
    const a = caveParams(r), b = caveParams(r + 1);
    if (b.shafts < a.shafts) okShaft = false;
    if (b.wanderers < a.wanderers) okWander = false;
    if (b.steps < a.steps) okSteps = false;
    if (b.branch < a.branch) okBranch = false;
  }
  check('shafts (routes) non-decreasing', okShaft);
  check('wanderers non-decreasing', okWander);
  check('steps strictly grow', okSteps);
  check('branch non-decreasing', okBranch);
  check('deep reef has MORE routes than reef 1', caveParams(10).shafts > caveParams(1).shafts);
  check('deep reef has more wanderers than reef 1', caveParams(10).wanderers > caveParams(1).wanderers);
  check('deep reef has longer tunnels', caveParams(10).steps > caveParams(1).steps);
  check('deep reef forks more often', caveParams(10).branch > caveParams(1).branch);
}

// --- clamps: never runaway ---
{
  const deep = caveParams(50);
  check('shafts clamp at 5', deep.shafts === 5);
  check('wanderers clamp at CAVE.minerCap', deep.wanderers === CAVE.minerCap);
  check('branch clamps at CAVE.branchMax', Math.abs(deep.branch - CAVE.branchMax) < 1e-9);
  check('concurrentCap clamps at 120', deep.concurrentCap === 120);
}

// --- robustness: bad input falls back to reef 1 baseline ---
{
  for (const [label, v] of [['reef 0', 0], ['undefined', undefined], ['NaN', NaN]]) {
    const p = caveParams(v);
    check(`${label} → baseline`, p.shafts === 1 && p.wanderers === CAVE.miners - 1 && p.steps === CAVE.minerSteps);
  }
}

console.log(`cave-params: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
