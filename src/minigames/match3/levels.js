// @ts-check
// Level data for Salvage Match. v1 goal type is 'collect N of a target tile
// within a move budget'; the schema leaves room for 'score'/'clear' goals later.
// All numbers are playtest-tunable; rewards sit in a dive's ballpark
// (SALVAGE.perReef=8, perRelic=15) so grinding the set ≈ a short dive.

/** @typedef {{ id:number, goalType:'collect', targetTile:number, targetCount:number, moves:number, reward:number, tiles:number }} Level */

// Tile type ids: 0 pearl · 1 gem · 2 coin · 3 shell · 4 starfish · 5 coral.
export const TILE_NAMES = ['Pearl', 'Gem', 'Coin', 'Shell', 'Starfish', 'Coral'];

/** @type {Level[]} */
export const LEVELS = [
  { id: 1, goalType: 'collect', targetTile: 0, targetCount: 12, moves: 20, reward: 6, tiles: 6 },
  { id: 2, goalType: 'collect', targetTile: 1, targetCount: 16, moves: 20, reward: 8, tiles: 6 },
  { id: 3, goalType: 'collect', targetTile: 2, targetCount: 20, moves: 18, reward: 10, tiles: 6 },
  { id: 4, goalType: 'collect', targetTile: 3, targetCount: 24, moves: 18, reward: 12, tiles: 6 },
  { id: 5, goalType: 'collect', targetTile: 0, targetCount: 30, moves: 16, reward: 15, tiles: 6 },
];

export function getLevel(i) { return LEVELS[i] || null; }

/** Salvage bonus for unused moves at level clear (1 per 2 leftover moves). */
export function leftoverBonus(moves) { return Math.max(0, Math.floor(moves / 2)); }
