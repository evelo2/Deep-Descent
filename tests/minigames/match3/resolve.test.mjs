// tests/minigames/match3/resolve.test.mjs
import { applySwap, applyGravity, refill, findRuns } from '../../../src/minigames/match3/board.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
function grid(types, rng = () => 0) {
  return { cols: types[0].length, rows: types.length, types: 6, rng,
    tiles: types.map((row) => row.map((t) => ({ type: t, special: null }))) };
}

// wasted swap: no match → ok:false, no mutation
{
  const b = grid([[0, 1, 2], [3, 4, 5], [0, 1, 2]]);
  const before = JSON.stringify(b.tiles);
  const res = applySwap(b, 0, 0, 0, 1);
  check(res.ok === false, 'no-match swap is not ok');
  check(JSON.stringify(b.tiles) === before, 'wasted swap does not mutate');
}

// a swap that makes a 3-run clears, drops, refills, and reports counts
{
  // swapping (2,0)type0 with (2,1)type1 makes col0: rows0,1,2 = 1,1,1
  // (deviation from brief's literal fixture — see resolve.test.mjs history / task-3-report.md:
  // the brief's original grid + a constant rng=()=>0.99 caused an OOM-crashing infinite
  // cascade — refilling a fully-cleared column/row with a *constant* type always instantly
  // recreates the same run, and the original grid also produced a simultaneous double-column
  // match (6 cells, not 3). Fixed here at the arrange step only: a grid that matches exactly
  // one column, plus a small deterministic 3-value cycling rng so refills don't self-recreate
  // a run. All of the brief's asserted values below are unchanged.)
  let i = 0;
  const seq = [0.4, 0.55, 0.7];   // types 2,3,4 repeating — never 3 alike in a row
  const cyclingRng = () => seq[i++ % seq.length];
  const b = grid([
    [1, 3, 2],
    [1, 4, 2],
    [0, 1, 5],
  ], cyclingRng);
  const res = applySwap(b, 2, 0, 2, 1);
  check(res.ok === true, 'match swap ok');
  check(res.steps[0].kind === 'swap', 'first step is swap');
  const clear = res.steps.find((s) => s.kind === 'clear');
  check(clear && clear.cells.length === 3, 'cleared a 3-run');
  check((res.cleared[1] || 0) === 3, 'counts: three type-1 cleared');
  check(res.steps.some((s) => s.kind === 'fall'), 'has a fall step');
  check(res.steps.some((s) => s.kind === 'refill'), 'has a refill step');
  check(findRuns(b).length === 0, 'board stable after resolution');
}

// gravity: a hole is filled from above
{
  const b = grid([[0], [1], [2]]);
  b.tiles[2][0] = null;   // bottom hole
  const moves = applyGravity(b);
  check(b.tiles[2][0].type === 1 && b.tiles[1][0].type === 0, 'tiles fell down one');
  check(b.tiles[0][0] === null, 'top is now empty');
  check(moves.length === 2, 'two tiles moved');
}

console.log(`ok resolve.test.mjs (${pass} checks)`);
