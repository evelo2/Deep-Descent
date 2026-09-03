// Crush telemetry: three lifetime diagnostics that say whether the crush
// mechanic is working. All three are ADDITIVE, because addRun() folds a run's
// delta by summation only — a "deepest metres, lifetime max" counter cannot
// work in this store. No progressive track binds them, so they mint no Steam
// achievement ids. Run: node tests/meta/crush-stats.test.mjs

import { STAT_KEYS, defaultStats, addRun } from '../../src/meta/stats.js';
import { TRACKS } from '../../src/meta/progressive.js';
import legacy from '../../src/minigames/legacy/manifest.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const KEYS = ['legacy:crushAlarmed', 'legacy:crushDeaths', 'legacy:crushEscapes'];

for (const k of KEYS) {
  check(STAT_KEYS.includes(k), `${k} is a tracked stat key`);
  check(k.startsWith('legacy:'), `${k} is namespaced (P11.1 contract)`);
  check(defaultStats()[k] === 0, `${k} defaults to 0 so old saves backfill`);
  check(legacy.goals.stats.some((s) => s.key === k), `${k} is declared in the legacy manifest`);
  check(!TRACKS.some((tr) => tr.stat === k), `${k} binds no progressive track — it mints no achievement id`);
}

const s = defaultStats();
addRun(s, { 'legacy:crushAlarmed': 1, 'legacy:crushEscapes': 2, 'legacy:crushDeaths': 0 });
addRun(s, { 'legacy:crushAlarmed': 1, 'legacy:crushEscapes': 1, 'legacy:crushDeaths': 1 });
check(s['legacy:crushAlarmed'] === 2, 'alarmed accumulates across runs');
check(s['legacy:crushEscapes'] === 3, 'escapes accumulate across runs');
check(s['legacy:crushDeaths'] === 1, 'deaths accumulate across runs');

console.log(`crush-stats: ${pass} passed`);
