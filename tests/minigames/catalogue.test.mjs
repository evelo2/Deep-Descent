// The catalogue is what the shell reads at boot: every manifest, no engines.
import { CATALOGUE, manifestById, validateCatalogue } from '../../src/minigames/catalogue.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

check(Array.isArray(CATALOGUE) && CATALOGUE.length >= 2, 'the catalogue lists every minigame');
check(CATALOGUE[0].id === 'legacy', 'the base game is first in display order');
check(validateCatalogue().length === 0,
  `the whole catalogue is valid (${validateCatalogue().join('; ')})`);

check(manifestById('match3').name === 'Treasure Chest Madness', 'manifestById finds a manifest');
check(manifestById('nope') === undefined, 'manifestById returns undefined for an unknown id');

// Every id is unique across the catalogue.
const ids = CATALOGUE.map((m) => m.id);
check(new Set(ids).size === ids.length, 'minigame ids are unique');

// The whole point of Approach A: reading the catalogue loads NO engine. Every
// module reference must still be an unresolved thunk.
for (const m of CATALOGUE) {
  check(typeof m.module === 'function', `${m.id} exposes an unresolved module thunk`);
}

// And the catalogue itself must be pure data — a manifest that reached in and
// imported its engine would break lazy loading silently.
const src = await (await import('node:fs/promises')).readFile(
  new URL('../../src/minigames/catalogue.js', import.meta.url), 'utf8');
check(!/from '\.\/[a-z0-9]+\/index\.js'/.test(src),
  'catalogue.js imports manifests only, never an engine index.js');

// --- Test coverage for same-kind duplicates ---

// Test case 1: same-kind duplicate inside ONE manifest is reported
const fixtureDupBadge = {
  id: 'fixture1',
  contract: 1,
  name: 'Fixture 1',
  version: '1.0.0',
  entries: [{ id: 'play', kind: 'menu', label: 'Play' }],
  capabilities: ['economy'],
  goals: {
    badges: [
      { id: 'sameid', name: 'Badge A', glyph: '🏆', desc: 'First.' },
      { id: 'sameid', name: 'Badge B', glyph: '⭐', desc: 'Second.' },
    ],
  },
  module: () => Promise.resolve({}),
};
const dupBadgeErrs = validateCatalogue([fixtureDupBadge]);
check(dupBadgeErrs.some((e) => /badge id 'sameid'/.test(e) && /fixture1.*fixture1/.test(e)),
  'a duplicate badge id within one manifest is reported');

// Test case 2: same-kind duplicate across TWO manifests is reported
const fixtureA = {
  id: 'fixtureA',
  contract: 1,
  name: 'Fixture A',
  version: '1.0.0',
  entries: [{ id: 'play', kind: 'menu', label: 'Play' }],
  capabilities: ['economy'],
  goals: {
    stats: [{ key: 'sharedkey', label: 'Shared Stat' }],
  },
  module: () => Promise.resolve({}),
};
const fixtureB = {
  id: 'fixtureB',
  contract: 1,
  name: 'Fixture B',
  version: '1.0.0',
  entries: [{ id: 'play', kind: 'menu', label: 'Play' }],
  capabilities: ['economy'],
  goals: {
    stats: [{ key: 'sharedkey', label: 'Another Stat' }],
  },
  module: () => Promise.resolve({}),
};
const dupStatErrs = validateCatalogue([fixtureA, fixtureB]);
check(dupStatErrs.some((e) => /stat key 'sharedkey'/.test(e) && /fixtureA/.test(e) && /fixtureB/.test(e)),
  'a duplicate stat key across two manifests is reported');

// Test case 3: a stat key and a track id sharing a string within one manifest is NOT reported
const fixtureMixed = {
  id: 'fixtureMixed',
  contract: 1,
  name: 'Fixture Mixed',
  version: '1.0.0',
  entries: [{ id: 'play', kind: 'menu', label: 'Play' }],
  capabilities: ['economy'],
  goals: {
    stats: [{ key: 'dives', label: 'Dives' }],
    tracks: [{ id: 'dives', stat: 'dives', tiers: [1, 2, 3] }],
  },
  module: () => Promise.resolve({}),
};
const mixedErrs = validateCatalogue([fixtureMixed]);
check(!mixedErrs.some((e) => /dives/.test(e)),
  'a stat key and track id sharing a string within one manifest is not reported as a conflict');

// --- single source of truth: main.js must source its manifests THROUGH the
// catalogue (manifestById), not by importing manifest.js files directly —
// otherwise a third minigame could be registered in one place and forgotten
// in the other. main.js can't be imported under Node (it touches the DOM),
// so this is a source-grep, same precedent as
// tests/core/capabilities.test.mjs's main.js checks.
const mainSrc = await (await import('node:fs/promises')).readFile(
  new URL('../../src/main.js', import.meta.url), 'utf8');
check(!/from '\.\/minigames\/[a-z0-9]+\/manifest\.js'/.test(mainSrc),
  'main.js does not import a minigame manifest.js directly — manifests come from the catalogue');
check(/from '\.\/minigames\/catalogue\.js'/.test(mainSrc) && /\bmanifestById\b/.test(mainSrc),
  'main.js sources manifests via catalogue.manifestById');

// --- registration parity: every manifest in CATALOGUE is registered by
// main.js (core.register(...)), and every minigame main.js registers is in
// CATALOGUE. Catches a later phase adding a third minigame in only one of the
// two places.
const registerCalls = [...mainSrc.matchAll(/core\.register\(([^)]*)\)/g)].map((m) => m[1]);
check(registerCalls.length === CATALOGUE.length,
  `main.js has one core.register(...) call per catalogue entry (found ${registerCalls.length}, want ${CATALOGUE.length})`);
for (const m of CATALOGUE) {
  check(registerCalls.some((args) => args.includes(m.id)),
    `main.js registers catalogue entry '${m.id}' via core.register(...)`);
}
for (const args of registerCalls) {
  check(CATALOGUE.some((m) => args.includes(m.id)),
    `main.js's core.register(${args}) call corresponds to a catalogue entry`);
}

console.log(`ok catalogue.test.mjs (${pass} checks)`);
