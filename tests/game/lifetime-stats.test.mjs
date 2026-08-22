// Lifetime stat store: accumulates run deltas, round-trips through an injected
// store, and refuses to go backwards or trust garbage.
// Run: node tests/game/lifetime-stats.test.mjs

import { defaultStats, loadStats, saveStats, addRun, STAT_KEYS } from '../../src/meta/stats.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const fakeStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

// --- Defaults ---
const d = defaultStats();
check('defaults have all stat keys at 0', STAT_KEYS.every((k) => d[k] === 0));

// --- addRun accumulates only known, positive deltas ---
addRun(d, { sharkKills: 3, netted: 2, dives: 1, bogus: 99 });
check('addRun adds known keys', d.sharkKills === 3 && d.netted === 2 && d.dives === 1);
check('addRun ignores unknown keys', !('bogus' in d));
addRun(d, { sharkKills: 4 });
check('addRun accumulates across calls', d.sharkKills === 7);
addRun(d, { sharkKills: -100, netted: 0 });
check('addRun ignores negative/zero deltas', d.sharkKills === 7 && d.netted === 2);

// --- Persistence round-trip ---
const store = fakeStore();
saveStats(d, store);
const back = loadStats(store);
check('saved stats reload identically', STAT_KEYS.every((k) => back[k] === d[k]));

// --- Corrupt / missing store data → defaults ---
const bad = fakeStore(); bad.setItem('deepdescent.stats.v1', '{not json');
check('corrupt json → defaults', loadStats(bad).sharkKills === 0);
check('missing key → defaults', loadStats(fakeStore()).dives === 0);

// --- Garbage fields are coerced to 0, not NaN ---
const g = fakeStore(); g.setItem('deepdescent.stats.v1', JSON.stringify({ sharkKills: 'lots', metersDived: 500 }));
const gl = loadStats(g);
check('non-numeric field → 0', gl.sharkKills === 0);
check('valid field survives sanitize', gl.metersDived === 500);

// --- No store (SSR/Node) → defaults, no throw ---
check('null store load → defaults', loadStats(null).dives === 0);
let threw = false; try { saveStats(d, null); } catch { threw = true; }
check('null store save never throws', threw === false);

console.log(`lifetime-stats: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
