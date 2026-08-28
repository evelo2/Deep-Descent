// @ts-check
// The catalogue — every minigame's manifest, statically imported. Manifests are
// tiny pure data, so the shell can build menus, help screens, the Trophy Wall
// and unlock gating at boot WITHOUT loading a single engine. Engines stay behind
// each manifest's `module` thunk (contract v1, spec §1 decision #6).
//
// IMPORTANT: import manifests here, never an engine `index.js` — one such import
// would eagerly pull in a whole game and defeat the lazy design.

import legacy from './legacy/manifest.js';
import match3 from './match3/manifest.js';
import { validateManifest } from '../core/manifest.js';
import { GRANDFATHERED } from '../core/grandfathered-ids.js';

/** Every registered minigame, in display order — the base game first. */
export const CATALOGUE = Object.freeze([legacy, match3]);

/** @param {string} id @returns {*} the manifest, or undefined. */
export function manifestById(id) {
  return CATALOGUE.find((m) => m.id === id);
}

/**
 * Validate the whole catalogue: every manifest against contract v1, plus the
 * cross-manifest rules no single manifest can check (unique minigame ids, and
 * no goal id claimed twice).
 * @returns {string[]} problems; empty means valid.
 */
export function validateCatalogue() {
  /** @type {string[]} */
  const errs = [];
  const seenGame = new Set();
  /** @type {Map<string, string>} goal id -> owning minigame id */
  const seenGoal = new Map();

  for (const m of CATALOGUE) {
    for (const e of validateManifest(m, { grandfathered: GRANDFATHERED })) {
      errs.push(`[${m && m.id}] ${e}`);
    }
    if (seenGame.has(m.id)) errs.push(`duplicate minigame id '${m.id}'`);
    seenGame.add(m.id);

    /** @type {{ badges?: Array<{id: string}>, stats?: Array<{key: string}>, tracks?: Array<{id: string}> }} */
    const goals = m.goals || {};
    const owned = [
      ...(goals.badges || []).map((b) => b.id),
      ...(goals.stats || []).map((s) => s.key),
      ...(goals.tracks || []).map((t) => t.id),
    ];
    for (const id of owned) {
      const prior = seenGoal.get(id);
      if (prior && prior !== m.id) {
        errs.push(`goal id '${id}' is claimed by both '${prior}' and '${m.id}'`);
      }
      if (!seenGoal.has(id)) {
        seenGoal.set(id, m.id);
      }
    }
  }
  return errs;
}
