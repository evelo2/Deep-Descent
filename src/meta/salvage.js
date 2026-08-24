// The Salvage Log — persistent meta-progression currency (Phase 1: core +
// persistence + run-end payout). Pure and storage-injectable so it is fully
// Node-testable without a DOM: pass a fake `store` (getItem/setItem) in tests;
// in the browser it defaults to `localStorage`.

import { SALVAGE, SKIP, RENTAL } from '../config.js';
import { getRelic } from './relics.js';

const KEY_V1 = 'deepdescent.salvage.v1';   // legacy: had permanent `unlocked[]`
const KEY_V2 = 'deepdescent.salvage.v2';   // current: `rentals{ id -> divesLeft }`

export function defaultSalvage() {
  return { salvage: 0, rentals: {}, slots: SALVAGE.startSlots, loadout: [], reefRelics: {} };
}

function resolveStore(store) {
  if (store) return store;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function clampSlots(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return SALVAGE.startSlots;
  return Math.min(SALVAGE.maxSlots, Math.max(SALVAGE.startSlots, Math.round(n)));
}

function sanitizeSalvage(n) {
  return (typeof n === 'number' && Number.isFinite(n) && n >= 0) ? n : 0;
}

function sanitizeArray(a) {
  return Array.isArray(a) ? a : [];
}

// reefRelics: a bag of found reef-objective relics, keyed by reef number →
// count held (each is a one-use skip token). Sanitize to positive-integer
// counts under integer reef keys ≥ 1.
function sanitizeReefRelics(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o)) {
    const reef = Number(k), n = o[k];
    if (Number.isInteger(reef) && reef >= 1 && typeof n === 'number' && Number.isFinite(n) && n >= 1) {
      out[reef] = Math.min(999, Math.floor(n));
    }
  }
  return out;
}

// rentals: a bag of relicId → dives-remaining. Keep only real relic ids with a
// finite integer value ≥ 1, clamped to the sanitize cap (drops expired ≤ 0).
function sanitizeRentals(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (getRelic(k) && typeof v === 'number' && Number.isFinite(v) && v >= 1) {
      out[k] = Math.min(RENTAL.maxDives, Math.floor(v));
    }
  }
  return out;
}

function parse(s, key) {
  try { const raw = JSON.parse(s.getItem(key)); return (raw && typeof raw === 'object') ? raw : null; }
  catch (e) { return null; }
}

export function loadSalvage(store) {
  const s = resolveStore(store);
  const defaults = defaultSalvage();
  if (!s) return defaults;

  let raw = parse(s, KEY_V2);
  let rentals;
  if (raw) {
    rentals = sanitizeRentals(raw.rentals);
  } else {
    // No v2 save: migrate a legacy v1 save (permanent `unlocked[]` → a full rental
    // period each) so existing players keep their kit. No v1 either → fresh defaults.
    raw = parse(s, KEY_V1);
    if (!raw) return defaults;
    rentals = {};
    for (const id of sanitizeArray(raw.unlocked)) if (getRelic(id)) rentals[id] = RENTAL.dives;
  }

  const merged = { ...defaults, ...raw };
  const loadout = sanitizeArray(merged.loadout).filter((id) => rentals[id] > 0);   // prune stale equips
  return {
    salvage: sanitizeSalvage(merged.salvage),
    rentals,
    slots: clampSlots(merged.slots),
    loadout,
    reefRelics: sanitizeReefRelics(merged.reefRelics),
  };
}

export function saveSalvage(state, store) {
  const s = resolveStore(store);
  if (!s) return;
  try {
    const { salvage, rentals, slots, loadout, reefRelics } = state;
    s.setItem(KEY_V2, JSON.stringify({ salvage, rentals: rentals || {}, slots, loadout, reefRelics: reefRelics || {} }));
  } catch (e) {
    // Persistence must never throw (private-mode / quota / broken store).
  }
}

// Black Pearls grant Salvage immediately on banking (see Game#_bankLoot), not
// here — they are deliberately NOT counted in the milestone payout to avoid
// double-counting a currency that already persisted mid-run.
export function runPayout({ deepestReef = 1, bosses = 0, relicsBanked = 0 } = {}) {
  return Math.round(
    deepestReef * SALVAGE.perReef +
    bosses * SALVAGE.perBoss +
    relicsBanked * SALVAGE.perRelic
  );
}

// ---- Reef-skip relics -----------------------------------------------------
// Physically finding a reef's objective relic banks a one-use token for that
// reef; at the menu it can be cashed to START a new run one reef deeper, with a
// gold head-start. Mutating helpers operate on a loaded salvage state; the
// caller persists via saveSalvage.

// Record one found reef-N relic. No-op for invalid reef numbers.
export function bankReefRelic(state, reef) {
  if (!Number.isInteger(reef) || reef < 1) return state;
  if (!state.reefRelics || typeof state.reefRelics !== 'object') state.reefRelics = {};
  state.reefRelics[reef] = (state.reefRelics[reef] || 0) + 1;
  return state;
}

// Spend one reef-N relic. Returns true if one was available and consumed.
export function consumeReefRelic(state, reef) {
  const r = state.reefRelics;
  if (!r || !(r[reef] > 0)) return false;
  r[reef] -= 1;
  if (r[reef] <= 0) delete r[reef];
  return true;
}

// The set of reefs a run may START at given held relics: a found reef-N relic
// unlocks a start at reef N+1. Returns a sorted ascending list of start reefs
// (always excluding the implicit fresh reef 1). E.g. relics {1:2, 3:1} → [2, 4].
export function availableSkips(state) {
  const r = (state && state.reefRelics) || {};
  return Object.keys(r)
    .filter((k) => r[k] > 0)
    .map((k) => Number(k) + 1)
    .sort((a, b) => a - b);
}

// Gold head-start for beginning at `startReef` (0 at the fresh reef 1).
export function skipStartGold(startReef) {
  return startReef > 1 ? SKIP.goldPerReef * (startReef - 1) : 0;
}
