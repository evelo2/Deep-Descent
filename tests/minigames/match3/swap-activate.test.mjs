// Swap-to-activate + combos (Treasure Chest Madness). You can swap a special
// with ANY adjacent tile to detonate it on demand (no match required); swapping
// two specials together triggers an enhanced COMBO blast. Pure-engine tests.
import { applySwap, legalSwap, findRuns } from '../../../src/minigames/match3/board.js';
import { buildTimeline } from '../../../src/minigames/match3/anim.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
const cyclic = (vals) => { let i = 0; return () => vals[(i++) % vals.length]; };
const specialRng = () => cyclic([0.1, 0.99, 0.6, 0.35, 0.99, 0.1]);

// A run-free filler of diagonal 3-stripes (types 3/4/5). Because (r+c)%3 never
// repeats across 3 collinear cells, it can't form a run even AFTER a swap — so
// any clear in these tests comes solely from the special being tested (type 0,
// which the filler never uses, so specials never accidentally match).
function altBoard(rows, cols) {
  return {
    cols, rows, types: 6, rng: specialRng(),
    tiles: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ({ type: 3 + (r + c) % 3, special: null }))),
  };
}
const setSp = (b, r, c, special, axis) => { b.tiles[r][c] = { type: 0, special, axis }; };
const rect = (cr, cc, rad, rows, cols) => {
  const s = [];
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const r = cr + dr, c = cc + dc; if (r >= 0 && c >= 0 && r < rows && c < cols) s.push([r, c]);
  }
  return s;
};

// 1) legalSwap: a special makes the swap legal even without a match; normal
//    non-matching swaps stay illegal; matching swaps still legal.
{
  const b = altBoard(4, 4);
  setSp(b, 1, 1, 'bomb');
  check(findRuns(b).length === 0, 'legal-swap board is run-free');
  check(legalSwap(b, 1, 1, 1, 2) === true, 'swapping a special is legal without a match');
  check(legalSwap(b, 0, 0, 0, 1) === false, 'a normal non-matching swap stays illegal');
}

// 2) Bomb swapped into a non-matching spot detonates a 3x3 at its LANDING cell.
{
  const b = altBoard(4, 4);
  setSp(b, 1, 1, 'bomb');
  check(findRuns(b).length === 0, 'bomb-activate board run-free');
  const res = applySwap(b, 1, 1, 1, 2);        // bomb lands at (1,2)
  check(res.ok, 'special swap resolves ok');
  check(res.blasts === 1, 'the swapped bomb detonated (blasts=1)');
  const clear = res.steps.find((s) => s.kind === 'clear');
  const cleared = new Set(clear.cells.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of rect(1, 2, 1, 4, 4)) check(cleared.has(`${r},${c}`), `bomb clears (${r},${c}) in its 3x3`);
  check(!cleared.has('3,0'), 'bomb does not clear outside its 3x3');
}

// 3) Combo bomb+bomb → a 5x5 blast (bigger than a single 3x3).
{
  const b = altBoard(6, 6);
  setSp(b, 2, 2, 'bomb'); setSp(b, 2, 3, 'bomb');
  check(findRuns(b).length === 0, 'bomb+bomb board run-free');
  const res = applySwap(b, 2, 2, 2, 3);        // combo centred at the landing cell (2,3)
  check(res.ok && res.blasts === 2, 'both bombs detonated (blasts=2)');
  const clear = res.steps.find((s) => s.kind === 'clear');
  const cleared = new Set(clear.cells.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of [[0, 1], [4, 5], [2, 3], [0, 5]]) check(cleared.has(`${r},${c}`), `bomb+bomb 5x5 clears (${r},${c})`);
  check(!cleared.has('5,5'), 'bomb+bomb 5x5 does not reach (5,5)');
}

// 4) Combo chest+bomb → a giant 7x7 blast, and the chest is still counted.
{
  const b = altBoard(8, 8);
  setSp(b, 3, 3, 'chest'); setSp(b, 3, 4, 'bomb');
  check(findRuns(b).length === 0, 'chest+bomb board run-free');
  const res = applySwap(b, 3, 3, 3, 4);        // chest combo centred at (3,4)
  check(res.ok, 'chest combo resolves ok');
  check(res.chests === 1, 'chest still counted in a combo (bonus salvage)');
  const clear = res.steps.find((s) => s.kind === 'clear');
  const cleared = new Set(clear.cells.map(([r, c]) => `${r},${c}`));
  for (const [r, c] of [[0, 1], [6, 7], [3, 4], [0, 7]]) check(cleared.has(`${r},${c}`), `chest combo 7x7 clears (${r},${c})`);
  check(!cleared.has('7,7'), 'chest combo 7x7 does not reach (7,7)');
}

// 5) The animation timeline must settle to the SAME board as the engine after a
//    swap-activate (else the replay would visually pop at the end).
{
  const b = altBoard(6, 6);
  setSp(b, 2, 2, 'bomb');
  const pre = b.tiles.map((row) => row.map((t) => (t ? { ...t } : null)));
  const res = applySwap(b, 2, 2, 2, 3);
  const tl = buildTimeline(pre, res.steps, 0, b.tiles);
  check(JSON.stringify(tl.finalGrid) === JSON.stringify(b.tiles), 'timeline finalGrid matches settled board after swap-activate');
}

console.log(`ok swap-activate.test.mjs (${pass} checks)`);
