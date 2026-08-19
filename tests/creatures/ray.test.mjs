// Tests for the Electric Ray (ranged pulse hazard) (src/entities/creatures.js
// + spawn.js). The ray itself never touches the diver directly — its hits()
// is overridden to also check the expanding pulse ring's leading edge.
// Run: node tests/creatures/ray.test.mjs

import { ElectricRay } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;
const P = CREATURES.ray;

// pulseR rises from 0 during a pulse then returns to 0 after it ends.
{
  const r = new ElectricRay(0, 0);
  r.pulseT = 0; r.pulseActive = 0; r.pulseR = 0; // pin a known start (ctor randomizes pulseT)
  const diver = { x: 5000, y: 5000, radius: 15 }; // far away — irrelevant to pulse timing
  let t = 0;

  // Advance right up to (but not through) the cycle boundary.
  const preSteps = Math.floor(P.pulseCycle / dt) - 1;
  for (let i = 0; i < preSteps; i++) { t += dt; r.update(dt, t, diver); }
  assert('pulseR stays 0 before the first pulse triggers', r.pulseR === 0);

  // Step through the pulse and track the max pulseR seen.
  let maxSeen = 0;
  const activeSteps = Math.ceil(P.pulseTime / dt) + 3;
  for (let i = 0; i < activeSteps; i++) {
    t += dt; r.update(dt, t, diver);
    if (r.pulseR > maxSeen) maxSeen = r.pulseR;
  }
  assert('pulseR rose above 0 during the pulse', maxSeen > 0);
  assert('pulseR approached the configured pulseR at its peak', maxSeen > P.pulseR * 0.5);
  assert('pulseR returns to 0 once the pulse ends', r.pulseR === 0);
}

// hits(): body contact is always a hazard, ring or not.
{
  const r = new ElectricRay(0, 0);
  r.pulseR = 0;
  const diver = { x: 0, y: 0, radius: 15 };
  assert('hits() true on body contact', r.hits(diver) === true);
}

// hits(): a diver sitting exactly on the ring band is hit even though
// they're well outside the body radius.
{
  const r = new ElectricRay(0, 0);
  r.pulseR = 80; // mid-pulse ring radius, well past the body
  const diver = { x: 80, y: 0, radius: 15 }; // d === pulseR, outside body
  assert('d is outside the body radius', 80 > r.radius + diver.radius * 0.7);
  assert('hits() true for a diver on the ring band, outside the body', r.hits(diver) === true);
}

// hits(): no ring hazard when pulseR === 0 — a diver at the old ring
// distance (from a prior pulse) is safe between pulses.
{
  const r = new ElectricRay(0, 0);
  r.pulseR = 0;
  const diver = { x: 80, y: 0, radius: 15 }; // same distance as the ring test above
  assert('hits() false at the old ring distance once pulseR resets to 0', r.hits(diver) === false);
}

// Config + points wiring.
assert('CREATURES.ray is configured', !!CREATURES.ray);
assert('KILL_POINTS.ElectricRay === 320', KILL_POINTS.ElectricRay === 320);

// Factory wiring.
{
  const r = spawnCreature({ k: 'ray' }, 100, 100, 1, {});
  assert('spawnCreature ray returns an ElectricRay', r instanceof ElectricRay);
}

done();
