// Tests for the Piranha swarm hazard (src/entities/creatures.js + spawn.js).
// Run: node tests/creatures/piranha.test.mjs

import { Piranha } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

// A unit started 200px from a stub diver converges (distance decreases) over 60 frames.
const diver = { x: 0, y: 0, radius: 15 };
const p = new Piranha(200, 0);
const startDist = Math.hypot(diver.x - p.x, diver.y - p.y);
let t = 0;
const dt = 1 / 60;
for (let i = 0; i < 60; i++) { t += dt; p.update(dt, t, diver); }
const endDist = Math.hypot(diver.x - p.x, diver.y - p.y);
assert('a piranha 200px from the diver converges over 60 frames', endDist < startDist);

// Points.
assert('Piranha.points === 40', p.points === 40);

// Factory: spawnCreature({k:'piranha'}, x, y, reef, opts) returns an array of 6-9 units.
const swarm = spawnCreature({ k: 'piranha' }, 100, 100, 1, {});
assert('spawnCreature piranha returns an array', Array.isArray(swarm));
assert('the swarm has 6-9 units', swarm.length >= 6 && swarm.length <= 9);
assert('every swarm unit is a Piranha', swarm.every((u) => u instanceof Piranha));
assert('swarm units are clustered within ~40px of the spawn point', swarm.every((u) => Math.hypot(u.x - 100, u.y - 100) <= 40));

done();
