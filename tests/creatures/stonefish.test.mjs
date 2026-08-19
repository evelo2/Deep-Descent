// Tests for the Stonefish (camouflaged bottom-dweller) hazard + the `lit`
// plumbing it introduces (src/entities/creatures.js + spawn.js).
// Run: node tests/creatures/stonefish.test.mjs

import { Stonefish } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

// Far from the diver, unlit: stays hidden.
{
  const diver = { x: 0, y: 0, radius: 15 };
  const sf = new Stonefish(1000, 1000);
  sf.update(1 / 60, 0, diver, false);
  assert('revealed is false when far + unlit', sf.revealed === false);
}

// lit truthy reveals it even far away.
{
  const diver = { x: 0, y: 0, radius: 15 };
  const sf = new Stonefish(1000, 1000);
  sf.update(1 / 60, 0, diver, true);
  assert('revealed is true when lit is truthy', sf.revealed === true);
}

// Diver within revealRange reveals it even unlit.
{
  const diver = { x: 0, y: 0, radius: 15 };
  const sf = new Stonefish(CREATURES.stonefish.revealRange - 5, 0);
  sf.update(1 / 60, 0, diver, false);
  assert('revealed is true when diver is within revealRange', sf.revealed === true);
}

// hits() is unaffected by revealed — contact always damages.
{
  const diver = { x: 0, y: 0, radius: 15 };
  const sf = new Stonefish(1000, 1000);
  sf.update(1 / 60, 0, diver, false);
  sf.x = diver.x; sf.y = diver.y; // force contact
  assert('hits() is true on contact regardless of revealed (hidden)', sf.hits(diver) === true);
}
{
  const diver = { x: 0, y: 0, radius: 15 };
  const sf = new Stonefish(1000, 1000);
  sf.update(1 / 60, 0, diver, true);
  sf.x = diver.x; sf.y = diver.y; // force contact
  assert('hits() is true on contact regardless of revealed (lit)', sf.hits(diver) === true);
}

// Config + points wiring.
assert('CREATURES.stonefish is configured', !!CREATURES.stonefish);
assert('KILL_POINTS.Stonefish === 180', KILL_POINTS.Stonefish === 180);

// Factory wiring.
{
  const sf = spawnCreature({ k: 'stonefish' }, 100, 100, 1, {});
  assert('spawnCreature stonefish returns a Stonefish', sf instanceof Stonefish);
}

done();
