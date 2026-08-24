// @ts-check
// Pure match-3 engine — no canvas, no DOM, no timers. Deterministic via an
// injected rng, so the whole model is Node-unit-testable (like the Stage engine).
// The renderer/module animate the discrete resolution steps this returns.

/** @typedef {{ type:number, special:null|'line'|'bomb' }} Tile */
/** @typedef {{ cols:number, rows:number, types:number, rng:()=>number, tiles:(Tile|null)[][] }} Board */

export function at(board, r, c) {
  if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return null;
  return board.tiles[r][c];
}

const randType = (board) => (board.rng() * board.types) | 0;

/** All runs of ≥3 same-type tiles, horizontal and vertical. */
export function findRuns(board) {
  const runs = [];
  const { rows, cols, tiles } = board;
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const t = tiles[r][c];
      if (!t) { c++; continue; }
      let c2 = c + 1;
      while (c2 < cols && tiles[r][c2] && tiles[r][c2].type === t.type) c2++;
      if (c2 - c >= 3) { const cells = []; for (let x = c; x < c2; x++) cells.push([r, x]); runs.push({ cells, axis: 'row', type: t.type, len: c2 - c }); }
      c = c2;
    }
  }
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const t = tiles[r][c];
      if (!t) { r++; continue; }
      let r2 = r + 1;
      while (r2 < rows && tiles[r2][c] && tiles[r2][c].type === t.type) r2++;
      if (r2 - r >= 3) { const cells = []; for (let y = r; y < r2; y++) cells.push([y, c]); runs.push({ cells, axis: 'col', type: t.type, len: r2 - r }); }
      r = r2;
    }
  }
  return runs;
}

const adjacent = (r1, c1, r2, c2) => Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
const inBounds = (board, r, c) => r >= 0 && c >= 0 && r < board.rows && c < board.cols;

function swapCells(board, r1, c1, r2, c2) {
  const tmp = board.tiles[r1][c1];
  board.tiles[r1][c1] = board.tiles[r2][c2];
  board.tiles[r2][c2] = tmp;
}

/**
 * Would swapping these two create a run? (temp swap, restored)
 * Out-of-range coordinates are rejected up front — this is the single
 * bounds gate for both wouldMatch and legalSwap (which delegates here),
 * so swapCells never runs against an out-of-range index and can't grow
 * a tiles row.
 */
export function wouldMatch(board, r1, c1, r2, c2) {
  if (!inBounds(board, r1, c1) || !inBounds(board, r2, c2)) return false;
  swapCells(board, r1, c1, r2, c2);
  const ok = findRuns(board).length > 0;
  swapCells(board, r1, c1, r2, c2);
  return ok;
}

export function legalSwap(board, r1, c1, r2, c2) {
  return adjacent(r1, c1, r2, c2) && wouldMatch(board, r1, c1, r2, c2);
}

/** Any adjacent pair whose swap makes a match. */
export function hasAnyMove(board) {
  const { rows, cols } = board;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && wouldMatch(board, r, c, r, c + 1)) return true;
      if (r + 1 < rows && wouldMatch(board, r, c, r + 1, c)) return true;
    }
  }
  return false;
}

/** Fill the whole board with random tiles that have no run. */
function fillNoMatch(board) {
  const { rows, cols } = board;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let t, guard = 0;
      do {
        t = randType(board);
        // reject if it completes a run with the two tiles left/up
        const l1 = at(board, r, c - 1), l2 = at(board, r, c - 2);
        const u1 = at(board, r - 1, c), u2 = at(board, r - 2, c);
        const bad = (l1 && l2 && l1.type === t && l2.type === t) || (u1 && u2 && u1.type === t && u2.type === t);
        board.tiles[r][c] = { type: t, special: null };
        if (!bad || guard++ > 20) break;
      } while (true);
    }
  }
}

export function makeBoard({ cols = 8, rows = 8, types = 6, rng = Math.random } = {}) {
  const board = { cols, rows, types, rng, tiles: Array.from({ length: rows }, () => Array(cols).fill(null)) };
  let guard = 0;
  do { fillNoMatch(board); } while (!hasAnyMove(board) && guard++ < 50);
  return board;
}

/** Collapse each column downward into holes. Returns the moves for animation. */
export function applyGravity(board) {
  const moves = [];
  const { rows, cols, tiles } = board;
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (tiles[r][c]) {
        if (r !== write) { tiles[write][c] = tiles[r][c]; tiles[r][c] = null; moves.push({ from: [r, c], to: [write, c] }); }
        write--;
      }
    }
  }
  return moves;
}

/** Spawn new random tiles into the remaining holes (top of each column). */
export function refill(board) {
  const spawns = [];
  const { rows, cols, tiles } = board;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!tiles[r][c]) { const type = (board.rng() * board.types) | 0; tiles[r][c] = { type, special: null }; spawns.push({ at: [r, c], type }); }
    }
  }
  return spawns;
}

/** Rearrange existing tiles into a legal, match-free board (dead-board recovery). */
export function reshuffle(board) {
  fillNoMatch(board);
  let guard = 0;
  while (!hasAnyMove(board) && guard++ < 50) fillNoMatch(board);
}

/** Swap two adjacent tiles and resolve to a stable board, returning ordered
 * animation steps, per-type cleared counts, and a score. No-op (ok:false) when
 * the swap makes no match. Specials are handled in a later pass (Task 4). */
export function applySwap(board, r1, c1, r2, c2) {
  if (!legalSwap(board, r1, c1, r2, c2)) return { ok: false, steps: [], cleared: {}, score: 0 };
  const steps = [];
  const cleared = {};
  let score = 0;
  swapCells(board, r1, c1, r2, c2);
  steps.push({ kind: 'swap', a: [r1, c1], b: [r2, c2] });
  let depth = 0;
  while (true) {
    const runs = findRuns(board);
    if (!runs.length) break;
    depth++;
    const key = (r, c) => r * board.cols + c;
    const set = new Set();
    for (const run of runs) for (const [r, c] of run.cells) set.add(key(r, c));
    // (special activation footprints expand `set` here in Task 4)
    const cells = [];
    const counts = {};
    for (const k of set) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      if (t) { cleared[t.type] = (cleared[t.type] || 0) + 1; counts[t.type] = (counts[t.type] || 0) + 1; cells.push([r, c]); board.tiles[r][c] = null; }
    }
    score += cells.length * 10 * depth;
    steps.push({ kind: 'clear', cells, spawns: [], counts });   // spawns filled in Task 4
    steps.push({ kind: 'fall', moves: applyGravity(board) });
    steps.push({ kind: 'refill', spawns: refill(board) });
  }
  if (!hasAnyMove(board)) { reshuffle(board); steps.push({ kind: 'reshuffle' }); }
  return { ok: true, steps, cleared, score };
}
