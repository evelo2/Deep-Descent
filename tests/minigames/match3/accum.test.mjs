// Pure match-3 stat accumulation: fold board results into lifetime deltas + a
// run summary, isolated from the module closure so it's unit-testable.
import { newMatchAccum, foldMatchStats, matchRunResult } from '../../../src/minigames/match3/accum.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const acc = newMatchAccum();
check(acc.m3Pearls === 0 && acc.m3Combo === 0, 'fresh accumulator is zeroed');

foldMatchStats(acc, { cleared: { 0: 3, 1: 2, 2: 5 }, blasts: 1 });
foldMatchStats(acc, { cleared: { 0: 2 }, blasts: 2 }, true);   // this swap was a combo
check(acc.m3Pearls === 5, 'pearls from cleared[0]');
check(acc.m3Gems === 2, 'gems from cleared[1]');
check(acc.m3Coins === 5, 'coins from cleared[2]');
check(acc.m3Explosions === 3, 'explosions from blasts');
check(acc.m3Combo === 1, 'combo counted once');

const r = matchRunResult(acc, { hoardCleared: true });
check(r.runDelta.m3Pearls === 5 && r.runDelta.m3Explosions === 3, 'runDelta carries lifetime counters');
check(r.runStats.m3Combo === 1 && r.runStats.hoardCleared === true, 'runStats carries combo + hoard flags');

// Robust to a missing cleared/blasts (a no-op swap).
foldMatchStats(acc, {});
check(acc.m3Pearls === 5, 'missing fields are treated as zero');
console.log(`ok accum.test.mjs (${pass} checks)`);
