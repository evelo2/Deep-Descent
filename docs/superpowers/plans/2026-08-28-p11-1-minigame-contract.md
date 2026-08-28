# P11.1 — Minigame Contract v1 + Manifests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the declarative manifest layer to the platform — a validated
`manifest.js` per minigame, a statically-imported `catalogue.js`, Core-side
contract validation, and a capability-built Host — with zero player-visible
behaviour change and zero save migration.

**Architecture:** Each minigame folder gains a pure-data `manifest.js`
(`export default {…}` with no imports and exactly one function, the `module`
thunk). `src/minigames/catalogue.js` statically imports every manifest, so the
shell knows the whole catalogue at boot without loading an engine. A new
`src/core/manifest.js` holds `validateManifest()`; `Core.register()` accepts an
optional manifest and validates it, and builds each minigame's Host facade from
its declared `capabilities`. Registration stays eager in P11.1 — the `module`
thunk is declared and resolution-tested now, and becomes the launch path in
P11.3.

**Tech Stack:** Plain ES modules, no build step, no framework. Tests are bare
`node tests/**/*.test.mjs` scripts using the house `check()` helper.
`npm run typecheck` (`tsc --noEmit`) types the boundary via `// @ts-check`.

**Spec:** `docs/superpowers/specs/2026-08-25-minigame-platform-contract-design.md`

## Global Constraints

- **No build step.** The browser runs the `.js` files untouched. No bundler, no
  transpile, no new runtime dependency.
- **`manifest.js` must stay pure data.** `export default { … }`, **no imports**,
  and exactly one function: the `module:` loader thunk. This protects the
  Approach C (JSON manifests) door — spec §1 decision #6.
- **Contract version is `1`.** Every manifest sets `contract: 1`. Core refuses
  any other value loudly.
- **Zero save migration.** `deepdescent.badges.v1` and `deepdescent.stats.v1`
  keep their existing bare ids. No shipped id is renamed by this phase.
