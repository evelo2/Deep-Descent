// @ts-check
// Achievements — the Core-owned bridge to Steam. A THIN forwarder over the
// existing platform/steam.js seam: unlock(id) hands a badge/tier id to Steam
// (a no-op on the web build, where window.steam is undefined). The unlock fn is
// injectable so future minigames + tests can supply their own; it defaults to
// platform/steam.js#unlockAchievement. This is the uniform path Core.creditResult
// uses to mirror a run's achievements; the legacy game still calls the seam
// inline in _gameOver (unchanged) — both routes end at the same no-throw shim.

import { unlockAchievement } from '../platform/steam.js';

/**
 * @param {Object} [opts]
 * @param {(id: string) => any} [opts.unlock]  Defaults to unlockAchievement.
 * @returns {{ unlock: (id: string) => any }}
 */
export function makeAchievements({ unlock = unlockAchievement } = {}) {
  return { unlock: (id) => unlock(id) };
}
