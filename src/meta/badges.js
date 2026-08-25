// The Trophy Wall — persistent achievement badges, earned once and kept
// forever. Pure and storage-injectable exactly like salvage.js: pass a fake
// `store` (getItem/setItem) in tests; defaults to localStorage in the browser.
//
// Each badge has a `test(stats)` predicate run at game-over against the run
// summary that game.js builds (see Game#_runStats). Badges are evaluated every
// run; only ones not already earned and now passing are "newly earned".

const KEY = 'deepdescent.badges.v1';

// The run-summary `stats` shape (all optional; missing → falsy):
//   { won, cause, reef, depth, score, kills, spawned, bosses, pearls,
//     cleanSweep, tookDamage }
export const BADGES = [
  // --- Feats of arms & mercy ---
  { id: 'firstblood',      name: 'First Blood',        glyph: '⚔️', desc: 'Spear your first creature.',                     test: (s) => s.kills >= 1 },
  { id: 'krakenslayer',    name: 'Kraken Slayer',      glyph: '🦑', desc: 'Fell the Kraken.',                               test: (s) => s.bosses >= 1 },
  { id: 'pacifist',        name: 'Pacifist',           glyph: '🌿', desc: 'Clear a reef without a single kill.',            test: (s) => s.won && s.kills === 0 },
  { id: 'conservationist', name: 'Conservationist',    glyph: '🕊️', desc: 'Win having killed under 30% of the creatures you met.', test: (s) => s.won && s.spawned >= 20 && s.kills / s.spawned < 0.3 },
  { id: 'untouchable',     name: 'Untouchable',        glyph: '🛡️', desc: 'Win a run without losing a life.',               test: (s) => s.won && !s.tookDamage },
  // --- Riches ---
  { id: 'beachcomber',     name: 'Beachcomber',        glyph: '🧹', desc: "Collect 100% of a reef's treasure.",             test: (s) => !!s.cleanSweep },
  { id: 'pearldiver',      name: 'Pearl Diver',        glyph: '⚫', desc: 'Bank 3 Black Pearls in one run.',                test: (s) => s.pearls >= 3 },
  { id: 'highroller',      name: 'High Roller',        glyph: '🎰', desc: 'Score 50,000 in a single run.',                  test: (s) => s.score >= 50000 },
  // --- Depth ---
  { id: 'deepdiver',       name: 'Deep Diver',         glyph: '🌊', desc: 'Reach Reef 5.',                                  test: (s) => s.reef >= 5 },
  { id: 'abyssal',         name: 'Abyssal',            glyph: '🕳️', desc: 'Reach Reef 8.',                                  test: (s) => s.reef >= 8 },
  { id: 'marathon',        name: 'Marathon Diver',     glyph: '🏊', desc: 'Descend past 3000m in one run.',                 test: (s) => s.depth >= 3000 },
  // --- Fail badges, worn with dubious pride ---
  { id: 'waterlogged',     name: 'Waterlogged',        glyph: '💀', desc: 'Run out of air.',                                test: (s) => !s.won && s.cause === 'air' },
  { id: 'oneanddone',      name: 'One and Done',       glyph: '🪦', desc: 'Die on Reef 1.',                                  test: (s) => !s.won && s.reef === 1 },
  { id: 'emptyhanded',     name: 'Empty-Handed',       glyph: '🫙', desc: 'End a run with a score of nothing.',             test: (s) => s.score === 0 },
  // --- Treasure Chest Madness / Guardian chest ---
  { id: 'firsttreasure', name: 'First Treasure', glyph: '🧰', desc: 'Open a guarded reef chest.',            test: (s) => s.chestsOpened >= 1 },
  { id: 'guardiandown',  name: 'Guardian Down',  glyph: '🐉', desc: 'Fell a chest guardian.',                test: (s) => s.guardiansFelled >= 1 },
  { id: 'comboartist',   name: 'Combo Artist',   glyph: '🎇', desc: 'Detonate a special-on-special combo.',  test: (s) => s.m3Combo >= 1 },
  { id: 'hoardcleared',  name: 'Hoard Cleared',  glyph: '🏆', desc: 'Clear every level of a chest run.',      test: (s) => !!s.hoardCleared },
];

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

// A light rank ladder keyed to how many badges you've earned.
export const RANKS = [
  { min: 0,  name: 'Deckhand' },
  { min: 3,  name: 'Diver' },
  { min: 6,  name: 'Salvager' },
  { min: 9,  name: 'Deep Veteran' },
  { min: 12, name: 'Master of the Deep' },
];
export function rankFor(count) {
  let r = RANKS[0];
  for (const x of RANKS) if (count >= x.min) r = x;
  return r;
}

function resolveStore(store) {
  if (store) return store;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function defaultBadges() {
  return { earned: [] };
}

function sanitizeEarned(a) {
  if (!Array.isArray(a)) return [];
  // Keep only known ids, de-duplicated, in canonical BADGES order.
  const set = new Set(a.filter((id) => BADGE_BY_ID[id]));
  return BADGES.filter((b) => set.has(b.id)).map((b) => b.id);
}

export function loadBadges(store) {
  const s = resolveStore(store);
  const defaults = defaultBadges();
  if (!s) return defaults;
  let raw = null;
  try { raw = JSON.parse(s.getItem(KEY)); } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object') return defaults;
  return { earned: sanitizeEarned(raw.earned) };
}

export function saveBadges(state, store) {
  const s = resolveStore(store);
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify({ earned: sanitizeEarned(state.earned) }));
  } catch (e) {
    // Persistence must never throw (private-mode / quota / broken store).
  }
}

// A test predicate must never crash run-end; guard it.
function safeTest(badge, stats) {
  try { return !!badge.test(stats || {}); } catch (e) { return false; }
}

// Given run stats and the set of already-earned ids, return the NEWLY earned
// badge ids in canonical order. Pure — does not mutate or persist.
export function newlyEarned(stats, earnedSet) {
  return BADGES.filter((b) => !earnedSet.has(b.id) && safeTest(b, stats)).map((b) => b.id);
}

// Award any newly-earned badges into `state.earned` (mutates + returns the fresh
// ids). Caller persists via saveBadges.
export function awardBadges(state, stats) {
  if (!state.earned) state.earned = [];
  const set = new Set(state.earned);
  const fresh = newlyEarned(stats, set);
  for (const id of fresh) set.add(id);
  state.earned = sanitizeEarned([...set]);
  return fresh;
}
