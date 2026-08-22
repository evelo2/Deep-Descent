// Progressive (tiered) badges — earned against LIFETIME stats (see stats.js),
// so they accumulate across runs. Tier 1 is easy (a run or two); tier 3 is a
// long-haul grind. Structurally a sibling of badges.js: an earned-id set in its
// own localStorage key, storage-injectable for tests. The 14 one-shot badges in
// badges.js are untouched — this sits alongside them.
//
// Each track binds one lifetime stat to three ascending thresholds. A tier's
// badge id is `${track.id}_${n}` (n = 1..3), e.g. 'shark_1'. Those ids are also
// the Steam achievement API names (see desktop/achievements.json).

const KEY = 'deepdescent.progress.v1';

// stat: the lifetime counter key in stats.js. thresholds: [t1, t2, t3] ascending.
// unit: optional formatter hint for the Trophy Wall ('m' | 'time' | 'gold' | '').
export const TRACKS = [
  { id: 'shark',  stat: 'sharkKills',  glyph: '🦈', label: 'Shark Culler',    unit: '',
    tiers: [5, 50, 300],       names: ['Shark Culler I', 'Shark Culler II', 'Shark Culler III'] },
  { id: 'depth',  stat: 'metersDived', glyph: '📏', label: 'Descent',         unit: 'm',
    tiers: [2000, 25000, 150000], names: ['Descent I', 'Descent II', 'Descent III'] },
  { id: 'time',   stat: 'diveSeconds', glyph: '⏱️', label: 'Time Underwater', unit: 'time',
    tiers: [900, 7200, 43200], names: ['Time Underwater I', 'Time Underwater II', 'Time Underwater III'] },
  { id: 'subloot',stat: 'subLoot',     glyph: '🛥️', label: 'Trench Hauler',   unit: 'gold',
    tiers: [500, 10000, 60000], names: ['Trench Hauler I', 'Trench Hauler II', 'Trench Hauler III'] },
  { id: 'net',    stat: 'netted',      glyph: '🕸️', label: 'Net Wrangler',    unit: '',
    tiers: [10, 150, 750],     names: ['Net Wrangler I', 'Net Wrangler II', 'Net Wrangler III'] },
  { id: 'dives',  stat: 'dives',       glyph: '🤿', label: 'Seasoned Diver',  unit: '',
    tiers: [5, 50, 300],       names: ['Seasoned Diver I', 'Seasoned Diver II', 'Seasoned Diver III'] },
  { id: 'salvage',stat: 'salvageEarned', glyph: '💰', label: 'Salvage Baron', unit: 'gold',
    tiers: [500, 5000, 30000], names: ['Salvage Baron I', 'Salvage Baron II', 'Salvage Baron III'] },
  { id: 'pearls', stat: 'pearlsBanked', glyph: '⚫', label: 'Pearl Hoarder',  unit: '',
    tiers: [3, 25, 100],       names: ['Pearl Hoarder I', 'Pearl Hoarder II', 'Pearl Hoarder III'] },
  { id: 'bosses', stat: 'bossesFelled', glyph: '🦑', label: 'Monster Hunter', unit: '',
    tiers: [1, 10, 40],        names: ['Monster Hunter I', 'Monster Hunter II', 'Monster Hunter III'] },
  { id: 'score',  stat: 'careerScore', glyph: '🏆', label: 'Point Chaser',   unit: '',
    tiers: [50000, 500000, 5000000], names: ['Point Chaser I', 'Point Chaser II', 'Point Chaser III'] },
];

// Flattened tier id for a track + tier index (0-based).
export function tierId(track, i) { return `${track.id}_${i + 1}`; }

// All tier ids in canonical (track, then tier) order — the source of truth for
// the Steam manifest and the earned-set sanitizer.
export const PROGRESSIVE_IDS = TRACKS.flatMap((tr) => tr.tiers.map((_, i) => tierId(tr, i)));
const ID_SET = new Set(PROGRESSIVE_IDS);

// tier id -> { name, glyph } for game-over toasts and the Trophy Wall.
const TIER_INFO = {};
for (const tr of TRACKS) tr.tiers.forEach((_, i) => { TIER_INFO[tierId(tr, i)] = { name: tr.names[i], glyph: tr.glyph }; });
export function tierNameById(id) { return TIER_INFO[id] ? `${TIER_INFO[id].glyph} ${TIER_INFO[id].name}` : null; }

export function defaultProgress() {
  return { earned: [] };
}

function resolveStore(store) {
  if (store) return store;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function sanitizeEarned(a) {
  if (!Array.isArray(a)) return [];
  const set = new Set(a.filter((id) => ID_SET.has(id)));
  return PROGRESSIVE_IDS.filter((id) => set.has(id));   // known ids, canonical order
}

export function loadProgress(store) {
  const s = resolveStore(store);
  if (!s) return defaultProgress();
  let raw = null;
  try { raw = JSON.parse(s.getItem(KEY)); } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object') return defaultProgress();
  return { earned: sanitizeEarned(raw.earned) };
}

export function saveProgress(state, store) {
  const s = resolveStore(store);
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify({ earned: sanitizeEarned(state.earned) }));
  } catch (e) {
    // Persistence must never throw.
  }
}

// Newly-crossed tier ids given lifetime stats and the already-earned set. Pure.
export function newlyEarnedProgress(life, earnedSet) {
  const fresh = [];
  for (const tr of TRACKS) {
    const have = (life && Number(life[tr.stat])) || 0;
    tr.tiers.forEach((threshold, i) => {
      const id = tierId(tr, i);
      if (have >= threshold && !earnedSet.has(id)) fresh.push(id);
    });
  }
  return fresh;
}

// Award any newly-crossed tiers into state.earned (mutates + returns fresh ids).
export function awardProgress(state, life) {
  if (!state.earned) state.earned = [];
  const set = new Set(state.earned);
  const fresh = newlyEarnedProgress(life, set);
  for (const id of fresh) set.add(id);
  state.earned = sanitizeEarned([...set]);
  return fresh;
}

// View-model for one track's Trophy Wall row: current value, highest tier reached
// (0..3), and the next threshold to chase (null once maxed).
export function trackProgress(life, track) {
  const have = (life && Number(life[track.stat])) || 0;
  let reached = 0;
  for (const t of track.tiers) if (have >= t) reached++;
  const next = reached < track.tiers.length ? track.tiers[reached] : null;
  return { have, reached, next, max: track.tiers.length };
}
