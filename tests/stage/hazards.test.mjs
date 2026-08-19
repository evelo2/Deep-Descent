import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }
const T = STAGE.tile;
function mkStage(rows) { return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: {}, hazardGlyph: 'barrel', rooms: [rows] }); }
const idle = { moveX: 0, jump: false, climbY: 0 };

// Patroller on a platform flips at the edge, never walks off.
const patRoom = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.......E......................', // patroller on the platform below
  '.....########.................', // platform cols5-12, row14
  '..............................',
  '..............................',
  '..S...........................',
  '..............................',
  '##############################',
];
let s = mkStage(patRoom);
const m = s.room.movers[0];
const leftEdge = 5 * T, rightEdge = 12 * T + T;
let minX = m.x, maxX = m.x;
for (let i = 0; i < 600; i++) { s.update(1 / 60, idle); minX = Math.min(minX, s.room.movers[0].x); maxX = Math.max(maxX, s.room.movers[0].x); }
assert('patroller stays on platform (left)', minX >= leftEdge - 1);
assert('patroller stays on platform (right)', maxX + T <= rightEdge + 1);
assert('patroller actually moved', maxX - minX > T);

// Falling into a pit kills the body.
const pitRoom = [
  '..S...........................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................', // no floor at all → pit
];
s = mkStage(pitRoom);
let died = false;
for (let i = 0; i < 240 && !died; i++) died = s.update(1 / 60, idle).died;
assert('falling into a pit reports died', died === true);

// Touching a spike kills; respawn returns the body to start with invuln.
const spikeRoom = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..S....^......................', // spike at col7 on the same floor row18
  '..#######.....................',
  '##############################',
];
s = mkStage(spikeRoom);
const startX = s.room.start.x, startY = s.room.start.y;
let hitDied = false;
for (let i = 0; i < 200 && !hitDied; i++) hitDied = s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 }).died;
assert('walking into a spike reports died', hitDied === true);
s.respawn();
assert('respawn resets to start', Math.abs(s.body.x - startX) < 1 && Math.abs(s.body.y - startY) < 1);
assert('respawn grants invuln', s.body.invuln > 0);
// While invulnerable, an immediate spike overlap does not re-report died.
const again = s.update(1 / 60, idle).died;
assert('invuln suppresses instant re-death', again === false);
done();
