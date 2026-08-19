// Platformer stage: parsing + physics for the cave-entrance minigame. LOGIC ONLY
// — no canvas/DOM imports, so Node can run it under test and the Game can drive
// it headlessly. Rendering lives in src/render/stage.js.
import { STAGE } from '../config.js';

const T = STAGE.tile;

// Glyphs that remain in the static grid after extraction (everything the physics
// queries by tile). Dynamic glyphs (S/o/$/x/E) are pulled into lists and their
// cell is cleared to '.'.
const STATIC = new Set(['.', '#', 'H', '^', '<', '>']);

export function parseRoom(rows) {
  const grid = rows.map((r) => r.split(''));
  const loot = [], movers = [];
  let start = null, cache = null;
  const cellBox = (c, r) => ({ x: c * T, y: r * T, w: T, h: T });
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const g = grid[r][c];
      if (STATIC.has(g)) continue;
      if (g === 'S') {
        start = { x: c * T + (T - STAGE.bodyW) / 2, y: r * T + (T - STAGE.bodyH) };
      } else if (g === 'o') {
        loot.push({ ...cellBox(c, r), taken: false });
      } else if (g === '$') {
        cache = { ...cellBox(c, r), taken: false };
      } else if (g === 'x') {
        movers.push({ ...cellBox(c, r), mode: 'slide', x0: c * T, dir: 1 });
      } else if (g === 'E') {
        movers.push({ ...cellBox(c, r), mode: 'patrol', x0: c * T, dir: 1 });
      }
      grid[r][c] = '.';   // clear the dynamic glyph from the static grid
    }
  }
  if (!start) start = { x: T, y: T };   // defensive: every room should have an S
  return { cols: STAGE.cols, rows: STAGE.rows, grid, start, loot, movers, cache };
}

export function solidAt(room, col, row) {
  if (col < 0 || col >= room.cols) return true;   // side walls
  if (row < 0) return true;                        // ceiling
  if (row >= room.rows) return false;              // below floor = pit
  return room.grid[row][col] === '#';
}
export function ladderAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
  return room.grid[row][col] === 'H';
}
export function spikeAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
  return room.grid[row][col] === '^';
}
export function doorKindAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return null;
  const g = room.grid[row][col];
  return g === '<' || g === '>' ? g : null;
}

// Tile-range helpers used by the physics (Task 3+).
export function tileRange(x, y, w, h) {
  return {
    c0: Math.floor(x / T), c1: Math.floor((x + w - 1) / T),
    r0: Math.floor(y / T), r1: Math.floor((y + h - 1) / T),
  };
}
export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
