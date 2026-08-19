// Tests for the Barracuda charger (src/entities/creatures.js + spawn.js).
// Run: node tests/creatures/barracuda.test.mjs

import { Barracuda } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;

// Aligned + in-range diver: enters windup within a frame, then dash after
// windupTime, and x moves toward the diver during the dash.
{
  const diver = { x: 100, y: 0, radius: 15 };
  const b = new Barracuda(0, 0);
  let t = 0;
  b.update(dt, t, diver);
  assert('aligned + in-range diver enters windup within a frame', b.state === 'windup');

  let guard = 0;
  while (b.state === 'windup' && guard < 200) { t += dt; b.update(dt, t, diver); guard++; }
  assert('transitions to dash after windupTime', b.state === 'dash');

  const xBefore = b.x;
  t += dt; b.update(dt, t, diver);
  assert('x moves toward the diver during dash', b.x > xBefore);
}

// Vertically-misaligned diver: never leaves patrol.
{
  const diver = { x: 100, y: 500, radius: 15 };
  const b = new Barracuda(0, 0);
  let t = 0;
  for (let i = 0; i < 60; i++) { t += dt; b.update(dt, t, diver); }
  assert('vertically-misaligned diver stays in patrol', b.state === 'patrol');
}

// snareT set during windup cancels the dash, returning to patrol.
{
  const diver = { x: 100, y: 0, radius: 15 };
  const b = new Barracuda(0, 0);
  let t = 0;
  b.update(dt, t, diver);
  assert('enters windup before the snare is applied', b.state === 'windup');
  b.snareT = 1;
  t += dt; b.update(dt, t, diver);
  assert('snare cancels the dash, returning to patrol', b.state === 'patrol');
}

// Config + points wiring.
assert('CREATURES.barracuda is configured', !!CREATURES.barracuda);
assert('KILL_POINTS.Barracuda === 260', KILL_POINTS.Barracuda === 260);

// Factory wiring.
{
  const b = spawnCreature({ k: 'barracuda' }, 100, 100, 1, {});
  assert('spawnCreature barracuda returns a Barracuda', b instanceof Barracuda);
}

done();
