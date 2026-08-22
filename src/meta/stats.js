// Lifetime cumulative stats — the raw counters that progressive badges (see
// progressive.js) are earned against. Persisted across runs, pure and
// storage-injectable exactly like badges.js/salvage.js: pass a fake `store`
// (getItem/setItem) in tests; defaults to localStorage in the browser.
//
// A run contributes a delta at game-over (Game#_gameOver -> addRun); tiers are
// then evaluated against the new lifetime totals.

const KEY = 'deepdescent.stats.v1';

// Every tracked lifetime counter. Keep this list and the defaults in sync.
export const STAT_KEYS = [
  'sharkKills', 'metersDived', 'diveSeconds', 'subLoot', 'netted', 'dives',
  'salvageEarned', 'pearlsBanked', 'bossesFelled', 'careerScore',
];

export function defaultStats() {
  const o = {};
  for (const k of STAT_KEYS) o[k] = 0;
  return o;
}

function resolveStore(store) {
  if (store) return store;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

// Coerce to a finite, non-negative number (counters never go backwards).
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sanitize(raw) {
  const out = defaultStats();
  if (raw && typeof raw === 'object') {
    for (const k of STAT_KEYS) out[k] = num(raw[k]);
  }
  return out;
}

export function loadStats(store) {
  const s = resolveStore(store);
  if (!s) return defaultStats();
  let raw = null;
  try { raw = JSON.parse(s.getItem(KEY)); } catch (e) { raw = null; }
  return sanitize(raw);
}

export function saveStats(state, store) {
  const s = resolveStore(store);
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(sanitize(state)));
  } catch (e) {
    // Persistence must never throw (private-mode / quota / broken store).
  }
}

// Fold a run's deltas into the lifetime totals (mutates + returns state). Only
// known keys are added; unknown keys and non-positive deltas are ignored. Caller
// persists via saveStats.
export function addRun(state, delta) {
  if (!delta || typeof delta !== 'object') return state;
  for (const k of STAT_KEYS) {
    if (k in delta) state[k] = num(state[k]) + num(delta[k]);
  }
  return state;
}
