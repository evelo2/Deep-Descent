// Authoritative traversability gate: drives the REAL Stage physics through every
// room of every theme along its intended critical path and asserts the exit
// (and cache in finals) is reachable without death. Run: node tests/stage/traversal.test.mjs
import { runRoom } from './traversal-harness.mjs';
import { THEMES } from '../../src/stage/themes.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const exitCol = (rows) => { for (const r of rows) { const i = r.indexOf('>'); if (i >= 0) return i; } return -1; };
const grab = (col) => ({ walkClimb: { to: col, dir: 1, climbY: 1 } });
const descend = (rows, lad, edge) => [{ to: edge }, grab(lad), { climbTo: 17 }, { to: exitCol(rows) }];
const switchback = (rows, l1, e1, mid, l2, e2) => [{ to: e1 }, grab(l1), { climbTo: mid }, { to: e2 }, grab(l2), { climbTo: 17 }, { to: exitCol(rows) }];

// Critical-path waypoints per theme/room (indices match themes.js order).
const PATHS = {
  ship: [
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
    (r) => switchback(r, 4, 3, 7, 9, 8),
    (r) => descend(r, 5, 4),
    (r) => switchback(r, 4, 3, 7, 9, 8),
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
  ],
  lair: [
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
    (r) => switchback(r, 6, 5, 7, 11, 10),
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
  ],
};

for (const theme of THEMES) {
  const paths = PATHS[theme.key];
  check(`${theme.key}: PATHS covers all rooms`, paths && paths.length === theme.rooms.length);
  theme.rooms.forEach((rows, i) => {
    const res = runRoom(rows, paths[i](rows), { palette: theme.palette });
    const needCache = rows.some((r) => r.includes('$'));
    check(`${theme.key} room ${i + 1}: reaches exit`, res.reachedExit);
    check(`${theme.key} room ${i + 1}: no death on the critical path`, !res.died);
    if (needCache) check(`${theme.key} room ${i + 1}: reaches cache`, res.reachedCache);
  });
}

console.log(`traversal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
