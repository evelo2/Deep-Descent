// The Trophy Wall — persistent achievement badges: predicate correctness,
// newly-earned diffing, award idempotence, rank ladder, and storage round-trip
// with an injected fake store. Pure module — no DOM.
// Run: node tests/game/badges.test.mjs

import { BADGES, BADGE_BY_ID, RANKS, rankFor, defaultBadges, loadBadges, saveBadges, newlyEarned, awardBadges } from '../../src/meta/badges.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Structure ---
{
  check('badges are defined', Array.isArray(BADGES) && BADGES.length >= 10);
  const ids = BADGES.map((b) => b.id);
  check('badge ids are unique', new Set(ids).size === ids.length);
  check('every badge has name/glyph/desc/test', BADGES.every((b) => b.name && b.glyph && b.desc && typeof b.test === 'function'));
  check('BADGE_BY_ID indexes every badge', BADGES.every((b) => BADGE_BY_ID[b.id] === b));
}

// --- Predicate spot-checks ---
{
  const t = (id, stats) => BADGE_BY_ID[id].test(stats);
  check('firstblood needs a kill', !t('firstblood', { kills: 0 }) && t('firstblood', { kills: 1 }));
  check('pacifist needs a win with zero kills', t('pacifist', { won: true, kills: 0 }) && !t('pacifist', { won: true, kills: 3 }) && !t('pacifist', { won: false, kills: 0 }));
  check('conservationist: win, ≥20 met, <30% killed', t('conservationist', { won: true, spawned: 40, kills: 5 }) && !t('conservationist', { won: true, spawned: 40, kills: 20 }) && !t('conservationist', { won: true, spawned: 5, kills: 0 }));
  check('untouchable needs a hitless win', t('untouchable', { won: true, tookDamage: false }) && !t('untouchable', { won: true, tookDamage: true }));
  check('deepdiver at reef 5, abyssal at reef 8', t('deepdiver', { reef: 5 }) && !t('abyssal', { reef: 5 }) && t('abyssal', { reef: 8 }));
  check('waterlogged: died of air only', t('waterlogged', { won: false, cause: 'air' }) && !t('waterlogged', { won: false, cause: 'killed' }) && !t('waterlogged', { won: true, cause: 'air' }));
  check('oneanddone: died on reef 1', t('oneanddone', { won: false, reef: 1 }) && !t('oneanddone', { won: false, reef: 2 }));
  check('beachcomber needs a clean sweep', t('beachcomber', { cleanSweep: true }) && !t('beachcomber', { cleanSweep: false }));
  check('pearldiver needs 3 pearls', t('pearldiver', { pearls: 3 }) && !t('pearldiver', { pearls: 2 }));
}

// --- newlyEarned / awardBadges ---
{
  const stats = { won: true, kills: 1, spawned: 40, tookDamage: false, reef: 5, depth: 3200, score: 60000, cleanSweep: true, pearls: 3, bosses: 1, cause: null };
  const fresh = newlyEarned(stats, new Set());
  check('a strong run earns several badges', fresh.length >= 5);
  check('newlyEarned excludes already-earned', newlyEarned(stats, new Set(fresh)).length === 0);

  const state = defaultBadges();
  const got = awardBadges(state, stats);
  check('awardBadges returns the fresh ids', got.length === fresh.length);
  check('awardBadges records them in state.earned', got.every((id) => state.earned.includes(id)));
  const again = awardBadges(state, stats);
  check('re-awarding the same run adds nothing (idempotent)', again.length === 0);
  check('earned set has no duplicates after re-award', new Set(state.earned).size === state.earned.length);
}

// --- Rank ladder ---
{
  check('rank ladder is defined ascending', RANKS.length >= 2 && RANKS[0].min === 0);
  check('rankFor(0) is the first rank', rankFor(0) === RANKS[0]);
  check('rankFor(999) is the last rank', rankFor(999) === RANKS[RANKS.length - 1]);
  check('rankFor picks the highest threshold met', rankFor(RANKS[1].min).name === RANKS[1].name);
}

// --- Storage round-trip with a fake store ---
{
  let backing = {};
  const store = { getItem: (k) => (k in backing ? backing[k] : null), setItem: (k, v) => { backing[k] = String(v); } };
  check('empty store loads defaults', loadBadges(store).earned.length === 0);
  saveBadges({ earned: ['firstblood', 'deepdiver', 'bogus-id', 'firstblood'] }, store);
  const loaded = loadBadges(store);
  check('save/load keeps only known ids', loaded.earned.includes('firstblood') && loaded.earned.includes('deepdiver') && !loaded.earned.includes('bogus-id'));
  check('save/load de-duplicates', loaded.earned.filter((id) => id === 'firstblood').length === 1);
  check('no store → defaults, no throw', loadBadges(null).earned.length === 0);
}

console.log(`badges: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
