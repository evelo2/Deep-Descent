// The 4 guardian-chest badges + partial-summary safety: a summary missing a
// field must not award a badge that reads it.
import { BADGE_BY_ID, newlyEarned } from '../../src/meta/badges.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
const earns = (id, stats) => newlyEarned(stats, new Set()).includes(id);

for (const id of ['firsttreasure', 'guardiandown', 'comboartist', 'hoardcleared']) {
  check(!!BADGE_BY_ID[id], `badge ${id} exists`);
}
check(earns('firsttreasure', { chestsOpened: 1 }), 'firsttreasure on first chest');
check(!earns('firsttreasure', { chestsOpened: 0 }), 'firsttreasure needs a chest');
check(earns('guardiandown', { guardiansFelled: 1 }), 'guardiandown on first kill');
check(earns('comboartist', { m3Combo: 1 }), 'comboartist on first combo');
check(earns('hoardcleared', { hoardCleared: true }), 'hoardcleared when flagged');
// Partial-summary safety: a reef summary (no m3Combo/hoardCleared) trips neither.
check(!earns('comboartist', { chestsOpened: 1, guardiansFelled: 1 }), 'reef summary does not trip comboartist');
check(!earns('hoardcleared', { chestsOpened: 1 }), 'reef summary does not trip hoardcleared');
console.log(`ok new-badges.test.mjs (${pass} checks)`);
