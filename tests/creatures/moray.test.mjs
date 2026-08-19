// Tests for the Moray ambusher (src/entities/creatures.js + spawn.js).
// Run: node tests/creatures/moray.test.mjs

import { Moray } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const dt = 1 / 60;

// Diver outside strikeRange: stays hidden, head parked at the anchor.
{
  const diver = { x: 500, y: 0, radius: 15 };
  const m = new Moray(0, 0);
  let t = 0;
  for (let i = 0; i < 60; i++) { t += dt; m.update(dt, t, diver); }
  assert('diver outside strikeRange stays hidden', m.state === 'hidden');
  assert('hidden head sits at the anchor (x)', m.x === m.ax);
  assert('hidden head sits at the anchor (y)', m.y === m.ay);
}

// Diver inside strikeRange: enters strike and the head leaves the anchor,
// extending toward the diver.
{
  const diver = { x: 50, y: 0, radius: 15 };
  const m = new Moray(0, 0);
  let t = 0;
  t += dt; m.update(dt, t, diver);
  assert('diver inside strikeRange enters strike', m.state === 'strike');

  t += dt; m.update(dt, t, diver);
  assert('head leaves the anchor during strike', m.x !== m.ax);
  assert('head extends toward the diver (positive x direction)', m.x > m.ax);
}

// After strikeTime, returns to hidden; cooldown blocks an immediate re-strike
// even though the diver is still in range.
{
  const diver = { x: 50, y: 0, radius: 15 };
  const m = new Moray(0, 0);
  let t = 0;
  t += dt; m.update(dt, t, diver);
  assert('enters strike', m.state === 'strike');

  const P = CREATURES.moray;
  let guard = 0;
  while (m.state === 'strike' && guard < 200) { t += dt; m.update(dt, t, diver); guard++; }
  assert('returns to hidden after strikeTime', m.state === 'hidden');

  // Still well within cooldown: diver in range but no re-strike yet. This
  // tick also runs the 'hidden' branch, which snaps the head back to anchor.
  t += dt; m.update(dt, t, diver);
  assert('cooldown blocks an immediate re-strike', m.state === 'hidden');
  assert('head back at the anchor once hidden', m.x === m.ax && m.y === m.ay);

  // Advance past the cooldown window; now it may strike again.
  let guard2 = 0;
  while (m.state === 'hidden' && guard2 < 400) { t += dt; m.update(dt, t, diver); guard2++; }
  assert('strikes again once the cooldown elapses', m.state === 'strike');
}

// A snared moray is inert — update() is a no-op while snareT > 0.
{
  const diver = { x: 50, y: 0, radius: 15 };
  const m = new Moray(0, 0);
  m.snareT = 1;
  let t = 0;
  t += dt; m.update(dt, t, diver);
  assert('snared moray stays hidden despite the diver being in range', m.state === 'hidden');
  assert('snared moray head stays at the anchor', m.x === m.ax && m.y === m.ay);
}

// Only the extended head is a hazard: a HIDDEN moray never bites, even with the
// diver sitting right on its anchor (the anchor is in open water, not a wall).
{
  const m = new Moray(0, 0);
  const onAnchor = { x: 0, y: 0, radius: 15 };
  assert('hidden moray does NOT bite the diver on its anchor', m.hits(onAnchor) === false);
  // Drive it into a strike, then the extended head IS a hazard where it reaches.
  const diver = { x: 40, y: 0, radius: 15 };
  let t = 0, guard = 0;
  while (m.state !== 'strike' && guard++ < 300) { t += dt; m.update(dt, t, diver); }
  assert('moray entered a strike', m.state === 'strike');
  const atHead = { x: m.x, y: m.y, radius: 15 };
  assert('striking moray bites at its extended head', m.hits(atHead) === true);
}

// Config + points wiring.
assert('CREATURES.moray is configured', !!CREATURES.moray);
assert('KILL_POINTS.Moray === 240', KILL_POINTS.Moray === 240);

// Factory wiring.
{
  const m = spawnCreature({ k: 'moray' }, 100, 100, 1, {});
  assert('spawnCreature moray returns a Moray', m instanceof Moray);
}

done();
