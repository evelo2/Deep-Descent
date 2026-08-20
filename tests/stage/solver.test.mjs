// Solver soundness/agreement gate. Run: node tests/stage/solver.test.mjs
// Key check: the solver must classify all 8 shipped, real-physics-verified
// rooms (see traversal.test.mjs) as solvable — that's the agreement check
// against known-good ground truth. A battery of deliberately-broken rooms
// must be classified unsolvable — that's the soundness check.
import { solvable } from '../../src/stage/solver.js';
import { THEMES } from '../../src/stage/themes.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ROWS = 20, COLS = 30;

function emptyRoom() {
  return new Array(ROWS).fill(0).map(() => '.'.repeat(COLS));
}
function setCell(rowsArr, r, c, ch) {
  const row = rowsArr[r].split('');
  row[c] = ch;
  rowsArr[r] = row.join('');
}
function withFloor(rowsArr) {
  rowsArr[ROWS - 1] = '#'.repeat(COLS);
  return rowsArr;
}

// --- 1. Agreement: all 8 shipped rooms (SHIP x5 + LAIR x3) are solvable ---
let shippedSolvable = 0, shippedTotal = 0;
for (const theme of THEMES) {
  theme.rooms.forEach((rows, i) => {
    shippedTotal++;
    const res = solvable(rows);
    const needCache = rows.some((r) => r.includes('$'));
    check(`${theme.key} room ${i + 1}: reachExit`, res.reachExit);
    if (needCache) check(`${theme.key} room ${i + 1}: reachCache`, res.reachCache);
    check(`${theme.key} room ${i + 1}: ok`, res.ok);
    if (res.ok) shippedSolvable++;
  });
}
check('all 8 shipped rooms solvable', shippedSolvable === 8 && shippedTotal === 8);

// --- 2. Shape handling: a room missing $ -> noCache, ok depends only on exit ---
{
  // SHIP room 1 has no '$'.
  const rows = THEMES[0].rooms[0];
  const hasCache = rows.some((r) => r.includes('$'));
  const res = solvable(rows);
  check('room without $ has no cache glyph (sanity)', !hasCache);
  check('room without $: reachCache is false', res.reachCache === false);
  check('room without $: ok === reachExit', res.ok === res.reachExit);
}

// --- 3. Broken fixtures: all classified unsolvable ---

// (a) exit walled off by solids — a full '#' column between spawn and '>'.
{
  const rows = withFloor(emptyRoom());
  setCell(rows, 18, 2, 'S');
  setCell(rows, 18, 25, '>');
  for (let r = 0; r <= 18; r++) setCell(rows, r, 15, '#');
  const res = solvable(rows);
  check('broken(a) walled exit: reachExit false', res.reachExit === false);
  check('broken(a) walled exit: ok false', res.ok === false);
}

// (b) '>' reachable only by crossing a spike row — a wide spike band (wider
// than JUMP_ACROSS so no conservative jump could bridge it) with no
// alternate route above.
{
  const rows = withFloor(emptyRoom());
  setCell(rows, 18, 2, 'S');
  setCell(rows, 18, 25, '>');
  for (let c = 10; c <= 15; c++) setCell(rows, 18, c, '^');
  const res = solvable(rows);
  check('broken(b) spike wall: reachExit false', res.reachExit === false);
  check('broken(b) spike wall: ok false', res.ok === false);
}

// (c) a floating '$' cache with no support/ladder to it — unreachable, even
// though the exit is trivially reachable along the floor.
{
  const rows = withFloor(emptyRoom());
  setCell(rows, 18, 2, 'S');
  setCell(rows, 18, 25, '>');
  setCell(rows, 5, 20, '$'); // isolated in open air, nothing below/around
  const res = solvable(rows);
  check('broken(c) floating cache: reachExit true', res.reachExit === true);
  check('broken(c) floating cache: reachCache false', res.reachCache === false);
  check('broken(c) floating cache: ok false', res.ok === false);
}

// (d) spawn sealed in a solid box — no way out in any direction.
{
  const rows = withFloor(emptyRoom());
  for (let r = 9; r <= 11; r++) {
    for (let c = 9; c <= 11; c++) setCell(rows, r, c, '#');
  }
  setCell(rows, 10, 10, 'S');
  setCell(rows, 18, 25, '>');
  const res = solvable(rows);
  check('broken(d) sealed spawn: reachExit false', res.reachExit === false);
  check('broken(d) sealed spawn: ok false', res.ok === false);
}

console.log(`solver: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
