// Tests for the Grouper (loot guardian) (src/entities/creatures.js + spawn.js).
// A territorial guardian anchored at a loot node (e.g. a wreck chest): homes
// on the diver while they're inside `territory` of the anchor, and drifts
// back to the anchor (at a slower speed) once they leave.
// Run: node tests/creatures/grouper.test.mjs

import { Grouper } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';
import { ZONE_FAUNA } from '../../src/entities/spawn.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;

// Constructor: explicit anchor sets ax/ay independent of the spawn (x, y).
{
  const g = new Grouper(100, 100, { x: 400, y: 500 });
  assert('anchor.x stored as ax', g.ax === 400);
  assert('anchor.y stored as ay', g.ay === 500);
  assert('radius comes from CREATURES.grouper.radius', g.radius === CREATURES.grouper.radius);
}

// No anchor passed: falls back to its own spawn position as the anchor.
{
  const g = new Grouper(50, 60);
  assert('no-anchor ax falls back to x', g.ax === 50);
  assert('no-anchor ay falls back to y', g.ay === 60);
}

// Diver inside territory: the grouper homes in, closing distance to the diver.
{
  const anchor = { x: 0, y: 0 };
  const g = new Grouper(0, 0, anchor);
  const diver = { x: 150, y: 0, radius: 15 }; // within CREATURES.grouper.territory (260)
  const startDist = Math.hypot(diver.x - g.x, diver.y - g.y);
  let t = 0;
  for (let i = 0; i < 90; i++) { t += dt; g.update(dt, t, diver); }
  const endDist = Math.hypot(diver.x - g.x, diver.y - g.y);
  assert('diver inside territory: distance to diver shrinks', endDist < startDist);
}

// Diver far outside territory: the grouper drifts back toward its anchor.
{
  const anchor = { x: 0, y: 0 };
  const g = new Grouper(120, 0, anchor); // start away from the anchor
  const diver = { x: 5000, y: 0, radius: 15 }; // far outside territory (260)
  const startDist = Math.hypot(g.x - g.ax, g.y - g.ay);
  let t = 0;
  for (let i = 0; i < 90; i++) { t += dt; g.update(dt, t, diver); }
  const endDist = Math.hypot(g.x - g.ax, g.y - g.ay);
  assert('diver outside territory: distance to anchor shrinks', endDist < startDist);
}

// facing follows the direction of travel toward the current target.
{
  const anchor = { x: 0, y: 0 };
  const g = new Grouper(0, 0, anchor);
  const diver = { x: 150, y: 0, radius: 15 };
  g.update(dt, dt, diver);
  assert('facing points toward the diver (positive x)', g.facing === 1);
}

// Config + points wiring.
assert('CREATURES.grouper is configured', !!CREATURES.grouper);
assert('KILL_POINTS.Grouper === 300', KILL_POINTS.Grouper === 300);

// ZONE_FAUNA wreck band includes grouper, reef-gated.
{
  const entry = (ZONE_FAUNA.wreck || []).find((e) => e.k === 'grouper');
  assert('ZONE_FAUNA.wreck has a grouper entry', !!entry);
  assert('grouper entry is gated to minReef 3', entry && entry.minReef === 3);
}

// Factory wiring: spawnCreature reads opts.anchor.
{
  const g = spawnCreature({ k: 'grouper' }, 100, 100, 3, { anchor: { x: 300, y: 400 } });
  assert('spawnCreature grouper returns a Grouper', g instanceof Grouper);
  assert('spawnCreature grouper honors opts.anchor (ax)', g.ax === 300);
  assert('spawnCreature grouper honors opts.anchor (ay)', g.ay === 400);
}

// Factory wiring: no anchor in opts falls back to spawn (x, y).
{
  const g = spawnCreature({ k: 'grouper' }, 250, 260, 3, {});
  assert('spawnCreature grouper with no anchor falls back to (x)', g.ax === 250);
  assert('spawnCreature grouper with no anchor falls back to (y)', g.ay === 260);
}

done();