- **Grandfathering rule (corrects spec §3.4 decision #8):** an id must be
  namespaced `<minigameId>:<key>` **unless** it appears in the frozen
  pre-P11.1 allow-list. The list is frozen by id, not by owning manifest —
  match-3 already ships bare ids (`hoardcleared`, `m3Pearls`, …) and renaming
  them would break the very saves decision #8 protects.
- **Test style:** each test file is a standalone `node` script that defines
  `const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };`
  and ends with `console.log(\`ok <name>.test.mjs (${pass} checks)\`)`.
- **Full suite command:**
  `for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done`
- **Every new `src/` file starts with `// @ts-check`.**

---

### Task 1: `validateManifest` — the contract v1 rule engine

The pure function every manifest is checked against. Written first so the
manifests in Task 3 have something to prove themselves against.

**Files:**
- Create: `src/core/manifest.js`
- Test: `tests/core/manifest.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CONTRACT_VERSION` → `number` (the constant `1`).
  - `GATED_CAPABILITIES` → `string[]`, exactly `['economy', 'progression', 'achievements', 'world']`.
  - `validateManifest(manifest, opts?)` → `string[]` of human-readable error
    messages; **empty array means valid**. `opts.grandfathered` is an optional
    `{ badges: Set<string>, stats: Set<string>, tracks: Set<string> }` used by
    the namespacing rule; when omitted, every goal id must be namespaced.
  - `assertManifest(manifest, opts?)` → the manifest, or throws `Error` whose
    message joins the errors with `'; '`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/manifest.test.mjs`:

```js
// Contract v1 validation rules: identity, contract version, capabilities,
// entries, the module thunk, and the goal-id namespacing rule.
import {
  CONTRACT_VERSION, GATED_CAPABILITIES, validateManifest, assertManifest,
} from '../../src/core/manifest.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

check(CONTRACT_VERSION === 1, 'contract version is 1');
check(GATED_CAPABILITIES.join(',') === 'economy,progression,achievements,world',
  'the gated capability list is the four Host services');

// A minimal valid manifest — the baseline every other case mutates.
const base = () => ({
  id: 'demo',
  contract: 1,
  name: 'Demo Game',
  version: '1.0.0',
  icon: '🎮',
  blurb: 'A demo.',
  capabilities: ['economy'],
  entries: [{ id: 'arcade', kind: 'menu', label: 'Play Demo' }],
  controls: { actions: [{ id: 'go', label: 'Go', keys: ['Space'] }] },
  help: [{ title: 'HOW TO PLAY', lines: ['Press space.'] }],
  goals: { stats: [], badges: [], tracks: [] },
  module: () => Promise.resolve({}),
});

check(validateManifest(base()).length === 0, 'the baseline manifest is valid');

// --- identity ---
const noId = base(); delete noId.id;
check(validateManifest(noId).some((e) => /id/.test(e)), 'a missing id is an error');
const badId = base(); badId.id = 'Demo Game';
check(validateManifest(badId).some((e) => /id/.test(e)),
  'an id with non-slug characters is an error');
const noName = base(); delete noName.name;
check(validateManifest(noName).some((e) => /name/.test(e)), 'a missing name is an error');
const badVer = base(); badVer.version = 'v1';
check(validateManifest(badVer).some((e) => /version/.test(e)),
  'a non-semver version is an error');

// --- contract version ---
const wrongContract = base(); wrongContract.contract = 2;
check(validateManifest(wrongContract).some((e) => /contract/.test(e)),
  'a contract version other than 1 is an error');

// --- capabilities ---
const badCap = base(); badCap.capabilities = ['economy', 'telepathy'];
check(validateManifest(badCap).some((e) => /telepathy/.test(e)),
  'an unknown capability is an error');

// --- entries ---
const noEntries = base(); noEntries.entries = [];
check(validateManifest(noEntries).some((e) => /entr/i.test(e)),
  'a manifest with no entries is an error');
const badKind = base(); badKind.entries = [{ id: 'x', kind: 'psychic', label: 'X' }];
check(validateManifest(badKind).some((e) => /psychic/.test(e)),
  'an entry kind other than world/menu is an error');
const dupEntry = base();
dupEntry.entries = [
  { id: 'a', kind: 'menu', label: 'A' },
  { id: 'a', kind: 'world', label: 'A again' },
];
check(validateManifest(dupEntry).some((e) => /duplicate/i.test(e)),
  'duplicate entry ids are an error');

// --- the module thunk ---
const noModule = base(); delete noModule.module;
check(validateManifest(noModule).some((e) => /module/.test(e)),
  'a missing module thunk is an error');

// --- purity: the thunk is the ONLY function allowed ---
const extraFn = base(); extraFn.goals.badges = [
  { id: 'demo:win', name: 'Winner', glyph: '🏆', desc: 'Win.', test: () => true },
];
check(validateManifest(extraFn).some((e) => /function/.test(e)),
  'a function anywhere but the module thunk is an error (manifests stay pure data)');

// --- namespacing ---
const bareGoal = base();
bareGoal.goals.badges = [{ id: 'winner', name: 'Winner', glyph: '🏆', desc: 'Win.' }];
check(validateManifest(bareGoal).some((e) => /namespac/i.test(e)),
  'a bare goal id is an error with no grandfather list');

const nsGoal = base();
nsGoal.goals.badges = [{ id: 'demo:winner', name: 'Winner', glyph: '🏆', desc: 'Win.' }];
check(validateManifest(nsGoal).length === 0, 'a namespaced goal id is valid');

const wrongNs = base();
wrongNs.goals.badges = [{ id: 'other:winner', name: 'Winner', glyph: '🏆', desc: 'Win.' }];
check(validateManifest(wrongNs).some((e) => /namespac/i.test(e)),
  "a goal namespaced to another minigame's id is an error");

const grandfathered = { badges: new Set(['winner']), stats: new Set(), tracks: new Set() };
check(validateManifest(bareGoal, { grandfathered }).length === 0,
  'a bare goal id on the grandfather list is valid');

// Stats and tracks obey the same rule.
const bareStat = base();
bareStat.goals.stats = [{ key: 'wins', label: 'Wins' }];
check(validateManifest(bareStat).some((e) => /namespac/i.test(e)),
  'a bare stat key is an error');
check(validateManifest(bareStat, { grandfathered: { badges: new Set(), stats: new Set(['wins']), tracks: new Set() } }).length === 0,
  'a grandfathered bare stat key is valid');

const bareTrack = base();
bareTrack.goals.stats = [{ key: 'demo:wins', label: 'Wins' }];
bareTrack.goals.tracks = [{ id: 'winstreak', stat: 'demo:wins', tiers: [1, 2, 3] }];
check(validateManifest(bareTrack).some((e) => /namespac/i.test(e)),
  'a bare track id is an error');

// A track must point at a stat this manifest declares.
const danglingTrack = base();
danglingTrack.goals.tracks = [{ id: 'demo:streak', stat: 'demo:nope', tiers: [1, 2, 3] }];
check(validateManifest(danglingTrack).some((e) => /demo:nope/.test(e)),
  'a track referencing an undeclared stat is an error');

// --- assertManifest ---
check(assertManifest(base()).id === 'demo', 'assertManifest returns a valid manifest');
let threw = false;
try { assertManifest(noId); } catch (e) { threw = /id/.test(e.message); }
check(threw, 'assertManifest throws on an invalid manifest');

console.log(`ok manifest.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node tests/core/manifest.test.mjs`
Expected: FAIL — `Cannot find module '.../src/core/manifest.js'`

- [ ] **Step 3: Write the implementation**

Create `src/core/manifest.js`:

```js
// @ts-check
// Contract v1 validation — the rules a minigame's manifest.js must satisfy.
// Pure and dependency-free: it takes a manifest object and returns a list of
// human-readable problems (empty = valid). Core calls assertManifest() at
// registration so a broken manifest fails loudly at boot rather than at some
// later frame. See docs/superpowers/specs/2026-08-25-minigame-platform-contract-design.md §3.

/** The ABI version every contract-v1 manifest must declare. */
export const CONTRACT_VERSION = 1;

/**
 * Host services a minigame must opt into. Anything NOT on this list (audio,
 * input, particles, viewport, rng, open, close) is always present — those are
 * the shell itself, not a capability.
 */
export const GATED_CAPABILITIES = ['economy', 'progression', 'achievements', 'world'];

const SLUG = /^[a-z][a-z0-9]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ENTRY_KINDS = ['world', 'menu'];

/** True when `id` is namespaced to `owner` — i.e. exactly `owner:<slug-ish>`. */
function namespacedTo(id, owner) {
  if (typeof id !== 'string') return false;
  const cut = id.indexOf(':');
  return cut > 0 && id.slice(0, cut) === owner && id.length > cut + 1;
}

/**
 * Walk a value and report any function found at a path other than the root
 * `module` thunk. Manifests must stay serialisable (spec §1 decision #6).
 * @param {*} value
 * @param {string} path
 * @param {string[]} out
 */
function findFunctions(value, path, out) {
  if (typeof value === 'function') { out.push(path); return; }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findFunctions(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) findFunctions(value[k], `${path}.${k}`, out);
  }
}

/**
 * @param {*} m  The manifest object (a module's default export).
 * @param {Object} [opts]
 * @param {{badges: Set<string>, stats: Set<string>, tracks: Set<string>}} [opts.grandfathered]
 *        Ids shipped before P11.1 that are allowed to stay bare. Omit to
 *        require namespacing everywhere.
 * @returns {string[]} problems; empty means valid.
 */
export function validateManifest(m, { grandfathered } = {}) {
  /** @type {string[]} */
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];

  // --- identity ---
  if (typeof m.id !== 'string' || !SLUG.test(m.id)) {
    errs.push(`id must be a lowercase slug, got ${JSON.stringify(m.id)}`);
  }
  if (typeof m.name !== 'string' || !m.name) errs.push('name must be a non-empty string');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) {
    errs.push(`version must be semver, got ${JSON.stringify(m.version)}`);
  }
  if (m.contract !== CONTRACT_VERSION) {
    errs.push(`contract must be ${CONTRACT_VERSION}, got ${JSON.stringify(m.contract)}`);
  }

  // --- capabilities ---
  const caps = m.capabilities;
  if (!Array.isArray(caps)) {
    errs.push('capabilities must be an array');
  } else {
    for (const c of caps) {
      if (!GATED_CAPABILITIES.includes(c)) errs.push(`unknown capability '${c}'`);
    }
  }

  // --- entries ---
  if (!Array.isArray(m.entries) || m.entries.length === 0) {
    errs.push('entries must be a non-empty array');
  } else {
    const seen = new Set();
    for (const e of m.entries) {
      if (!e || typeof e.id !== 'string' || !e.id) { errs.push('every entry needs an id'); continue; }
      if (seen.has(e.id)) errs.push(`duplicate entry id '${e.id}'`);
      seen.add(e.id);
      if (!ENTRY_KINDS.includes(e.kind)) errs.push(`entry '${e.id}' has unknown kind '${e.kind}'`);
      if (typeof e.label !== 'string' || !e.label) errs.push(`entry '${e.id}' needs a label`);
    }
  }

  // --- the module thunk ---
  if (typeof m.module !== 'function') errs.push('module must be a () => import(...) thunk');

  // --- purity: the thunk is the only function permitted ---
  /** @type {string[]} */
  const fns = [];
  for (const k of Object.keys(m)) {
    if (k === 'module') continue;
    findFunctions(m[k], k, fns);
  }
  for (const p of fns) {
    errs.push(`function found at '${p}' — manifests must be pure data (only 'module' may be a function)`);
  }

  // --- goals + the namespacing rule ---
  const goals = m.goals || {};
  const owner = typeof m.id === 'string' ? m.id : '';
  const allowed = grandfathered || { badges: new Set(), stats: new Set(), tracks: new Set() };
  const declaredStats = new Set();

  const checkId = (id, kind, allowList) => {
    if (typeof id !== 'string' || !id) { errs.push(`every ${kind} needs an id`); return; }
    if (allowList.has(id)) return;                       // grandfathered, stays bare
    if (!namespacedTo(id, owner)) {
      errs.push(`${kind} '${id}' must be namespaced '${owner}:<key>'`);
    }
  };

  for (const s of goals.stats || []) {
    checkId(s && s.key, 'stat', allowed.stats);
    if (s && typeof s.key === 'string') declaredStats.add(s.key);
  }
  for (const b of goals.badges || []) checkId(b && b.id, 'badge', allowed.badges);
  for (const t of goals.tracks || []) {
    checkId(t && t.id, 'track', allowed.tracks);
    if (t && typeof t.stat === 'string' && !declaredStats.has(t.stat)) {
      errs.push(`track '${t.id}' references stat '${t.stat}' which this manifest does not declare`);
    }
    if (t && !Array.isArray(t.tiers)) errs.push(`track '${t && t.id}' needs a tiers array`);
  }

  return errs;
}

/**
 * validateManifest, but throws instead of returning problems.
 * @param {*} m
 * @param {Object} [opts]
 * @returns {*} the manifest, unchanged
 */
export function assertManifest(m, opts) {
  const errs = validateManifest(m, opts);
  if (errs.length) {
    throw new Error(`invalid manifest${m && m.id ? ` '${m.id}'` : ''}: ${errs.join('; ')}`);
  }
  return m;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node tests/core/manifest.test.mjs`
Expected: PASS — `ok manifest.test.mjs (26 checks)`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add src/core/manifest.js tests/core/manifest.test.mjs
git commit -m "feat(p11): contract v1 manifest validation rules"
```

---

### Task 2: The frozen grandfathered-id allow-list

The list of ids shipped before P11.1 that may stay bare. Its regression test is
the guarantee that no future rename silently orphans a player's Trophy Wall or a
registered Steam achievement id (spec §6).

**Files:**
- Create: `src/core/grandfathered-ids.js`
- Test: `tests/core/grandfathered-ids.test.mjs`

**Interfaces:**
- Consumes: `validateManifest` from Task 1 (only in spirit — no import).
- Produces: `GRANDFATHERED` → `{ badges: Set<string>, stats: Set<string>, tracks: Set<string> }`,
  ready to pass as `validateManifest(m, { grandfathered: GRANDFATHERED })`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/grandfathered-ids.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node tests/core/grandfathered-ids.test.mjs`
Expected: FAIL — `Cannot find module '.../src/core/grandfathered-ids.js'`

- [ ] **Step 3: Write the implementation**

Create `src/core/grandfathered-ids.js`:

```js
// @ts-check
// FROZEN. These are the goal ids that shipped before the P11.1 manifest layer.
// They live under BARE keys in `deepdescent.badges.v1` and
// `deepdescent.stats.v1`, and the badge + track-tier ids are registered as
// Steam achievement ids on the partner site. Renaming or namespacing any of
// them would orphan live player progress, so contract v1 exempts exactly this
// list from the `<minigameId>:<key>` namespacing rule (spec §3.4 decision #8).
//
// NOTHING MAY BE ADDED HERE. Every goal declared from P11.1 onward — including
// new match-3 goals — must be namespaced. tests/core/grandfathered-ids.test.mjs
// pins this list against the live tables in meta/.

/** The 18 one-shot badges from meta/badges.js. */
const BADGE_IDS = [
  'firstblood', 'krakenslayer', 'pacifist', 'conservationist', 'untouchable',
  'beachcomber', 'pearldiver', 'highroller', 'deepdiver', 'abyssal',
  'marathon', 'waterlogged', 'oneanddone', 'emptyhanded', 'firsttreasure',
  'guardiandown', 'comboartist', 'hoardcleared',
];

/** The 16 lifetime counters from meta/stats.js (STAT_KEYS). */
const STAT_IDS = [
  'sharkKills', 'metersDived', 'diveSeconds', 'subLoot', 'netted', 'dives',
  'salvageEarned', 'pearlsBanked', 'bossesFelled', 'careerScore',
  'm3Pearls', 'm3Gems', 'm3Coins', 'm3Explosions', 'chestsOpened', 'guardiansFelled',
];

/** The 16 progressive tracks from meta/progressive.js (TRACKS). */
const TRACK_IDS = [
  'shark', 'depth', 'time', 'subloot', 'net', 'dives', 'salvage', 'pearls',
  'bosses', 'score', 'm3pearls', 'm3gems', 'm3coins', 'm3boom', 'chests', 'guardian',
];

/** A Set that refuses additions, so the freeze is enforced at runtime too. */
function frozenSet(ids) {
  const s = new Set(ids);
  s.add = () => { throw new Error('GRANDFATHERED is frozen: new goal ids must be namespaced'); };
  return s;
}

export const GRANDFATHERED = Object.freeze({
  badges: frozenSet(BADGE_IDS),
  stats: frozenSet(STAT_IDS),
  tracks: frozenSet(TRACK_IDS),
});
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node tests/core/grandfathered-ids.test.mjs`
Expected: PASS — `ok grandfathered-ids.test.mjs (13 checks)`

If it fails with "allow-list is missing X", the live tables have changed since
this plan was written: add the id to the correct array here **only if it
shipped before P11.1**. A genuinely new goal must be namespaced instead.

- [ ] **Step 5: Commit**

```bash
git add src/core/grandfathered-ids.js tests/core/grandfathered-ids.test.mjs
git commit -m "feat(p11): freeze the pre-P11.1 goal ids exempt from namespacing"
```

---

### Task 3: The `legacy` and `match3` manifests

Retrofit the two registered minigames. Note the ids are **`legacy`** and
**`match3`** — `reef` is an internal zone of `legacy`, and the split is P11.5's
job (spec §2).

**Files:**
- Create: `src/minigames/legacy/manifest.js`
- Create: `src/minigames/match3/manifest.js`
- Test: `tests/minigames/manifests.test.mjs`

**Interfaces:**
- Consumes: `validateManifest` (Task 1), `GRANDFATHERED` (Task 2).
- Produces: two default-exported manifest objects, ids `legacy` and `match3`.

- [ ] **Step 1: Write the failing test**

Create `tests/minigames/manifests.test.mjs`:

```js
// Every shipped manifest must satisfy contract v1, and its module thunk must
// actually resolve — a path typo is caught here, at P11.1, rather than at
// P11.3 when the Library first tries to launch from it.
import legacy from '../../src/minigames/legacy/manifest.js';
import match3 from '../../src/minigames/match3/manifest.js';
import { validateManifest } from '../../src/core/manifest.js';
import { GRANDFATHERED } from '../../src/core/grandfathered-ids.js';
import { BADGE_BY_ID } from '../../src/meta/badges.js';
import { TRACKS } from '../../src/meta/progressive.js';
import { STAT_KEYS } from '../../src/meta/stats.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const opts = { grandfathered: GRANDFATHERED };

for (const m of [legacy, match3]) {
  const errs = validateManifest(m, opts);
  check(errs.length === 0, `${m && m.id} manifest is valid contract v1 (${errs.join('; ')})`);
}

check(legacy.id === 'legacy', 'the base game manifest is id "legacy", not "reef"');
check(match3.id === 'match3', 'the match-3 manifest is id "match3"');

// Capabilities are enforced by Core, so they must be accurate.
check(legacy.capabilities.includes('world'), 'legacy declares the world capability');
check(!match3.capabilities.includes('world'),
  'match3 does NOT declare world — it runs its own board');
for (const c of ['economy', 'progression', 'achievements']) {
  check(match3.capabilities.includes(c), `match3 declares ${c}`);
}

// The Guardian Chest is a world entry that discovers match-3 (spec §3.2).
const chest = match3.entries.find((e) => e.id === 'chest');
check(chest && chest.kind === 'world', 'match3 has a world entry for the Guardian Chest');
check(chest.discovers === true, 'playing the chest entry discovers match-3');
check(chest.ctx && chest.ctx.source === 'chest',
  "the chest entry declares ctx { source: 'chest' }, matching reef/index.js");

// legacy is the front door: always available, never discovered, never gated.
const front = legacy.entries.find((e) => e.kind === 'menu');
check(front && front.alwaysAvailable === true, 'the legacy menu entry is alwaysAvailable');

// Goal ownership: no id is claimed by two manifests.
const ids = (m) => [
  ...(m.goals.badges || []).map((b) => b.id),
  ...(m.goals.stats || []).map((s) => s.key),
  ...(m.goals.tracks || []).map((t) => t.id),
];
const overlap = ids(legacy).filter((i) => ids(match3).includes(i));
check(overlap.length === 0, `legacy and match3 claim no id twice (got ${overlap.join(', ')})`);

// ANTI-DRIFT: in P11.1 the runtime source of truth is still meta/, so a
// grandfathered goal described in a manifest must match the live table field
// for field. This is what lets the manifests be copied by hand safely — any
// typo or later edit to meta/ fails here and names the field that drifted.
for (const m of [legacy, match3]) {
  for (const b of m.goals.badges || []) {
    const live = BADGE_BY_ID[b.id];
    if (!GRANDFATHERED.badges.has(b.id)) continue;      // new badges have no live row
    check(!!live, `${b.id}: grandfathered badge exists in meta/badges.js`);
    check(b.name === live.name, `${b.id}: name matches meta/badges.js (${b.name} vs ${live.name})`);
    check(b.glyph === live.glyph, `${b.id}: glyph matches meta/badges.js`);
    check(b.desc === live.desc, `${b.id}: desc matches meta/badges.js`);
  }
  for (const t of m.goals.tracks || []) {
    if (!GRANDFATHERED.tracks.has(t.id)) continue;
    const live = TRACKS.find((x) => x.id === t.id);
    check(!!live, `${t.id}: grandfathered track exists in meta/progressive.js`);
    check(t.stat === live.stat, `${t.id}: stat key matches meta/progressive.js`);
    check(t.tiers.join(',') === live.tiers.join(','),
      `${t.id}: tiers match meta/progressive.js (${t.tiers} vs ${live.tiers})`);
  }
  for (const st of m.goals.stats || []) {
    if (!GRANDFATHERED.stats.has(st.key)) continue;
    check(STAT_KEYS.includes(st.key), `${st.key}: grandfathered stat exists in meta/stats.js`);
  }
}

// COVERAGE: between them, the manifests must describe every live goal. A badge
// or track in meta/ that no manifest claims would vanish from the P11.4 Trophy
// Wall without anyone noticing.
const allBadgeIds = [...(legacy.goals.badges || []), ...(match3.goals.badges || [])].map((b) => b.id);
const allTrackIds = [...(legacy.goals.tracks || []), ...(match3.goals.tracks || [])].map((t) => t.id);
const allStatKeys = [...(legacy.goals.stats || []), ...(match3.goals.stats || [])].map((s) => s.key);
for (const id of GRANDFATHERED.badges) {
  check(allBadgeIds.includes(id), `badge '${id}' is claimed by a manifest`);
}
for (const id of GRANDFATHERED.tracks) {
  check(allTrackIds.includes(id), `track '${id}' is claimed by a manifest`);
}
for (const k of GRANDFATHERED.stats) {
  check(allStatKeys.includes(k), `stat '${k}' is claimed by a manifest`);
}

// The module thunks resolve to real modules exporting their factories.
const legacyMod = await legacy.module();
check(typeof legacyMod.createLegacyMiniGame === 'function',
  'the legacy module thunk resolves to a module exporting createLegacyMiniGame');
const m3Mod = await match3.module();
check(typeof m3Mod.makeMatch3 === 'function',
  'the match3 module thunk resolves to a module exporting makeMatch3');

// Identity must not drift from the runtime modules (About screen consistency).
const m3 = m3Mod.makeMatch3({ host: {} });
check(m3.id === match3.id && m3.name === match3.name && m3.version === match3.version,
  'the match3 manifest identity matches its runtime module');

console.log(`ok manifests.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node tests/minigames/manifests.test.mjs`
Expected: FAIL — `Cannot find module '.../src/minigames/legacy/manifest.js'`

- [ ] **Step 3: Write the `legacy` manifest**

Create `src/minigames/legacy/manifest.js`. Copy the goal descriptions verbatim
from `src/meta/badges.js` and `src/meta/progressive.js` — the predicates stay in
`meta/` (spec §3.4 decision #7); the manifest only *describes*.

```js
// The base game — the reef dive and every zone inside it. PURE DATA: no
// imports, and `module` is the only function (contract v1, spec §1 decision #6).
//
// Ids here are BARE on purpose: they shipped before P11.1 and are pinned by
// src/core/grandfathered-ids.js. New goals must be namespaced 'legacy:<key>'.
//
// The chest/guardian counters live here rather than in match3's manifest
// because the REEF records them (reef/index.js), not the board.
export default {
  id: 'legacy',
  contract: 1,
  name: 'Reef Dive',
  version: '1.0.0',
  icon: '🤿',
  blurb: 'Dive the reef, spear what bites, bank the salvage before your air runs out.',
  capabilities: ['economy', 'progression', 'achievements', 'world'],

  entries: [
    { id: 'dive', kind: 'menu', label: 'Dive', alwaysAvailable: true },
  ],

  controls: {
    pointer: false,
    actions: [
      { id: 'swim',    label: 'Swim',        keys: ['Arrows', 'WASD'], pad: 'Left stick', touch: 'drag' },
      { id: 'spear',   label: 'Spear',       keys: ['Space'],          pad: 'A',          touch: 'tap' },
      { id: 'surface', label: 'Surface',     keys: ['Esc'],            pad: 'Start',      touch: '✕' },
    ],
  },

  help: [
    { title: 'HOW TO PLAY', lines: [
      'Swim down, collect treasure, and surface before your air runs out.',
      'Bank what you carry at the surface — drown and you lose the haul.',
      'Spear creatures to clear a path; some are better left alone.',
    ] },
  ],

  goals: {
    stats: [
      { key: 'sharkKills',      label: 'Sharks culled' },
      { key: 'metersDived',     label: 'Metres dived' },
      { key: 'diveSeconds',     label: 'Time underwater' },
      { key: 'subLoot',         label: 'Trench loot' },
      { key: 'netted',          label: 'Creatures netted' },
      { key: 'dives',           label: 'Dives made' },
      { key: 'salvageEarned',   label: 'Salvage earned' },
      { key: 'pearlsBanked',    label: 'Pearls banked' },
      { key: 'bossesFelled',    label: 'Bosses felled' },
      { key: 'careerScore',     label: 'Career score' },
      { key: 'chestsOpened',    label: 'Chests opened' },
      { key: 'guardiansFelled', label: 'Guardians felled' },
    ],
    // Copied VERBATIM from meta/badges.js — the manifests test asserts every
    // field matches, so the two can never drift.
    badges: [
      { id: 'firstblood',      name: 'First Blood',     glyph: '⚔️', desc: 'Spear your first creature.' },
      { id: 'krakenslayer',    name: 'Kraken Slayer',   glyph: '🦑', desc: 'Fell the Kraken.' },
      { id: 'pacifist',        name: 'Pacifist',        glyph: '🌿', desc: 'Clear a reef without a single kill.' },
      { id: 'conservationist', name: 'Conservationist', glyph: '🕊️', desc: 'Win having killed under 30% of the creatures you met.' },
      { id: 'untouchable',     name: 'Untouchable',     glyph: '🛡️', desc: 'Win a run without losing a life.' },
      { id: 'beachcomber',     name: 'Beachcomber',     glyph: '🧹', desc: "Collect 100% of a reef's treasure." },
      { id: 'pearldiver',      name: 'Pearl Diver',     glyph: '⚫', desc: 'Bank 3 Black Pearls in one run.' },
      { id: 'highroller',      name: 'High Roller',     glyph: '🎰', desc: 'Score 50,000 in a single run.' },
      { id: 'deepdiver',       name: 'Deep Diver',      glyph: '🌊', desc: 'Reach Reef 5.' },
      { id: 'abyssal',         name: 'Abyssal',         glyph: '🕳️', desc: 'Reach Reef 8.' },
      { id: 'marathon',        name: 'Marathon Diver',  glyph: '🏊', desc: 'Descend past 3000m in one run.' },
      { id: 'waterlogged',     name: 'Waterlogged',     glyph: '💀', desc: 'Run out of air.' },
      { id: 'oneanddone',      name: 'One and Done',    glyph: '🪦', desc: 'Die on Reef 1.' },
      { id: 'emptyhanded',     name: 'Empty-Handed',    glyph: '🫙', desc: 'End a run with a score of nothing.' },
      { id: 'firsttreasure',   name: 'First Treasure',  glyph: '🧰', desc: 'Open a guarded reef chest.' },
      { id: 'guardiandown',    name: 'Guardian Down',   glyph: '🐉', desc: 'Fell a chest guardian.' },
    ],
    tracks: [
      { id: 'shark',    stat: 'sharkKills',      tiers: [5, 50, 300] },
      { id: 'depth',    stat: 'metersDived',     tiers: [2000, 25000, 150000] },
      { id: 'time',     stat: 'diveSeconds',     tiers: [900, 7200, 43200] },
      { id: 'subloot',  stat: 'subLoot',         tiers: [500, 10000, 60000] },
      { id: 'net',      stat: 'netted',          tiers: [10, 150, 750] },
      { id: 'dives',    stat: 'dives',           tiers: [5, 50, 300] },
      { id: 'salvage',  stat: 'salvageEarned',   tiers: [500, 5000, 30000] },
      { id: 'pearls',   stat: 'pearlsBanked',    tiers: [3, 25, 100] },
      { id: 'bosses',   stat: 'bossesFelled',    tiers: [1, 10, 40] },
      { id: 'score',    stat: 'careerScore',     tiers: [50000, 500000, 5000000] },
      { id: 'chests',   stat: 'chestsOpened',    tiers: [1, 10, 50] },
      { id: 'guardian', stat: 'guardiansFelled', tiers: [1, 10, 50] },
    ],
  },

  module: () => import('./index.js'),
};
```

The badge and track values above were read from `src/meta/` at plan time. You do
not need to re-check them by hand: the Step 1 test asserts every grandfathered
goal's `name`/`glyph`/`desc`/`tiers` against the live tables, so any mismatch
fails loudly and tells you which field drifted.

- [ ] **Step 4: Write the `match3` manifest**

Create `src/minigames/match3/manifest.js`:

```js
// Salvage Match (Treasure Chest Madness). PURE DATA: no imports, and `module`
// is the only function (contract v1, spec §1 decision #6).
//
// The bare ids below shipped before P11.1 and are pinned by
// src/core/grandfathered-ids.js. New goals must be namespaced 'match3:<key>'.
export default {
  id: 'match3',
  contract: 1,
  name: 'Treasure Chest Madness',
  version: '1.1.0',
  icon: '💰',
  blurb: 'Swap tiles, pop chests, bank salvage.',
  capabilities: ['economy', 'progression', 'achievements'],

  entries: [
    // Found in the world first: the reef's Guardian Chest opens straight into
    // the board (reef/index.js calls host.open('match3', { source: 'chest' })).
    { id: 'chest', kind: 'world', label: 'Guardian Hoard',
      ctx: { source: 'chest' }, discovers: true },
    // Menu access is earned or bought — the ladder is wired up in P11.3; the
    // requirement is declared here now so the Library can render it.
    { id: 'arcade', kind: 'menu', label: 'Play Treasure Chest Madness',
      requires: { discovered: true }, cost: { salvage: 250 } },
  ],

  controls: {
    pointer: true,
    actions: [
      { id: 'cursor',  label: 'Move cursor', keys: ['Arrows'],          pad: 'D-pad', touch: 'drag' },
      { id: 'swap',    label: 'Swap tiles',  keys: ['Space', 'Enter'],  pad: 'A',     touch: 'tap two tiles' },
      { id: 'quit',    label: 'Bank & quit', keys: ['Esc'],             pad: 'Start', touch: '✕' },
    ],
  },

  help: [
    { title: 'HOW TO PLAY', lines: [
      'Swap two adjacent tiles to line up three or more.',
      'Clear the level objective before you run out of moves.',
      'Every level you clear banks salvage into your one shared wallet.',
    ] },
  ],

  goals: {
    stats: [
      { key: 'm3Pearls',     label: 'Pearls matched' },
      { key: 'm3Gems',       label: 'Gems matched' },
      { key: 'm3Coins',      label: 'Coins matched' },
      { key: 'm3Explosions', label: 'Chests detonated' },
    ],
    // Copied VERBATIM from meta/badges.js / meta/progressive.js — the manifests
    // test asserts every field matches, so the two can never drift.
    badges: [
      { id: 'comboartist',  name: 'Combo Artist',  glyph: '🎇', desc: 'Detonate a special-on-special combo.' },
      { id: 'hoardcleared', name: 'Hoard Cleared', glyph: '🏆', desc: 'Clear every level of a chest run.' },
    ],
    tracks: [
      { id: 'm3pearls', stat: 'm3Pearls',     tiers: [100, 500, 2000] },
      { id: 'm3gems',   stat: 'm3Gems',       tiers: [100, 500, 2000] },
      { id: 'm3coins',  stat: 'm3Coins',      tiers: [100, 500, 2000] },
      { id: 'm3boom',   stat: 'm3Explosions', tiers: [25, 150, 600] },
    ],
  },

  module: () => import('./index.js'),
};
```

As with the legacy manifest, the Step 1 test pins these values against
`src/meta/` — no manual reconciliation needed.

- [ ] **Step 5: Run the test and watch it pass**

Run: `node tests/minigames/manifests.test.mjs`
Expected: PASS — `ok manifests.test.mjs (~130 checks)`

A `must be namespaced` failure means an id is in a manifest but missing from
`grandfathered-ids.js`; a `no id twice` failure means the same counter is
claimed by both manifests — chest/guardian counters belong to `legacy`.

- [ ] **Step 6: Typecheck and run the full suite**

```bash
npm run typecheck
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
```
Expected: typecheck exits 0; every test line prints `ok …` and no `FAIL` lines.

- [ ] **Step 7: Commit**

```bash
git add src/minigames/legacy/manifest.js src/minigames/match3/manifest.js tests/minigames/manifests.test.mjs
git commit -m "feat(p11): declare legacy + match3 manifests (contract v1)"
```

---

### Task 4: `catalogue.js` — the shell's view of every minigame

**Files:**
- Create: `src/minigames/catalogue.js`
- Test: `tests/minigames/catalogue.test.mjs`

**Interfaces:**
- Consumes: the two manifests (Task 3), `validateManifest` + `GRANDFATHERED`.
- Produces:
  - `CATALOGUE` → `readonly manifest[]`, in display order (`legacy` first).
  - `manifestById(id)` → manifest or `undefined`.
  - `validateCatalogue()` → `string[]` of problems across the whole catalogue,
    including cross-manifest duplicate-id detection; empty means valid.

- [ ] **Step 1: Write the failing test**

Create `tests/minigames/catalogue.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node tests/minigames/catalogue.test.mjs`
Expected: FAIL — `Cannot find module '.../src/minigames/catalogue.js'`

- [ ] **Step 3: Write the implementation**

Create `src/minigames/catalogue.js`:

```js
// @ts-check
// The catalogue — every minigame's manifest, statically imported. Manifests are
// tiny pure data, so the shell can build menus, help screens, the Trophy Wall
// and unlock gating at boot WITHOUT loading a single engine. Engines stay behind
// each manifest's `module` thunk (contract v1, spec §1 decision #6).
//
// IMPORTANT: import manifests here, never an engine `index.js` — one such import
// would eagerly pull in a whole game and defeat the lazy design.

import legacy from './legacy/manifest.js';
import match3 from './match3/manifest.js';
import { validateManifest } from '../core/manifest.js';
import { GRANDFATHERED } from '../core/grandfathered-ids.js';

/** Every registered minigame, in display order — the base game first. */
export const CATALOGUE = Object.freeze([legacy, match3]);

/** @param {string} id @returns {*} the manifest, or undefined. */
export function manifestById(id) {
  return CATALOGUE.find((m) => m.id === id);
}

/**
 * Validate the whole catalogue: every manifest against contract v1, plus the
 * cross-manifest rules no single manifest can check (unique minigame ids, and
 * no goal id claimed twice).
 * @returns {string[]} problems; empty means valid.
 */
export function validateCatalogue() {
  /** @type {string[]} */
  const errs = [];
  const seenGame = new Set();
  /** @type {Map<string, string>} goal id -> owning minigame id */
  const seenGoal = new Map();

  for (const m of CATALOGUE) {
    for (const e of validateManifest(m, { grandfathered: GRANDFATHERED })) {
      errs.push(`[${m && m.id}] ${e}`);
    }
    if (seenGame.has(m.id)) errs.push(`duplicate minigame id '${m.id}'`);
    seenGame.add(m.id);

    const goals = m.goals || {};
    const owned = [
      ...(goals.badges || []).map((b) => b.id),
      ...(goals.stats || []).map((s) => s.key),
      ...(goals.tracks || []).map((t) => t.id),
    ];
    for (const id of owned) {
      const prior = seenGoal.get(id);
      if (prior) errs.push(`goal id '${id}' is claimed by both '${prior}' and '${m.id}'`);
      else seenGoal.set(id, m.id);
    }
  }
  return errs;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node tests/minigames/catalogue.test.mjs`
Expected: PASS — `ok catalogue.test.mjs (9 checks)`

- [ ] **Step 5: Commit**

```bash
git add src/minigames/catalogue.js tests/minigames/catalogue.test.mjs
git commit -m "feat(p11): statically-imported minigame catalogue"
```

---

### Task 5: Core validation + the capability-built Host

Wire the manifest into `Core.register` and make `capabilities` **enforced**
rather than documentation (spec §3.1). A minigame that did not declare `world`
does not receive `host.world`.

**Files:**
- Modify: `src/core/host.js` (add `restrictHost`)
- Modify: `src/core/core.js` (`register` takes a manifest; `_hostFor`)
- Modify: `src/main.js:55,61` (pass manifests at registration)
- Test: `tests/core/capabilities.test.mjs`

**Interfaces:**
- Consumes: `assertManifest` (Task 1), `GRANDFATHERED` (Task 2), the manifests (Task 3).
- Produces:
  - `restrictHost(host, capabilities)` → a new Host facade exposing the ungated
    services (`audio`, `input`, `particles`, `viewport`, `rng`, `open`, `close`,
    `_bindCore`) plus only the declared gated ones.
  - `Core.register(minigame, manifest?)` → `this` (unchanged return). When a
    manifest is given it is asserted and stored.
  - `Core.manifestFor(id)` → manifest or `undefined`.

**Back-compat requirement:** `register(minigame)` with no manifest must keep
working exactly as today — around thirty existing tests register bare stub
objects, and an unmanifested minigame receives the full unrestricted Host.

- [ ] **Step 1: Write the failing test**

Create `tests/core/capabilities.test.mjs`:

```js
// `capabilities` is enforced, not documentation: Core builds each minigame's
// Host from its manifest, so an undeclared service is simply absent.
import { Core } from '../../src/core/core.js';
import { makeHost, restrictHost } from '../../src/core/host.js';
import legacyManifest from '../../src/minigames/legacy/manifest.js';
import match3Manifest from '../../src/minigames/match3/manifest.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const services = {
  audio: {}, input: {}, particles: {}, viewport: { W: 100, H: 100 }, rng: () => 0.5,
  economy: { earn() {} }, progression: { recordRun() {} }, achievements: { unlock() {} },
  world: { diver: 'yes' },
};

// --- restrictHost ---
const full = makeHost(services);
const narrow = restrictHost(full, ['economy']);
check(narrow.economy === full.economy, 'a declared capability is passed through by reference');
check(narrow.world === undefined, 'an undeclared capability is absent');
check(narrow.progression === undefined, 'progression is gated too');
for (const k of ['audio', 'input', 'particles', 'viewport', 'rng']) {
  check(narrow[k] === full[k], `${k} is ungated shell infrastructure, always present`);
}
check(typeof narrow.open === 'function' && typeof narrow.close === 'function',
  'open/close survive restriction');

// --- Core hands each minigame its own restricted host ---
const seen = {};
const stub = (id) => ({ id, enter(host) { seen[id] = host; }, update() {}, render() {} });

const core = new Core({ host: full });
core.register(stub('legacy'), legacyManifest);
core.register(stub('match3'), match3Manifest);

core.boot('legacy');
check(seen.legacy.world === services.world, 'legacy declared world, so it gets world');

core.open('match3');
core.update(0.016);                       // open is applied at the frame boundary
check(seen.match3 !== undefined, 'match3 entered');
check(seen.match3.world === undefined, 'match3 did not declare world, so world is absent');
check(seen.match3.economy === services.economy, 'match3 declared economy, so it gets economy');

// --- manifest storage + validation ---
check(core.manifestFor('match3') === match3Manifest, 'Core stores the registered manifest');
check(core.manifestFor('nope') === undefined, 'manifestFor is undefined for an unknown id');

let threw = false;
try {
  core.register(stub('bad'), { id: 'bad', contract: 99, name: 'Bad', version: '1.0.0',
    capabilities: [], entries: [{ id: 'e', kind: 'menu', label: 'E' }],
    goals: {}, module: () => Promise.resolve({}) });
} catch (e) { threw = /contract/.test(e.message); }
check(threw, 'registering a manifest with the wrong contract version throws loudly');

let mismatch = false;
try { core.register(stub('legacy'), match3Manifest); } catch (e) { mismatch = /id/.test(e.message); }
check(mismatch, "registering a manifest whose id differs from the minigame's throws");

// --- back-compat: an unmanifested minigame still works and gets the full host ---
const bare = stub('bare');
core.register(bare);
check(core.manifestFor('bare') === undefined, 'an unmanifested minigame has no manifest');
core.open('bare');
core.update(0.016);
check(seen.bare === full, 'an unmanifested minigame receives the unrestricted host');

console.log(`ok capabilities.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node tests/core/capabilities.test.mjs`
Expected: FAIL — `restrictHost is not a function`

- [ ] **Step 3: Add `restrictHost` to `src/core/host.js`**

Append to the file (keep `makeHost` exactly as it is):

```js
/**
 * Build a narrowed view of a Host exposing only the capabilities a minigame
 * declared. The ungated services below are the shell itself — every minigame
 * gets them. Everything in GATED_CAPABILITIES is opt-in, so an undeclared
 * service is simply absent rather than quietly available (spec §3.1).
 *
 * Services are copied by REFERENCE, never wrapped: a minigame holding
 * `host.economy` still holds the Core's real economy.
 *
 * @param {*} host          The full Host from makeHost.
 * @param {string[]} [capabilities]  Declared capability names.
 * @returns {import('./contract.js').Host}
 */
export function restrictHost(host, capabilities = []) {
  const UNGATED = ['audio', 'input', 'particles', 'viewport', 'rng', 'open', 'close', '_bindCore'];
  const out = /** @type {*} */ ({});
  for (const k of UNGATED) if (host[k] !== undefined) out[k] = host[k];
  for (const c of capabilities) if (host[c] !== undefined) out[c] = host[c];
  return out;
}
```

- [ ] **Step 4: Wire it into `src/core/core.js`**

Add the import at the top of the file, under the existing header comment:

```js
import { assertManifest } from './manifest.js';
import { GRANDFATHERED } from './grandfathered-ids.js';
import { restrictHost } from './host.js';
```

In the constructor, alongside `this.registry`, add:

```js
    /** @type {Map<string, *>} id -> manifest, for minigames that declared one */
    this.manifests = new Map();
    /** @type {Map<string, *>} id -> the capability-restricted host it receives */
    this._hosts = new Map();
```

Replace `register` with:

```js
  /**
   * Add a MiniGame to the roster (keyed by its `id`). An optional contract-v1
   * manifest is validated here and refused loudly on mismatch, so a broken
   * manifest fails at boot rather than at some later frame. Registering without
   * a manifest stays supported (and yields the unrestricted Host).
   * @param {import('./contract.js').MiniGame} minigame
   * @param {*} [manifest]
   */
  register(minigame, manifest) {
    if (manifest) {
      assertManifest(manifest, { grandfathered: GRANDFATHERED });
      if (manifest.id !== minigame.id) {
        throw new Error(
          `Core.register: manifest id '${manifest.id}' does not match minigame id '${minigame.id}'`);
      }
      this.manifests.set(minigame.id, manifest);
      this._hosts.set(minigame.id, restrictHost(this.host, manifest.capabilities));
    }
    this.registry.set(minigame.id, minigame);
    return this;
  }

  /** The registered manifest for `id`, or undefined if it registered without one. */
  manifestFor(id) { return this.manifests.get(id); }

  /** The Host a minigame receives: capability-restricted when it declared a
   *  manifest, the full Host otherwise. */
  _hostFor(id) {
    const h = this._hosts.get(id);
    return h === undefined ? this.host : h;
  }
```

Then route both `enter()` call sites through it. In `boot`:

```js
    mg.enter(this._hostFor(mg.id));
```

and in `_applyPending`'s open branch:

```js
      mg.enter(this._hostFor(mg.id), p.ctx);
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `node tests/core/capabilities.test.mjs`
Expected: PASS — `ok capabilities.test.mjs (19 checks)`

- [ ] **Step 6: Pass the manifests at boot in `src/main.js`**

Add to the imports:

```js
import legacyManifest from './minigames/legacy/manifest.js';
import match3Manifest from './minigames/match3/manifest.js';
```

Change the two registration lines (currently `src/main.js:55` and `:61`):

```js
core.register(legacy, legacyManifest);
...
core.register(match3, match3Manifest);
```

- [ ] **Step 7: Run the full suite and typecheck**

```bash
npm run typecheck
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
```
Expected: typecheck exits 0; no `FAIL` lines.

If `tests/game/match3-input.test.mjs` or a reef test fails, a minigame is
reaching for a service it did not declare — add the capability to that
manifest rather than loosening `restrictHost`.

- [ ] **Step 8: Play-test the real game**

Serve the project and open it in a browser (the repo has no build step, so any
static server works — e.g. `python3 -m http.server 8000`). Confirm:
1. The title screen appears and a dive starts normally.
2. Salvage still banks at the surface and the Trophy Wall still lists earned
   badges — proof the restricted Host kept `economy`/`progression` wired.
3. Open a Guardian Chest (or launch match-3 from the menu) and clear a level;
   confirm the payout lands in the same wallet.

This step is not optional: capability restriction is the one change in P11.1
that can break live gameplay, and no unit test exercises the browser path.

- [ ] **Step 9: Commit**

```bash
git add src/core/core.js src/core/host.js src/main.js tests/core/capabilities.test.mjs
git commit -m "feat(p11): validate manifests at registration, build each Host from declared capabilities"
```

---

### Task 6: Source the About screen from the catalogue

The first consumer of the declarative layer — proof the manifests are load-bearing
rather than dead data.

**Files:**
- Modify: `src/core/core.js` (`versions()` prefers the manifest)
- Modify: `src/main.js` (About data from the catalogue)
- Test: `tests/core/versions.test.mjs` (extend the existing file)

**Interfaces:**
- Consumes: `Core.manifestFor` (Task 5), `CATALOGUE` (Task 4).
- Produces: `Core.versions()` → `Array<{id, name, version, icon, blurb}>`. The
  three existing fields keep their current meaning and fallbacks; `icon` and
  `blurb` are `undefined` for a minigame registered without a manifest.

- [ ] **Step 1: Add the failing checks to `tests/core/versions.test.mjs`**

First add these two imports **at the top of the file**, beside the existing ones
(ES module imports must be at module scope):

```js
import match3Manifest from '../../src/minigames/match3/manifest.js';
import { CATALOGUE } from '../../src/minigames/catalogue.js';
```

Then append these checks before the final `console.log`:

```js
// P11.1: when a minigame registered a manifest, versions() reports the
// manifest's identity — one source of truth for the About screen.
const core2 = new Core({ host: {} });
core2.register({ id: 'match3', enter() {}, update() {}, render() {} }, match3Manifest);
const [entry] = core2.versions();
check(entry.name === 'Treasure Chest Madness', 'versions() takes the name from the manifest');
check(entry.version === match3Manifest.version, 'versions() takes the version from the manifest');
check(entry.icon === '💰', 'versions() surfaces the manifest icon');
check(entry.blurb === match3Manifest.blurb, 'versions() surfaces the manifest blurb');

// A minigame with no manifest keeps the old fallback behaviour.
core2.register({ id: 'bare2', enter() {}, update() {}, render() {} });
const bare2 = core2.versions().find((x) => x.id === 'bare2');
check(bare2.name === 'bare2' && bare2.version === '—', 'unmanifested minigames keep id / — fallbacks');
check(bare2.icon === undefined, 'unmanifested minigames have no icon');

// Every catalogue manifest carries what the About screen needs.
for (const m of CATALOGUE) {
  check(typeof m.name === 'string' && typeof m.version === 'string' && typeof m.icon === 'string',
    `${m.id} manifest has About-screen identity`);
}
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node tests/core/versions.test.mjs`
Expected: FAIL — `versions() surfaces the manifest icon` (icon is `undefined`)

- [ ] **Step 3: Update `versions()` in `src/core/core.js`**

Replace the method with:

```js
  /** Registered minigames' identity for the About screen. The manifest is the
   *  source of truth when one was registered; otherwise fall back to the
   *  runtime module's fields, then to the id / '—'. */
  versions() {
    return [...this.registry.values()].map((m) => {
      const man = this.manifests.get(m.id);
      return {
        id: m.id,
        name: (man && man.name) || m.name || m.id,
        version: (man && man.version) || m.version || '—',
        icon: man && man.icon,
        blurb: man && man.blurb,
      };
    });
  }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node tests/core/versions.test.mjs`
Expected: PASS

- [ ] **Step 5: Render the icon on the About screen**

`src/main.js` already sets `game.aboutInfo = { engine, app, build, games: core.versions() }`
— it needs no change, since `versions()` now carries the extra fields.

In `src/game.js`, find the About screen's per-game line (near `src/game.js:644`,
inside the method that reads `this.aboutInfo`) and prefix each entry with its
icon when present, leaving the rest of the line untouched:

```js
      const label = (g.icon ? `${g.icon} ` : '') + `${g.name} ${g.version}`;
```

Use `label` wherever that loop currently composes `${g.name} ${g.version}`.

- [ ] **Step 6: Verify in the browser**

Serve the project, open the About screen from the corner link, and confirm both
minigames are listed with their icons (🤿 Reef Dive, 💰 Treasure Chest Madness)
and correct versions.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
npm run typecheck
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
```
Expected: typecheck exits 0; no `FAIL` lines.

- [ ] **Step 8: Commit**

```bash
git add src/core/core.js src/game.js tests/core/versions.test.mjs
git commit -m "feat(p11): source the About screen from minigame manifests"
```

---

### Task 7: Document the contract and close the phase

**Files:**
- Modify: `docs/platform/architecture.md`
- Modify: `src/core/contract.js` (typedef for the manifest)
- Modify: `src/version.js` (BUILD stamp)

- [ ] **Step 1: Add the `MiniGameManifest` typedef to `src/core/contract.js`**

Append before the final `export {};`:

```js
/**
 * The declarative half of the contract — a minigame's `manifest.js`. PURE DATA:
 * no imports, and `module` is the only function, so it stays serialisable (see
 * core/manifest.js for the validation rules).
 *
 * @typedef {Object} MiniGameManifest
 * @property {string} id            Matches the runtime MiniGame's id.
 * @property {number} contract      ABI version; must equal CONTRACT_VERSION.
 * @property {string} name          Player-facing display name.
 * @property {string} version       Semver.
 * @property {string} icon          Single-glyph tile icon.
 * @property {string} blurb         One-line description for tiles and briefings.
 * @property {string[]} capabilities Gated Host services this minigame opts into.
 * @property {MiniGameEntry[]} entries  Ways in (world events and menu tiles).
 * @property {{pointer?: boolean, actions: Array<Object>}} controls Control legend source.
 * @property {Array<{title: string, lines: string[]}>} help  How-to-play pages.
 * @property {{stats?: Array<Object>, badges?: Array<Object>, tracks?: Array<Object>}} goals
 *           Declared goals — DESCRIPTIONS only; predicates live in the runtime
 *           module (spec §3.4).
 * @property {() => Promise<*>} module  Lazy loader for the runtime module.
 */

/**
 * @typedef {Object} MiniGameEntry
 * @property {string} id            Unique within the manifest.
 * @property {'world'|'menu'} kind  In-world trigger, or a Library tile.
 * @property {string} label         Player-facing label.
 * @property {*} [ctx]              Context forwarded to enter(host, ctx).
 * @property {boolean} [discovers]  First play flips the discovery ledger.
 * @property {boolean} [alwaysAvailable] Never gated (the base game's front door).
 * @property {*} [requires]         Unlock requirements (evaluated in P11.3).
 * @property {*} [cost]             Salvage price for menu access (P11.3).
 */
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Document the phase in `docs/platform/architecture.md`**

Add a section describing: the manifest as the declarative half of the contract;
`catalogue.js` as the shell's boot-time view with no engines loaded; the
`GRANDFATHERED` allow-list and why bare ids exist; capability enforcement via
`restrictHost`; and the note that the `module` thunk is declared and
resolution-tested in P11.1 but does not become the launch path until P11.3.

- [ ] **Step 4: Stamp the build**

In `src/version.js`, set `BUILD = 'p11-1-manifests'`.

- [ ] **Step 5: Final full verification**

```bash
npm run typecheck
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
```
Expected: typecheck exits 0; every test prints `ok …`; zero `FAIL` lines.

Paste the actual output into the commit discussion — do not claim success
without it.

- [ ] **Step 6: Commit**

```bash
git add src/core/contract.js src/version.js docs/platform/architecture.md
git commit -m "chore(release): BUILD=p11-1-manifests — contract v1 + manifests + catalogue"
```

---

## Out of scope for P11.1

Named here so no task quietly grows into the next phase:

- **Lazy launching from the `module` thunk** — P11.3. Registration stays eager;
  `main.js` still constructs both minigames with their dependencies.
- **`makeLibrary`, the discovery ledger, the Library screen, Salvage purchase** — P11.3.
- **`progression.registerGoals`, namespaced stat plumbing, per-game Trophy Wall
  sections, the Steam id dump script** — P11.4. P11.1 only *declares* goals; the
  live tables in `meta/` remain the runtime source.
- **Shell chrome: pause/quit, generic pointer routing, the control legend,
  briefing and summary screens** — P11.2. `controls` and `help` are declared
  here and first rendered there. The ~60 lines of hardcoded match-3 pointer
  plumbing in `main.js` stay put until then.
- **The `home` minigame and the `legacy` → reef split** — P11.5.
