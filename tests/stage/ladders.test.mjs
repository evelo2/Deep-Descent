import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function near(a, b, eps = 2) { return Math.abs(a - b) <= eps; }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }
const T = STAGE.tile;
function mkStage(rows) { return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: {}, hazardGlyph: 'barrel', rooms: [rows] }); }

// A ladder at col5 from row5 down to the floor; start standing at the ladder base.
const rows = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....S........................', // start on the ladder column, near floor
  '.....H........................',
  '##############################',
];
const T5 = 5 * T + (T - STAGE.bodyW) / 2;

// Climb up: hold climbY=-1 while overlapping the ladder → rises, gravity off.
let s = mkStage(rows);
for (let i = 0; i < 30; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: 0 }); // settle
const yAtBase = s.body.y;
for (let i = 0; i < 60; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: -1 });
assert('climbs upward on ladder', s.body.y < yAtBase - T);
assert('onLadder true while climbing', s.body.onLadder === true);
assert('pose is climb', s.body.pose === 'climb');
assert('x centered on ladder', near(s.body.x, T5, 3));

// Reaching the top (no ladder above row5): leaves climb, gravity resumes.
for (let i = 0; i < 240; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: -1 });
assert('cannot climb above the top ladder tile', s.body.y + s.body.h >= 5 * T - 1);

// Resting on a ladder (climbY=0 while overlapping) holds position (no fall).
s = mkStage(rows);
for (let i = 0; i < 30; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: 0 });
for (let i = 0; i < 30; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: -1 }); // grab ladder mid-way
const restY = s.body.y;
for (let i = 0; i < 60; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: 0 });
assert('rests on ladder without falling', near(s.body.y, restY, 2));

// Jump off a ladder: a jump press leaves climb mode with upward velocity.
for (let i = 0; i < 1; i++) s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
assert('jump off ladder gives upward vy', s.body.vy < 0 && s.body.onLadder === false);
done();
