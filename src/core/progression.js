// Progression — the Core-owned achievement/stats spine, promoted from
// meta/badges.js + meta/stats.js + meta/progressive.js. A THIN service: it loads
// the three states once (through the existing storage-injectable meta modules, so
// every localStorage key + format is byte-identical to baseline), owns them, and
// offers a single `recordRun` that mirrors the exact award order Game#_gameOver
// already uses. Future minigames record their run through this one path; the
// legacy game keeps its own inline _gameOver (unchanged) but now reads/renders
// these same owned states via host.progression.

import { loadBadges, saveBadges, awardBadges, rankFor } from '../meta/badges.js';
import { loadStats, saveStats, addRun } from '../meta/stats.js';
import { loadProgress, saveProgress, awardProgress } from '../meta/progressive.js';

/**
 * @param {Object} [opts]
 * @param {Storage} [opts.store]  localStorage-shaped store; defaults inside the
 *        meta modules to the real localStorage in the browser.
 * @returns {{
 *   badges: object, stats: object, progress: object,
 *   rank: () => {min:number, name:string},
 *   recordRun: (run: {runStats?: object, runDelta?: object}) =>
 *              {newBadges: string[], freshTiers: string[]},
 * }}
 */
export function makeProgression({ store } = {}) {
  const badges = loadBadges(store);      // The Trophy Wall (one-shot badges)
  const stats = loadStats(store);        // lifetime cumulative counters
  const progress = loadProgress(store);  // earned progressive tier ids

  return {
    badges, stats, progress,

    // The rank ladder is keyed to how many one-shot badges are earned.
    rank() { return rankFor(badges.earned.length); },

    // Credit one run's outcome to progression, in the same order as _gameOver:
    //   1. award one-shot badges from the run summary,
    //   2. fold the run delta into the lifetime counters,
    //   3. award any progressive tiers the new totals crossed.
    // Persists each through its meta module (same keys/format) and returns the
    // fresh ids so the caller can toast them + mirror to Steam.
    recordRun({ runStats = {}, runDelta = {} } = {}) {
      const newBadges = awardBadges(badges, runStats);
      saveBadges(badges, store);

      addRun(stats, runDelta);
      saveStats(stats, store);

      const freshTiers = awardProgress(progress, stats);
      saveProgress(progress, store);

      return { newBadges, freshTiers };
    },
  };
}
