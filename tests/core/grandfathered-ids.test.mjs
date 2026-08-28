// The save-compatibility guarantee. Every id shipped before P11.1 lives under a
// bare key in deepdescent.badges.v1 / deepdescent.stats.v1 and (for badges and
// track tiers) is registered as a Steam achievement id.
//
// src/meta/ is still the RUNTIME source of truth for these tables (a later
// phase migrates it), so that is exactly where a new badge/stat/track must be
// added today. The assertion below is therefore deliberately ONE-DIRECTIONAL,
// not set equality:
//   (a) every GRANDFATHERED id must still exist in the live table — this is
//       the save-safety guarantee (a rename or removal orphans live saves),
//       and stays strict.
//   (b) every live id NOT in GRANDFATHERED must be namespaced ('<minigameId>:
//       <key>') — this is how a brand-new goal proves it followed the
//       namespacing rule, instead of being told (wrongly) to add itself to
//       the frozen allow-list, which src/core/grandfathered-ids.js's own
//       header forbids ("NOTHING MAY BE ADDED HERE").
// Equality would make check (b) fire on every legitimate new goal with a
// message ("allow-list is missing X") that points the developer straight at
// the frozen file — silently hollowing out the namespacing guarantee the
// first time someone follows it.
import { GRANDFATHERED } from '../../src/core/grandfathered-ids.js';
import { BADGES } from '../../src/meta/badges.js';
import { STAT_KEYS } from '../../src/meta/stats.js';
import { TRACKS } from '../../src/meta/progressive.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

/**
 * The two one-directional violation lists for a (grandfathered, live) pair.
 * Pure — returns violations rather than asserting, so the exact same logic
 * can be exercised both against the real meta/ tables and against a fixture.
 * @param {Set<string>} grandfathered  The frozen allow-list for this kind.
 * @param {string[]} live              The live ids from src/meta/ (or a fixture).
 */
const oneDirectionalViolations = (grandfathered, live) => {
  const liveSet = new Set(live);
  return {
    // (a) grandfathered ids that no longer exist live — save-safety guarantee.
    vanished: [...grandfathered].filter((id) => !liveSet.has(id)),
    // (b) live ids that aren't grandfathered and aren't namespaced — a new
    // goal must be namespaced '<minigameId>:<key>', NOT added to the frozen list.
    unnamespacedNew: live.filter((id) => !grandfathered.has(id) && !id.includes(':')),
  };
};

/**
 * @param {Set<string>} grandfathered  The frozen allow-list for this kind.
 * @param {string[]} live              The live ids from src/meta/.
 * @param {string} label               'badges' | 'stats' | 'tracks'.
 */
const checkOneDirectional = (grandfathered, live, label) => {
  const { vanished, unnamespacedNew } = oneDirectionalViolations(grandfathered, live);

  check(vanished.length === 0,
    `${label}: shipped id(s) ${vanished.join(', ')} vanished from the live table — ` +
    'this breaks live player saves (deepdescent.badges.v1 / stats.v1 stores these as bare keys)');

  check(unnamespacedNew.length === 0,
    `${label}: new goal id(s) ${unnamespacedNew.join(', ')} must be namespaced ` +
    "'<minigameId>:<key>' — do NOT add them to src/core/grandfathered-ids.js " +
    '(its header says nothing may be added there)');
};

checkOneDirectional(GRANDFATHERED.badges, BADGES.map((b) => b.id), 'badges');
checkOneDirectional(GRANDFATHERED.stats, [...STAT_KEYS], 'stats');
checkOneDirectional(GRANDFATHERED.tracks, TRACKS.map((t) => t.id), 'tracks');

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

// --- prove check (b) actually fires, using FIXTURE live-tables (never
// mutating src/meta/): a bare, non-grandfathered id must be reported, and a
// properly namespaced one must not.
{
  const { unnamespacedNew } = oneDirectionalViolations(
    GRANDFATHERED.badges, ['firstblood', 'krakenslayer', 'newthing']);
  check(unnamespacedNew.includes('newthing'),
    'a bare non-grandfathered id in a fixture live table is reported as needing a namespace');
}
{
  const { unnamespacedNew } = oneDirectionalViolations(
    GRANDFATHERED.badges, ['firstblood', 'krakenslayer', 'match3:newthing']);
  check(unnamespacedNew.length === 0,
    'a properly namespaced new id in a fixture live table is not reported');
}
{
  // And (a) fires on a fixture that DROPS a shipped id — the save-safety half.
  const { vanished } = oneDirectionalViolations(
    GRANDFATHERED.badges, [...GRANDFATHERED.badges].filter((id) => id !== 'firstblood'));
  check(vanished.includes('firstblood'),
    'a fixture live table missing a shipped grandfathered id is reported as vanished');
}

console.log(`ok grandfathered-ids.test.mjs (${pass} checks)`);
