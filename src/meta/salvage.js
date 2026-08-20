// The Salvage Log — persistent meta-progression currency (Phase 1: core +
// persistence + run-end payout). Pure and storage-injectable so it is fully
// Node-testable without a DOM: pass a fake `store` (getItem/setItem) in tests;
// in the browser it defaults to `localStorage`.

import { SALVAGE } from '../config.js';

const KEY = 'deepdescent.salvage.v1';

export function defaultSalvage() {
  return { salvage: 0, unlocked: [], slots: SALVAGE.startSlots, loadout: [] };
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

export function loadSalvage(store) {
  const s = resolveStore(store);
  const defaults = defaultSalvage();
  if (!s) return defaults;

  let raw = null;
  try {
    raw = JSON.parse(s.getItem(KEY));
  } catch (e) {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return defaults;

  const merged = { ...defaults, ...raw };
  return {
    salvage: sanitizeSalvage(merged.salvage),
    unlocked: sanitizeArray(merged.unlocked),
    slots: clampSlots(merged.slots),
    loadout: sanitizeArray(merged.loadout),
  };
}

export function saveSalvage(state, store) {
  const s = resolveStore(store);
  if (!s) return;
  try {
    const { salvage, unlocked, slots, loadout } = state;
    s.setItem(KEY, JSON.stringify({ salvage, unlocked, slots, loadout }));
  } catch (e) {
    // Persistence must never throw (private-mode / quota / broken store).
  }
}

export function runPayout({ deepestReef = 1, bosses = 0, relicsBanked = 0, pearls = 0 } = {}) {
  return Math.round(
    deepestReef * SALVAGE.perReef +
    bosses * SALVAGE.perBoss +
    relicsBanked * SALVAGE.perRelic +
    pearls * SALVAGE.perPearl
  );
}
