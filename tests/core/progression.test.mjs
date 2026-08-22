// Progression service — badges + lifetime stats + progressive tiers promoted
// from meta/{badges,stats,progressive}.js into one Core service. Run:
//   node tests/core/progression.test.mjs
// recordRun() mirrors the exact award order in Game#_gameOver: award one-shot
// badges from the run summary, fold the run delta into lifetime stats, then award
// any progressive tiers the new totals crossed. It persists all three through the
// same meta modules (same localStorage keys/format) and returns the fresh ids for
// the caller to display + mirror to Steam.
import { makeProgression } from '../../src/core/progression.js';
import { loadBadges } from '../../src/meta/badges.js';
import { loadStats } from '../../src/meta/stats.js';
import { loadProgress } from '../../src/meta/progressive.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// One fake store backs all three meta keys (they use distinct keys internally).
function makeStore() {
  const backing = {};
  return {
    backing,
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
  };
}

// A strong run summary + delta that should trip several badges and tier 1s.
const runStats = { won: true, cause: null, reef: 5, depth: 3200, score: 60000, kills: 1, spawned: 40, bosses: 1, pearls: 3, cleanSweep: true, tookDamage: false };
const runDelta = { sharkKills: 6, metersDived: 2100, diveSeconds: 1000, subLoot: 600, netted: 12, dives: 1, salvageEarned: 600, pearlsBanked: 3, bossesFelled: 1, careerScore: 60000 };

// --- 1. loads the three states through their meta modules ---
{
  const prog = makeProgression({ store: makeStore() });
  check('badges state loaded (earned array)', Array.isArray(prog.badges.earned));
  check('stats state loaded (has sharkKills counter)', typeof prog.stats.sharkKills === 'number');
  check('progress state loaded (earned array)', Array.isArray(prog.progress.earned));
}

// --- 2. recordRun awards, folds, and persists all three (same keys) ---
{
  const store = makeStore();
  const prog = makeProgression({ store });
  const { newBadges, freshTiers } = prog.recordRun({ runStats, runDelta });

  check('recordRun awards one-shot badges', newBadges.length >= 5);
  check('recordRun awards progressive tiers', freshTiers.length >= 1);
  check('badges persisted to their key', loadBadges(store).earned.length === newBadges.length);
  check('stats folded + persisted (sharkKills == delta)', loadStats(store).sharkKills === runDelta.sharkKills);
  check('progress persisted to its key', loadProgress(store).earned.length === freshTiers.length);
  check('in-memory badges state reflects the award', prog.badges.earned.length === newBadges.length);
}

// --- 3. semantics: re-recording the same run re-adds stats but no new ids ---
{
  const store = makeStore();
  const prog = makeProgression({ store });
  prog.recordRun({ runStats, runDelta });
  const second = prog.recordRun({ runStats, runDelta });
  check('second identical run earns no new badges (idempotent award)', second.newBadges.length === 0);
  check('second identical run earns no new tiers (already crossed)', second.freshTiers.length === 0);
  check('lifetime stats DID accumulate again (addRun is additive)', prog.stats.sharkKills === runDelta.sharkKills * 2);
}

// --- 4. rank() reflects earned badge count ---
{
  const prog = makeProgression({ store: makeStore() });
  check('rank() before any badges is the entry rank', prog.rank().name === 'Deckhand');
  prog.recordRun({ runStats, runDelta });
  check('rank() climbs once several badges are earned', prog.rank().min > 0);
}

// --- 5. no store → constructs on defaults, never throws ---
{
  let threw = false, prog;
  try { prog = makeProgression(); prog.recordRun({ runStats, runDelta }); } catch (e) { threw = true; }
  check('no-store construction + recordRun never throw', !threw);
  check('no-store recordRun still returns fresh id arrays', Array.isArray(prog.recordRun({ runStats: {}, runDelta: {} }).newBadges));
}

console.log(`progression: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
