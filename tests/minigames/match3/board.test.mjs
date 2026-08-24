// tests/minigames/match3/board.test.mjs
import { makeBoard, at, findRuns, wouldMatch, legalSwap, hasAnyMove } from '../../../src/minigames/match3/board.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

// helper: build a board from an explicit type grid (special=null)
function grid(types) {
  const rows = types.length, cols = types[0].length;
  return { cols, rows, types: 6, rng: mulberry32(1),
    tiles: types.map((row) => row.map((t) => ({ type: t, special: null }))) };
}

// generation: no initial matches, has a move
{
  const b = makeBoard({ cols: 8, rows: 8, rng: mulberry32(42) });
  check(b.cols === 8 && b.rows === 8, 'dims');
  check(findRuns(b).length === 0, 'no initial matches');
  check(hasAnyMove(b), 'generated board has a legal move');
}

// findRuns: horizontal + vertical
{
  const b = grid([
    [0, 0, 0, 1, 2],
    [3, 1, 4, 1, 2],
    [3, 5, 4, 1, 2],
    [3, 2, 4, 0, 5],
  ]);
  const runs = findRuns(b);
  // one horizontal run (row0 cols0-2) and two vertical (col0 rows1-3 type3; col4 rows0-2 type2; col3 rows0-2 type1)
  const has = (axis, type, len) => runs.some((r) => r.axis === axis && r.type === type && r.len === len);
  check(has('row', 0, 3), 'horizontal 000 run found');
  check(has('col', 3, 3), 'vertical type3 run found');
  check(has('col', 2, 3), 'vertical type2 run found');
  check(has('col', 1, 3), 'vertical type1 run found');
}

// wouldMatch + legalSwap + adjacency
{
  const b = grid([
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ]);
  // swapping (0,0)&(0,1) makes col: (0,1)->0 over (1,1)=0,(2,1)=1 no... test a real one:
  const b2 = grid([
    [0, 1, 2],
    [1, 0, 2],
    [0, 1, 2],   // col2 already 2,2,2 — but generation forbids; here it's a hand grid to test detection
  ]);
  check(findRuns(b2).some((r) => r.axis === 'col' && r.type === 2), 'hand grid detects col run');
  // adjacency: non-adjacent is never legal
  check(!legalSwap(b, 0, 0, 2, 2), 'non-adjacent swap illegal');
  // wouldMatch restores the board (no mutation)
  const before = JSON.stringify(b.tiles);
  wouldMatch(b, 0, 0, 0, 1);
  check(JSON.stringify(b.tiles) === before, 'wouldMatch does not mutate');
}

console.log(`ok board.test.mjs part1 (${pass} checks)`);
