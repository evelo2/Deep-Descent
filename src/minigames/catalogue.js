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
 * no goal id claimed twice by the same kind).
 * @param {*} [list] The list of manifests to validate; defaults to CATALOGUE.
 * @returns {string[]} problems; empty means valid.
 */
export function validateCatalogue(list = CATALOGUE) {
  /** @type {string[]} */
  const errs = [];
  const seenGame = new Set();
  /** @type {Map<string, string>} badge id -> owning minigame id */
  const seenBadges = new Map();
  /** @type {Map<string, string>} stat key -> owning minigame id */
  const seenStats = new Map();
  /** @type {Map<string, string>} track id -> owning minigame id */
  const seenTracks = new Map();

  for (const m of list) {
    for (const e of validateManifest(m, { grandfathered: GRANDFATHERED })) {
      errs.push(`[${m && m.id}] ${e}`);
    }
    if (seenGame.has(m.id)) errs.push(`duplicate minigame id '${m.id}'`);
    seenGame.add(m.id);

    /** @type {{ badges?: Array<{id: string}>, stats?: Array<{key: string}>, tracks?: Array<{id: string}> }} */
    const goals = m.goals || {};

    // Check badges
    for (const b of goals.badges || []) {
      const id = b && b.id;
      if (id) {
        const prior = seenBadges.get(id);
        if (prior) {
          errs.push(`badge id '${id}' is claimed by both '${prior}' and '${m.id}'`);
        } else {
          seenBadges.set(id, m.id);
        }
      }
    }

    // Check stats
    for (const s of goals.stats || []) {
      const key = s && s.key;
      if (key) {
        const prior = seenStats.get(key);
        if (prior) {
          errs.push(`stat key '${key}' is claimed by both '${prior}' and '${m.id}'`);
        } else {
          seenStats.set(key, m.id);
        }
      }
    }

    // Check tracks
    for (const t of goals.tracks || []) {
      const id = t && t.id;
      if (id) {
        const prior = seenTracks.get(id);
        if (prior) {
          errs.push(`track id '${id}' is claimed by both '${prior}' and '${m.id}'`);
        } else {
          seenTracks.set(id, m.id);
        }
      }
    }
  }
  return errs;
}
