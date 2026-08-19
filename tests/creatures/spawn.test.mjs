// Tests for the data-driven zone spawn framework (src/entities/spawn.js).
// Run: node tests/creatures/spawn.test.mjs

import { pickFauna, spawnCreature, ZONE_FAUNA } from '../../src/entities/spawn.js';
import { Shark, Octopus, Jelly, Puffer, Eel, Angler } from '../../src/entities/creatures.js';

let passed = 0, failed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

// pickFauna('shallow', 1) always returns one of the shallow roster's keys.
const shallowKeys = new Set(['jelly', 'puffer', 'shark', 'piranha']);
let allShallow = true;
for (let i = 0; i < 100; i++) {
  const e = pickFauna('shallow', 1);
  if (!e || !shallowKeys.has(e.k)) { allShallow = false; break; }
}
assert("pickFauna('shallow', 1) returns only shallow-band fauna", allShallow);

// Unknown band → null.
assert("pickFauna('nope', 1) returns null for an unknown band", pickFauna('nope', 1) === null);

// minReef gating: a temporary high-minReef entry is filtered out below its
// threshold, and reachable once the reef meets it.
ZONE_FAUNA.shallow.push({ k: 'x', w: 1, minReef: 9 });
let neverXBelowThreshold = true;
for (let i = 0; i < 300; i++) { if (pickFauna('shallow', 1).k === 'x') { neverXBelowThreshold = false; break; } }
assert('a minReef entry is filtered out below its threshold', neverXBelowThreshold);
// With rng pinned near 1, the weighted pick lands on the last pool entry —
// confirm 'x' is reachable once the reef meets its minReef.
const pickedAtThreshold = pickFauna('shallow', 9, () => 0.999);
assert('the same entry is reachable once reef >= minReef', pickedAtThreshold.k === 'x');
ZONE_FAUNA.shallow.pop();   // restore the real table for anything run after this

// spawnCreature: shark scale bands honor opts.sizeUp.
const bigShark = spawnCreature({ k: 'shark', scale: 'big' }, 0, 0, 3, { sizeUp: 0.2 });
assert("spawnCreature({k:'shark',scale:'big'}) yields a Shark", bigShark instanceof Shark);
assert('big shark scale >= 1.3 (base 1.3 + sizeUp + jitter)', bigShark.scale >= 1.3);

// Every existing key builds the right class.
assert('octopus key builds Octopus', spawnCreature({ k: 'octopus' }, 0, 0, 1) instanceof Octopus);
assert('jelly key builds Jelly', spawnCreature({ k: 'jelly' }, 0, 0, 1) instanceof Jelly);
assert('puffer key builds Puffer', spawnCreature({ k: 'puffer' }, 0, 0, 1) instanceof Puffer);
assert('eel key builds Eel', spawnCreature({ k: 'eel' }, 0, 0, 1) instanceof Eel);
assert('angler key builds Angler', spawnCreature({ k: 'angler' }, 0, 0, 1) instanceof Angler);
assert('shark key with no scale still builds a Shark', spawnCreature({ k: 'shark' }, 0, 0, 1) instanceof Shark);
assert('unknown key returns null', spawnCreature({ k: 'nope' }, 0, 0, 1) === null);

done();
