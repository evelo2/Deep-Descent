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
// return a stable, run-free board no matter what the rng does — and (Fix 1,
// review round 2) the recovery itself must be DETERMINISTIC, not seeded
// from ambient Math.random, so the module's "deterministic via injected
// rng" contract holds even on this exceptional path: same board ⇒ same
// escape sequence ⇒ same final board, every time.
//
// Board: col1 = [5,5,0] pre-swap (not yet a run — only two 5s), everything
// else run-free. Swapping (2,1)<->(2,2) brings a 5 into (2,1), making the
// whole 3-row column1 = [5,5,5] → a 3-run that clears the entire column.
// grid()'s default rng is the constant `() => 0.99`, so every refill into
// those holes is type `(0.99*6)|0 === 5` — recreating the identical
// full-column run every single pass. Without a depth cap this hangs/OOMs.
// Note: a *truly* constant rng can never itself produce a run-free board
// via fillNoMatch (every cell would resolve to the same type), so the
// cap-hit recovery path in applySwap seeds a small local, self-contained
// mulberry32-style PRNG from a hash of the current board layout
// (hashBoard + localRng in board.js — no Math.random, no cross-module
// import) for the forced reshuffle only, then restores the original rng.
{
  const build = () => grid([
    [0, 5, 1],
    [2, 5, 3],
    [4, 0, 5],
  ]); // rng left at grid()'s default constant 0.99 — the pathological case
  const b1 = build();
  const b2 = build();
  check(findRuns(b1).length === 0, 'adversarial board starts run-free');

  const res1 = applySwap(b1, 2, 1, 2, 2);
  const res2 = applySwap(b2, 2, 1, 2, 2);   // identical board+swap, independent run

  // If these lines are ever reached, applySwap returned — i.e. it did not
  // hang or OOM against a degenerate rng that recreates a run forever.
  check(res1.ok && res2.ok, 'adversarial swap terminates and reports ok');
  // Hard guard against a regressed/unbounded loop: the step list must stay
  // bounded by the cascade cap, not grow without limit.
  check(res1.steps.length < 500 && res2.steps.length < 500, 'adversarial resolution stays bounded (cascade cap enforced)');
  check(findRuns(b1).length === 0 && findRuns(b2).length === 0, 'adversarial board ends run-free (forced stable via reshuffle)');
  // The determinism assertion: identical starting boards + identical swap
  // must yield an identical final board, proving the cap-hit recovery is a
  // pure function of board state, not flaky ambient randomness.
  check(JSON.stringify(b1.tiles) === JSON.stringify(b2.tiles), 'cap-hit recovery is deterministic: same board ⇒ same final board');
}

// Fix 2 (spec conformance, review round 2): a `line` special clears ONLY
// its own axis (its full row XOR its full column — orientation = the
// spawning run's axis), never both. Board: row1 = [0,0,1,3] pre-swap, with
// a `line` special (axis:'row') pre-placed at (1,1). Swapping (1,2)<->(2,2)
// brings a 0 into (1,2), completing row1 = 0,0,0,3 — a 3-run that includes
// the special cell, which activates. If activation were still row+col (the
// pre-fix bug), column1 — (0,1)=5, (2,1)=3, (3,1)=4, all distinct, no run
// of its own — would also be cleared; axis-oriented activation must clear
// only the rest of row1 ((1,3)) and leave column1 untouched.
{
  const b = grid([
    [5, 5, 4, 5],
    [0, 0, 1, 3],
    [4, 3, 0, 5],
    [3, 4, 5, 4],
  ], specialRng());
  b.tiles[1][1].special = 'line';
  b.tiles[1][1].axis = 'row';
  check(findRuns(b).length === 0, 'axis test board starts run-free');

  const res = applySwap(b, 1, 2, 2, 2);
  check(res.ok, 'axis test swap ok');
  const clear = res.steps.find((s) => s.kind === 'clear');
  const clearedKeys = new Set(clear.cells.map(([r, c]) => `${r},${c}`));
  check(clearedKeys.has('1,3'), 'row-axis line activation clears the rest of its row');
  check(
    !clearedKeys.has('0,1') && !clearedKeys.has('2,1') && !clearedKeys.has('3,1'),
    'row-axis line activation does NOT clear the perpendicular column'
  );
}

console.log(`ok specials.test.mjs (${pass} checks)`);
