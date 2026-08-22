// Progressive tier badges: thresholds award once, in order, against lifetime
// stats; the earned set survives a store round-trip and rejects unknown ids.
// Run: node tests/game/progressive-badges.test.mjs

import {
  TRACKS, PROGRESSIVE_IDS, tierId, defaultProgress, loadProgress, saveProgress,
  newlyEarnedProgress, awardProgress, trackProgress,
} from '../../src/meta/progressive.js';
import { STAT_KEYS } from '../../src/meta/stats.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const fakeStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

// --- Shape ---
check('10 tracks', TRACKS.length === 10);
check('every track has exactly 3 tiers', TRACKS.every((t) => t.tiers.length === 3 && t.names.length === 3));
check('30 flattened tier ids', PROGRESSIVE_IDS.length === 30);
check('tier ids are unique', new Set(PROGRESSIVE_IDS).size === 30);
check('every track binds a real stat key', TRACKS.every((t) => STAT_KEYS.includes(t.stat)));
check('tiers ascend within each track', TRACKS.every((t) => t.tiers[0] < t.tiers[1] && t.tiers[1] < t.tiers[2]));
check('tierId format', tierId(TRACKS[0], 0) === 'shark_1' && tierId(TRACKS[0], 2) === 'shark_3');

// --- Awarding crosses only the tiers actually reached ---
{
  const state = defaultProgress();
  // sharkKills 60 → tiers 1 (5) and 2 (50) but not 3 (300); dives 5 → tier 1 only.
  const fresh = awardProgress(state, { sharkKills: 60, dives: 5 });
  check('awards every crossed tier', fresh.includes('shark_1') && fresh.includes('shark_2') && fresh.includes('dives_1'));
  check('does NOT award an unreached tier', !fresh.includes('shark_3'));
  check('earned set persists the crossings', state.earned.includes('shark_2'));
}

// --- Idempotent: re-awarding the same stats yields nothing new ---
{
  const state = defaultProgress();
  awardProgress(state, { sharkKills: 300 });
  const again = awardProgress(state, { sharkKills: 300 });
  check('no tier is awarded twice', again.length === 0);
  check('all three shark tiers held', ['shark_1', 'shark_2', 'shark_3'].every((id) => state.earned.includes(id)));
}

// --- Growth over time awards the newly-crossed tier only ---
{
  const state = defaultProgress();
  awardProgress(state, { netted: 10 });            // tier 1 (10)
  const step = awardProgress(state, { netted: 150 }); // now tier 2 (150)
  check('later growth awards just the new tier', step.length === 1 && step[0] === 'net_2');
}

// --- Persistence round-trip + unknown-id rejection ---
{
  const store = fakeStore();
  const state = defaultProgress();
  awardProgress(state, { sharkKills: 50, dives: 300 });
  state.earned.push('not_a_real_tier');
  saveProgress(state, store);
  const back = loadProgress(store);
  check('reload keeps real earned ids', back.earned.includes('shark_2') && back.earned.includes('dives_3'));
  check('reload drops unknown ids', !back.earned.includes('not_a_real_tier'));
}

// --- trackProgress view-model ---
{
  const shark = TRACKS[0];
  const p = trackProgress({ sharkKills: 60 }, shark);
  check('trackProgress.reached counts tiers below value', p.reached === 2);
  check('trackProgress.next is the following threshold', p.next === 300);
  const maxed = trackProgress({ sharkKills: 999 }, shark);
  check('maxed track has null next', maxed.next === null && maxed.reached === 3);
}

// --- newlyEarnedProgress is pure (no mutation) ---
{
  const set = new Set();
  const fresh = newlyEarnedProgress({ dives: 5 }, set);
  check('newlyEarnedProgress returns fresh ids', fresh.includes('dives_1'));
  check('newlyEarnedProgress does not mutate the set', set.size === 0);
}

console.log(`progressive-badges: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
