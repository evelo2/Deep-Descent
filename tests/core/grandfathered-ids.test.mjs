// The save-compatibility guarantee. Every id shipped before P11.1 lives under a
// bare key in deepdescent.badges.v1 / deepdescent.stats.v1 and (for badges and
// track tiers) is registered as a Steam achievement id. This test asserts the
// frozen allow-list matches the LIVE tables exactly, item for item — so any
// rename, removal or accidental namespacing fails here instead of in a player's
// save file.
import { GRANDFATHERED } from '../../src/core/grandfathered-ids.js';
import { BADGES } from '../../src/meta/badges.js';
import { STAT_KEYS } from '../../src/meta/stats.js';
import { TRACKS } from '../../src/meta/progressive.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const sameSet = (set, list, label) => {
  const arr = [...list].sort();
  const got = [...set].sort();
  const missing = arr.filter((x) => !set.has(x));
  const extra = got.filter((x) => !list.includes(x));
  check(missing.length === 0, `${label}: allow-list is missing ${missing.join(', ')}`);
  check(extra.length === 0, `${label}: allow-list has stale entries ${extra.join(', ')}`);
  check(set.size === arr.length, `${label}: allow-list size matches the live table (${arr.length})`);
};

sameSet(GRANDFATHERED.badges, BADGES.map((b) => b.id), 'badges');
sameSet(GRANDFATHERED.stats, [...STAT_KEYS], 'stats');
sameSet(GRANDFATHERED.tracks, TRACKS.map((t) => t.id), 'tracks');

// The list is frozen: nothing may be added at runtime.
let threw = false;
try { GRANDFATHERED.badges.add('newthing'); } catch { threw = true; }
check(threw || !GRANDFATHERED.badges.has('newthing'),
  'the grandfathered badge set rejects runtime additions');

// Not one grandfathered id may contain a namespace separator — that is the
// whole point: these are the BARE ids already on disk.
for (const kind of ['badges', 'stats', 'tracks']) {
  const bad = [...GRANDFATHERED[kind]].filter((id) => id.includes(':'));
  check(bad.length === 0, `${kind}: no grandfathered id contains ':' (got ${bad.join(', ')})`);
}

console.log(`ok grandfathered-ids.test.mjs (${pass} checks)`);
