import { applySwap, makeBoard, findRuns } from '../../../src/minigames/match3/board.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
function grid(types, rng = () => 0.99) {
  return { cols: types[0].length, rows: types.length, types: 6, rng,
    tiles: types.map((row) => row.map((t) => ({ type: t, special: null }))) };
}
// Deterministic, non-repeating refill rng for the two spawn tests below.
// ARRANGE-STEP FIX (same class of defect Task 3 found): the brief's default
// `rng = () => 0.99` is constant, so any hole left at the top of a column
// after a clear gets refilled with the same type every pass. In these two
// fixtures the swap-cleared row is the top row, so the constant rng
// recreates a fresh 3-run in the freshly-refilled cells on the very next
// pass, cascades forever, hits the MAX_CASCADE guard, and gets forcibly
// reshuffled — wiping the very special tile the assertions check for. This
// is implementation-independent (verified against the brief's algorithm
// verbatim before making this change). Swapping in a short cycling rng
// (never 3 same values in a row) lets the board settle in one cascade pass,
// matching what the brief's comments/assertions describe, without touching
// any `check(...)` value.
const cyclic = (vals) => { let i = 0; return () => vals[(i++) % vals.length]; };
const specialRng = () => cyclic([0.1, 0.99, 0.6, 0.35, 0.99, 0.1]);

// match-4 spawns a line special at the swap cell
{
  // row0: 0 0 0 1 ; swapping (1,3)=0 up into (0,3) makes 0 0 0 0
  const b = grid([
    [0, 0, 0, 1, 2],
    [5, 4, 3, 0, 2],
    [4, 5, 3, 4, 5],
  ], specialRng());
  const res = applySwap(b, 0, 3, 1, 3);
  check(res.ok, 'match-4 swap ok');
  const clear = res.steps.find((s) => s.kind === 'clear');
  check(clear.spawns.length === 1 && clear.spawns[0].special === 'line', 'match-4 spawns a line special');
  const [sr, sc] = clear.spawns[0].at;
  check(b.tiles[sr][sc] && b.tiles[sr][sc].special === 'line', 'line special placed on the board');
}

// match-5 spawns a bomb
{
  const b = grid([
    [0, 0, 0, 0, 1],
    [5, 4, 3, 2, 0],
    [4, 5, 3, 4, 5],
  ], specialRng());
  const res = applySwap(b, 0, 4, 1, 4);   // brings a 0 into row0 → 0 0 0 0 0
  const clear = res.steps.find((s) => s.kind === 'clear');
  check(clear.spawns.some((s) => s.special === 'bomb'), 'match-5 spawns a bomb');
}

// determinism: same seed ⇒ identical resolution
{
  const a = makeBoard({ rng: mulberry32(7) });
  const b = makeBoard({ rng: mulberry32(7) });
  check(JSON.stringify(a.tiles) === JSON.stringify(b.tiles), 'same seed ⇒ same board');
}

// Cascade depth guard (controller ruling, carried from Task 3 review): an
// adversarial/degenerate refill rng can recreate the exact same run every
// resolution pass forever (Task 3 hit this and OOM'd a Node process at
// ~4GB with an unguarded `while(true)`). applySwap must terminate and
// return a stable, run-free board no matter what the rng does.
//
// Board: col1 = [5,5,0] pre-swap (not yet a run — only two 5s), everything
// else run-free. Swapping (2,1)<->(2,2) brings a 5 into (2,1), making the
// whole 3-row column1 = [5,5,5] → a 3-run that clears the entire column.
// grid()'s default rng is the constant `() => 0.99`, so every refill into
// those holes is type `(0.99*6)|0 === 5` — recreating the identical
// full-column run every single pass. Without a depth cap this hangs/OOMs;
// with the cap, applySwap must still return, and the final board must be
// run-free (forced via reshuffle once the cap is hit). Note: a *truly*
// constant rng can never itself produce a run-free board via fillNoMatch
// (every cell would resolve to the same type), so the cap-hit recovery
// path in applySwap swaps in Math.random for the forced reshuffle only,
// then restores the original rng — see board.js.
{
  const b = grid([
    [0, 5, 1],
    [2, 5, 3],
    [4, 0, 5],
  ]); // rng left at grid()'s default constant 0.99 — the pathological case
  check(findRuns(b).length === 0, 'adversarial board starts run-free');

  const res = applySwap(b, 2, 1, 2, 2);

  // If this line is ever reached, applySwap returned — i.e. it did not
  // hang or OOM against a degenerate rng that recreates a run forever.
  check(res.ok, 'adversarial swap terminates and reports ok');
  // Hard guard against a regressed/unbounded loop: the step list must stay
  // bounded by the cascade cap, not grow without limit.
  check(res.steps.length < 500, 'adversarial resolution stays bounded (cascade cap enforced)');
  check(findRuns(b).length === 0, 'adversarial board ends run-free (forced stable via reshuffle)');
}

console.log(`ok specials.test.mjs (${pass} checks)`);
