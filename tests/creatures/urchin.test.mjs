// Tests for the Sea Urchin (static/slow-drift, net-immune contact hazard)
// (src/entities/creatures.js + spawn.js).
// Run: node tests/creatures/urchin.test.mjs

import { Urchin } from '../../src/entities/creatures.js';
import { spawnCreature, ZONE_FAUNA } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;

// Constructor: radius comes from config, netImmune is set, drift defaults to 0.
{
  const u = new Urchin(100, 100);
  assert('radius comes from CREATURES.urchin.radius', u.radius === CREATURES.urchin.radius);
  assert('netImmune is true', u.netImmune === true);
  assert('driftX defaults to 0', u.driftX === 0);
}

// A mostly-static urchin (no drift) barely moves over 1s — small bob only.
{
  const u = new Urchin(500, 500);
  const startX = u.x, startY = u.y;
  let t = 0;
  for (let i = 0; i < 60; i++) { t += dt; u.update(dt, t); }
  assert('x does not drift when driftX is 0', u.x === startX);
  assert('y stays within a small sway band', Math.abs(u.y - startY) < 5);
}

// A drifting urchin moves slowly but still barely, over 1s.
{
  const u = new Urchin(500, 500, 5); // slow drift
  const startX = u.x;
  let t = 0;
  for (let i = 0; i < 60; i++) { t += dt; u.update(dt, t); }
  assert('drifting urchin moves only a small amount over 1s', Math.abs(u.x - startX) < 10 && u.x !== startX);
}

// hits() true on contact (inherited default Creature.hits()).
{
  const diver = { x: 0, y: 0, radius: 15 };
  const u = new Urchin(0, 0);
  assert('hits() is true on contact', u.hits(diver) === true);
}
{
  const diver = { x: 0, y: 0, radius: 15 };
  const u = new Urchin(1000, 1000);
  assert('hits() is false far away', u.hits(diver) === false);
}

// Config + points wiring.
assert('CREATURES.urchin is configured', !!CREATURES.urchin);
assert('CREATURES.urchin.driftSpeed === 0', CREATURES.urchin.driftSpeed === 0);
assert('CREATURES.urchin.radius === 15', CREATURES.urchin.radius === 15);
assert('KILL_POINTS.Urchin === 120', KILL_POINTS.Urchin === 120);

// ZONE_FAUNA wiring — current/dark/deep bands, reef-gated.
{
  const cur = (ZONE_FAUNA.current || []).find((e) => e.k === 'urchin');
  assert('ZONE_FAUNA.current has an urchin entry', !!cur);
  assert('current urchin entry gated to minReef 4', cur && cur.minReef === 4);
  assert('current urchin entry weight 3', cur && cur.w === 3);

  const dark = (ZONE_FAUNA.dark || []).find((e) => e.k === 'urchin');
  assert('ZONE_FAUNA.dark has an urchin entry', !!dark);
  assert('dark urchin entry gated to minReef 4', dark && dark.minReef === 4);
  assert('dark urchin entry weight 2', dark && dark.w === 2);

  const deep = (ZONE_FAUNA.deep || []).find((e) => e.k === 'urchin');
  assert('ZONE_FAUNA.deep has an urchin entry', !!deep);
  assert('deep urchin entry gated to minReef 5', deep && deep.minReef === 5);
  assert('deep urchin entry weight 1', deep && deep.w === 1);
}

// Factory wiring.
{
  const u = spawnCreature({ k: 'urchin' }, 200, 220, 4, {});
  assert('spawnCreature urchin returns an Urchin', u instanceof Urchin);
  assert('spawnCreature urchin lands at spawn position (x)', u.x === 200);
  assert('spawnCreature urchin lands at spawn position (y)', u.y === 220);
  assert('spawnCreature urchin is net-immune', u.netImmune === true);
}

// Net-immunity flag is what the game's net-snare loop reads (game-level skip
// is exercised in game.js, not unit-testable here in isolation).
{
  const u = new Urchin(0, 0);
  assert('netImmune flag present for game.js net-loop guard', u.netImmune === true);
}

done();
