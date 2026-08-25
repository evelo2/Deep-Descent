// @ts-check
// Pure accumulation of Treasure Chest Madness stats across a session's levels.
// Kept out of index.js so it's unit-testable without the module closure. Tile
// types 0/1/2 = Pearl/Gem/Coin (see levels.js TILE_NAMES).

export function newMatchAccum() {
  return { m3Pearls: 0, m3Gems: 0, m3Coins: 0, m3Explosions: 0, m3Combo: 0 };
}

// Fold one applySwap result into the accumulator. `combo` is a module-side flag
// set when the swap moved two specials together (no engine change needed).
export function foldMatchStats(acc, res, combo = false) {
  const c = (res && res.cleared) || {};
  acc.m3Pearls += c[0] || 0;
  acc.m3Gems += c[1] || 0;
  acc.m3Coins += c[2] || 0;
  acc.m3Explosions += (res && res.blasts) || 0;
  if (combo) acc.m3Combo += 1;
  return acc;
}

// Build the { runDelta, runStats } pair for host.progression.recordRun.
export function matchRunResult(acc, { hoardCleared = false } = {}) {
  return {
    runDelta: {
      m3Pearls: acc.m3Pearls, m3Gems: acc.m3Gems,
      m3Coins: acc.m3Coins, m3Explosions: acc.m3Explosions,
    },
    runStats: { m3Combo: acc.m3Combo, hoardCleared: !!hoardCleared },
  };
}
