import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function near(a, b, eps = 1.5) { return Math.abs(a - b) <= eps; }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const T = STAGE.tile;
// A tiny hand-built theme: floor across the bottom, a wall column, start mid-air.
function mkStage(roomRows) {
  return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: {}, hazardGlyph: 'barrel', rooms: [roomRows] });
}
const floorRoom = [
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
  '..S...........................', // start high so it falls
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '............#.................', // a wall column at col12, rows17-18
  '............#.................',
  '##############################',
];
const idle = { moveX: 0, jump: false, climbY: 0 };

// Gravity: body falls and lands on the floor (top of row 19 = y=19*T).
let s = mkStage(floorRoom);
const startY = s.body.y;
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);
assert('falls under gravity', s.body.y > startY);
assert('lands on floor (feet at row19 top)', near(s.body.y + s.body.h, 19 * T));
assert('onGround after landing', s.body.onGround === true);
assert('vy zeroed on landing', near(s.body.vy, 0, 1));

// No tunneling at terminal speed: drop from the top, still lands (never below floor).
s = mkStage(floorRoom);
s.body.y = 0; s.body.vy = STAGE.maxFall;
for (let i = 0; i < 240; i++) s.update(1 / 60, idle);
assert('no tunnel: never passes through floor', s.body.y + s.body.h <= 19 * T + 0.6);

// Walk right into the wall column: stops, does not enter the wall.
s = mkStage(floorRoom);
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);   // land first
for (let i = 0; i < 120; i++) s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 });
assert('walking moved right', s.body.x > 2 * T);
assert('blocked by wall (left of col12)', s.body.x + s.body.w <= 12 * T + 0.6);
assert('pose is walk while moving', s.body.pose === 'walk');

// Jump from the ground gains height then returns.
s = mkStage(floorRoom);
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);
const groundY = s.body.y;
s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
assert('jump gives upward velocity', s.body.vy < 0);
let minY = s.body.y;
for (let i = 0; i < 60; i++) { s.update(1 / 60, idle); minY = Math.min(minY, s.body.y); }
assert('jump reached higher than ground', minY < groundY - T);
// verify double-jump gate: while airborne a jump command does not re-boost upward beyond gravity
s = mkStage(floorRoom);
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);
s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
const vyAfterFirst = s.body.vy;
s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
assert('second jump mid-air ignored', s.body.vy > vyAfterFirst); // vy increased (gravity), not reset to -jump
done();
