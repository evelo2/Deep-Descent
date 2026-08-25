// New lifetime counters for the guardian-chest feature round-trip through addRun.
import { STAT_KEYS, defaultStats, addRun } from '../../src/meta/stats.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

for (const k of ['m3Pearls', 'm3Gems', 'm3Coins', 'm3Explosions', 'chestsOpened', 'guardiansFelled']) {
  check(STAT_KEYS.includes(k), `STAT_KEYS includes ${k}`);
}
const s = defaultStats();
addRun(s, { m3Pearls: 4, m3Gems: 2, m3Coins: 7, m3Explosions: 3, chestsOpened: 1, guardiansFelled: 1 });
addRun(s, { m3Pearls: 6, chestsOpened: 1 });
check(s.m3Pearls === 10, 'm3Pearls accumulates across runs');
check(s.chestsOpened === 2, 'chestsOpened accumulates');
check(s.guardiansFelled === 1, 'guardiansFelled accumulates');
console.log(`ok stats-new-keys.test.mjs (${pass} checks)`);
