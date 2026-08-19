// Regression test for the "fall through the rung-gap where a ladder passes
// through a deck" bug. Walking across a deck with no up/down input must NOT drop
// you through the ladder tile — the ladder top is a one-way walkable platform.
// Holding DOWN must still let you descend the ladder deliberately.
// Run: node tests/stage/ladder-walk.test.mjs

import { Stage } from '../../src/stage/stage.js';
import { STAGE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const T = STAGE.tile;

// A 20-row × 30-col room: a solid deck across row 10 with a single ladder tile
// (a rung-gap) at column 15, and the ladder continuing down to the floor. Spawn
// sits on the deck to the left of the gap.
function room() {
  const cols = STAGE.cols, rows = STAGE.rows;
  const grid = Array.from({ length: rows }, () => '.'.repeat(cols).split(''));
  for (let c = 0; c < cols; c++) grid[19][c] = '#';       // floor
  for (let c = 1; c < cols - 1; c++) grid[10][c] = '#';   // a mid deck across row 10
  for (let r = 10; r <= 18; r++) grid[r][15] = 'H';       // ladder through the deck to the floor
  grid[9][6] = 'S';                                       // spawn standing on the deck, left of the gap
  grid[18][25] = '>';                                     // an exit so parse is happy
  return grid.map((row) => row.join(''));
}

function makeStage() {
  const st = new Stage({ rooms: [room()], palette: { accent: 'gem' }, hazardGlyph: 'barrel', name: 'T', key: 't' });
  st.doorGrace = 999;
  return st;
}

const DT = 1 / 120;
function drive(st, cmd, secs) {
  for (let i = 0; i < Math.round(secs / DT); i++) st.update(DT, cmd);
}

// --- 1. Walk right across the ladder gap with NO vertical input: don't fall. ---
{
  const st = makeStage();
  const b = st.body;
  drive(st, { moveX: 1, jump: false, climbY: 0 }, 2.0);   // walk right, no up/down
  const footRow = Math.floor((b.y + b.h) / T);
  check('walked past the ladder column (x advanced)', Math.floor((b.x + b.w / 2) / T) > 15);
  check('stayed on the deck level — did NOT fall through the gap', footRow <= 11);
  check('is grounded after crossing, not free-falling', b.onGround === true);
}

// --- 2. Standing on the ladder tile with no input: held up, not dropped. ------
{
  const st = makeStage();
  const b = st.body;
  // walk to the gap column and stop
  for (let i = 0; i < 400 && Math.floor((b.x + b.w / 2) / T) < 15; i++) st.update(DT, { moveX: 1, jump: false, climbY: 0 });
  const yAtGap = b.y;
  drive(st, { moveX: 0, jump: false, climbY: 0 }, 1.0);   // stand still over the ladder
  check('standing over the ladder gap does not fall', Math.abs(b.y - yAtGap) < T);
  check('standing over the ladder gap stays grounded', b.onGround === true);
}

// --- 3. Holding DOWN over the ladder still descends (deliberate climb). -------
{
  const st = makeStage();
  const b = st.body;
  for (let i = 0; i < 400 && Math.floor((b.x + b.w / 2) / T) < 15; i++) st.update(DT, { moveX: 1, jump: false, climbY: 0 });
  const yTop = b.y;
  drive(st, { moveX: 0, jump: false, climbY: 1 }, 1.0);   // hold down → descend
  check('holding down descends the ladder (y increased)', b.y > yTop + T);
  check('descending grabs the ladder', b.onLadder === true);
}

console.log(`ladder-walk: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
