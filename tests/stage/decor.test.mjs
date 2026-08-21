// Procedural stage decor: every prop lands in an empty '.' cell, anchored to
// nearby structure, never on the ladder spine, and generation is deterministic
// for a given seed. Pure/Node-testable (no canvas). Run: node tests/stage/decor.test.mjs

import { makeStageRooms, makeStageDecor, mulberry32 } from '../../src/stage/chunkgen.js';
import { THEMES } from '../../src/stage/themes.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ROWS = 20, COLS = 30;
const solid = (rows, r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && rows[r][c] === '#';

for (const theme of THEMES) {
  // Build rooms + decor from matched seeds.
  const seed = 12345;
  const rooms = makeStageRooms(theme, 3, mulberry32(seed));
  const decor = makeStageDecor(theme, rooms, mulberry32(seed ^ 0x9e3779b9), [3, 6]);

  check(`[${theme.key}] one decor array per room`, Array.isArray(decor) && decor.length === rooms.length);

  let total = 0, floorOk = true, cellOk = true, ladderOk = true, boundsOk = true;
  decor.forEach((items, ri) => {
    const rows = rooms[ri];
    for (const it of items) {
      total++;
      if (!(it.r >= 0 && it.r < ROWS && it.c >= 0 && it.c < COLS)) { boundsOk = false; continue; }
      if (rows[it.r][it.c] !== '.') cellOk = false;                       // must be an empty cell
      // no ladder in the 3x3 around it
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = it.r + dr, cc = it.c + dc;
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && rows[rr][cc] === 'H') ladderOk = false;
      }
      // floor props (crate/cannon/…) must have solid below and not sit on the exit row
      if (['crate', 'cannon', 'wheel', 'compass', 'timber', 'mast'].includes(it.k)) {
        if (!solid(rows, it.r + 1, it.c)) floorOk = false;
        if (it.r >= ROWS - 2) floorOk = false;
      }
    }
  });

  check(`[${theme.key}] every prop sits in an empty cell`, cellOk);
  check(`[${theme.key}] no prop crowds the ladder`, ladderOk);
  check(`[${theme.key}] floor props are anchored + off the exit walk`, floorOk);
  check(`[${theme.key}] all props are in-bounds`, boundsOk);
  check(`[${theme.key}] some decor was actually placed`, total > 0);

  // Determinism: same seeds → identical decor.
  const decor2 = makeStageDecor(theme, rooms, mulberry32(seed ^ 0x9e3779b9), [3, 6]);
  check(`[${theme.key}] decor is deterministic for a seed`, JSON.stringify(decor) === JSON.stringify(decor2));
}

console.log(`decor: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
