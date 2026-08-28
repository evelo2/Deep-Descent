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
