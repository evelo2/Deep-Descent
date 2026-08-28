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

console.log(`ok catalogue.test.mjs (${pass} checks)`);
