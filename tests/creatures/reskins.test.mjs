// Tests for the belly/temple zone reskins (src/entities/creatures.js + spawn.js):
// Parasite (Piranha-style drifter) and Sentinel (Grouper-style guardian that
// only wakes on demand). Also covers the final ZONE_FAUNA rosters for
// belly/temple/wreck/dark/current wired up in Task 10.
// Run: node tests/creatures/reskins.test.mjs

import { Parasite, Sentinel } from '../../src/entities/creatures.js';
import { spawnCreature, ZONE_FAUNA } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;

// ---- Parasite: converges on the diver like a Piranha -----------------
{
  const diver = { x: 0, y: 0, radius: 15 };
  const p = new Parasite(200, 0);
  const startDist = Math.hypot(diver.x - p.x, diver.y - p.y);
  let t = 0;
  for (let i = 0; i < 60; i++) { t += dt; p.update(dt, t, diver); }
  const endDist = Math.hypot(diver.x - p.x, diver.y - p.y);
  assert('a parasite 200px from the diver converges over 60 frames', endDist < startDist);
  assert('Parasite.points === 60', p.points === 60);
}

// ---- Sentinel: guards only when awake or diver is within territory ----

// Constructor: explicit anchor sets ax/ay; starts asleep.
{
  const s = new Sentinel(100, 100, { x: 400, y: 500 });
  assert('anchor.x stored as ax', s.ax === 400);
  assert('anchor.y stored as ay', s.ay === 500);
  assert('starts asleep (awake === false)', s.awake === false);
  assert('radius comes from CREATURES.sentinel.radius', s.radius === CREATURES.sentinel.radius);
}

// Not awake, diver far outside territory: does NOT home — drifts to anchor instead.
{
  const anchor = { x: 0, y: 0 };
  const s = new Sentinel(100, 0, anchor);
  const diver = { x: -500, y: 0, radius: 15 }; // outside CREATURES.sentinel.territory
  const startAnchorDist = Math.hypot(s.x - s.ax, s.y - s.ay);
  let t = 0;
  for (let i = 0; i < 90; i++) { t += dt; s.update(dt, t, diver); }
  const endAnchorDist = Math.hypot(s.x - s.ax, s.y - s.ay);
  assert('asleep + outside territory: drifts toward its anchor', endAnchorDist < startAnchorDist);
}

// awake === true: homes on the diver even outside territory.
{
  const anchor = { x: 0, y: 0 };
  const s = new Sentinel(100, 0, anchor);
  s.awake = true;
  const diver = { x: -500, y: 0, radius: 15 }; // outside territory, but awake overrides
  const startDist = Math.hypot(diver.x - s.x, diver.y - s.y);
  let t = 0;
  for (let i = 0; i < 90; i++) { t += dt; s.update(dt, t, diver); }
  const endDist = Math.hypot(diver.x - s.x, diver.y - s.y);
  assert('awake: homes on the diver despite being outside territory', endDist < startDist);
}

// Not awake, diver inside territory: homes anyway (territory alone wakes the guard).
{
  const anchor = { x: 0, y: 0 };
  const s = new Sentinel(0, 0, anchor);
  const diver = { x: 150, y: 0, radius: 15 }; // inside territory (260)
  const startDist = Math.hypot(diver.x - s.x, diver.y - s.y);
  let t = 0;
  for (let i = 0; i < 90; i++) { t += dt; s.update(dt, t, diver); }
  const endDist = Math.hypot(diver.x - s.x, diver.y - s.y);
  assert('asleep but diver inside territory: homes on the diver', endDist < startDist);
  assert('still marked asleep — territory alone doesn\'t flip awake', s.awake === false);
}

assert('KILL_POINTS.Sentinel === 300', KILL_POINTS.Sentinel === 300);

// ---- Factory wiring ----------------------------------------------------
{
  const p = spawnCreature({ k: 'parasite' }, 10, 20, 1, {});
  assert('spawnCreature parasite returns a Parasite', p instanceof Parasite);
}
{
  const s = spawnCreature({ k: 'sentinel' }, 100, 100, 1, { anchor: { x: 300, y: 400 } });
  assert('spawnCreature sentinel returns a Sentinel', s instanceof Sentinel);
  assert('spawnCreature sentinel honors opts.anchor (ax)', s.ax === 300);
  assert('spawnCreature sentinel honors opts.anchor (ay)', s.ay === 400);
}

// ---- ZONE_FAUNA final rosters (Task 10 wiring) -------------------------
const keysOf = (band) => (ZONE_FAUNA[band] || []).map((e) => e.k);
assert('ZONE_FAUNA.belly has parasite + urchin', keysOf('belly').includes('parasite') && keysOf('belly').includes('urchin'));
assert('ZONE_FAUNA.temple has sentinel', keysOf('temple').includes('sentinel'));
assert('ZONE_FAUNA.wreck has moray + grouper', keysOf('wreck').includes('moray') && keysOf('wreck').includes('grouper'));
assert('ZONE_FAUNA.dark has stonefish + moray + urchin', ['stonefish', 'moray', 'urchin'].every((k) => keysOf('dark').includes(k)));
assert('ZONE_FAUNA.current has urchin', keysOf('current').includes('urchin'));

done();
