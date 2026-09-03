// The Depth Valve purchase counters: is anyone actually buying one? The
// 2026-09-01 rebalance (VALVE.holdDepthM 240 -> 150) was argued from the air
// curve alone, because nothing tracked purchases — "nobody buys it" was
// anecdote. These two counters close that gap. `legacy:valveOffered` is the
// denominator (runs where the shop actually presented it, i.e. you reached its
// gate reef and did not already own one) and `legacy:valveBought` the
// numerator, so bought/offered is the attach rate. Comparing against `dives`
// would not answer the question: most runs end before the gate reef and were
// never offered one at all. Both are 0-or-1 per run — valveLevel resets each run.
//
// These are also the FIRST namespaced stat keys. Every counter that shipped
// before P11.1 is bare and grandfathered; everything new must be
// '<minigameId>:<key>' (see src/core/grandfathered-ids.js, which refuses
// additions). Run: node tests/meta/valve-stats.test.mjs
import { STAT_KEYS, defaultStats, addRun, saveStats, loadStats } from '../../src/meta/stats.js';
import legacy from '../../src/minigames/legacy/manifest.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const BOUGHT = 'legacy:valveBought', OFFERED = 'legacy:valveOffered';

for (const k of [BOUGHT, OFFERED]) {
  check(STAT_KEYS.includes(k), `STAT_KEYS includes ${k}`);
  check(k.startsWith('legacy:'), `${k} is namespaced to the minigame that owns it`);
  check(defaultStats()[k] === 0, `${k} defaults to 0`);
}

// Accumulation: offered-and-bought, offered-and-declined, then a short run that
// never reached the gate reef and so contributes to neither.
const s = defaultStats();
addRun(s, { [OFFERED]: 1, [BOUGHT]: 1, dives: 1 });
addRun(s, { [OFFERED]: 1, [BOUGHT]: 0, dives: 1 });
addRun(s, { dives: 1 });
check(s[OFFERED] === 2, 'valveOffered accumulates across runs');
check(s[BOUGHT] === 1, 'valveBought accumulates across runs');
check(s.dives === 3, 'runs that never saw the shop still count as dives');
check(s[BOUGHT] <= s[OFFERED], 'you can never buy more valves than you were offered');

// The ':' has to survive the storage round-trip — these are JSON object keys in
// deepdescent.stats.v1, which is a frozen persistence key.
let cell = null;
const store = { getItem: () => cell, setItem: (_k, v) => { cell = v; } };
saveStats(s, store);
const back = loadStats(store);
check(back[OFFERED] === 2 && back[BOUGHT] === 1, 'namespaced counters round-trip through storage');

// The manifest is the contract layer's registry of live goals; an undeclared
// counter exists on disk but is invisible to it.
const declared = (legacy.goals.stats || []).map((st) => st.key);
check(declared.includes(BOUGHT), 'the legacy manifest declares valveBought');
check(declared.includes(OFFERED), 'the legacy manifest declares valveOffered');

console.log(`ok valve-stats.test.mjs (${pass} checks)`);
