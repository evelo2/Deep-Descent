// Tests for the Giant Squid (pursuer mini-boss — homes persistently and lunges
// when close; chipped down over several hits like the Kraken, but simpler: no
// arms, no boss HP bar) (src/entities/creatures.js + spawn.js).
// Run: node tests/creatures/squid.test.mjs

import { GiantSquid } from '../../src/entities/creatures.js';
import { spawnCreature, ZONE_FAUNA } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;

// Constructor wiring.
{
  const s = new GiantSquid(0, 0);
  assert('radius comes from CREATURES.squid.radius', s.radius === CREATURES.squid.radius);
  assert('hp comes from CREATURES.squid.hp', s.hp === CREATURES.squid.hp);
  assert('hurtT starts at 0', s.hurtT === 0);
  assert('lungeT starts at 0', s.lungeT === 0);
  assert('rest starts at 0', s.rest === 0);
  assert('starts alive', !s.dead);
}

// takeDamage: survives hp-1 hits, dies on the hp-th.
{
  const s = new GiantSquid(0, 0);
  const hp = CREATURES.squid.hp;
  for (let i = 0; i < hp - 1; i++) s.takeDamage(1);
  assert('survives hp-1 hits', !s.dead);
  assert('hp reflects hp-1 hits taken', s.hp === 1);
  s.takeDamage(1);
  assert('dies on the hp-th hit', s.dead === true);
  assert('hp is <= 0 on death', s.hp <= 0);
}

// hurtT is set right after a hit.
{
  const s = new GiantSquid(0, 0);
  s.takeDamage(1);
  assert('hurtT > 0 right after a hit', s.hurtT > 0);
}

// Lunge: within lungeRange it advances more per frame than at cruise distance.
{
  const P = CREATURES.squid;
  // Cruise: diver far beyond lungeRange, so it never lunges.
  const cruiseDiver = { x: P.lungeRange + 500, y: 0, radius: 15 };
  const sc = new GiantSquid(0, 0);
  sc.update(dt, 0, cruiseDiver);
  const cruiseStep = Math.hypot(sc.x - 0, sc.y - 0);

  // Lunge: diver within lungeRange — first update triggers the lunge window.
  const closeDiver = { x: P.lungeRange - 10, y: 0, radius: 15 };
  const sl = new GiantSquid(0, 0);
  sl.update(dt, 0, closeDiver);
  assert('entering lungeRange starts a lunge (lungeT > 0)', sl.lungeT > 0);
  const lungeStep = Math.hypot(sl.x - 0, sl.y - 0);

  assert('lunging advances more per frame than cruising', lungeStep > cruiseStep);
}

// Persistent homing reduces distance to a stub diver over time.
{
  const diver = { x: 1000, y: 0, radius: 15 };
  const s = new GiantSquid(0, 0);
  const startDist = Math.hypot(diver.x - s.x, diver.y - s.y);
  let t = 0;
  for (let i = 0; i < 180; i++) { t += dt; s.update(dt, t, diver); }
  const endDist = Math.hypot(diver.x - s.x, diver.y - s.y);
  assert('persistent homing reduces distance to the diver over time', endDist < startDist);
}

// Config + points wiring.
assert('CREATURES.squid is configured', !!CREATURES.squid);
assert('KILL_POINTS.GiantSquid === 900', KILL_POINTS.GiantSquid === 900);

// ZONE_FAUNA wiring — deep band, reef-gated.
{
  const deep = (ZONE_FAUNA.deep || []).find((e) => e.k === 'squid');
  assert('ZONE_FAUNA.deep has a squid entry', !!deep);
  assert('deep squid entry gated to minReef 4', deep && deep.minReef === 4);
  assert('deep squid entry weight 1', deep && deep.w === 1);
}

// Factory wiring.
{
  const s = spawnCreature({ k: 'squid' }, 200, 220, 4, {});
  assert('spawnCreature squid returns a GiantSquid', s instanceof GiantSquid);
  assert('spawnCreature squid lands at spawn position (x)', s.x === 200);
  assert('spawnCreature squid lands at spawn position (y)', s.y === 220);
}

done();
