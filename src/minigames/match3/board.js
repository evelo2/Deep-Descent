// @ts-check
// Pure match-3 engine — no canvas, no DOM, no timers. Deterministic via an
// injected rng, so the whole model is Node-unit-testable (like the Stage engine).
// The renderer/module animate the discrete resolution steps this returns.

/** @typedef {{ type:number, special:null|'line'|'bomb'|'chest', axis?:'row'|'col' }} Tile */
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
  if (!adjacent(r1, c1, r2, c2)) return false;
  if (wouldMatch(board, r1, c1, r2, c2)) return true;
  // Swap-to-activate: a special can be swapped with ANY adjacent tile to
  // detonate it on demand, even when the swap makes no run.
  const a = at(board, r1, c1), b = at(board, r2, c2);
  return !!(a && a.special) || !!(b && b.special);
}

/** Any adjacent pair whose swap makes a match — OR any special on the board,
 *  since a special can always be detonated by swapping it. */
export function hasAnyMove(board) {
  const { rows, cols, tiles } = board;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] && tiles[r][c].special) return true;
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

// Cascade-resolution safety cap. Real play (Math.random) never approaches
// this — typical cascades resolve in well under 15 passes. It exists only
// to bound a degenerate/adversarial refill rng that could otherwise
// recreate the same run forever (see the "adversarial rng" test in
// specials.test.mjs, which reproduces an OOM this cap prevents).
const MAX_CASCADE = 100;

/** Fold the board's current tile-type layout into a 32-bit hash (FNV-1a-ish).
 * Pure function of board state — no ambient Date/Math.random input — so the
 * same board always hashes the same way. */
function hashBoard(board) {
  let h = 2166136261 >>> 0;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const t = board.tiles[r][c];
      h = (h ^ (t ? t.type + 1 : 0)) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

/** Tiny local mulberry32-style PRNG seeded from a 32-bit int. Self-contained
 * (no cross-module import) — used only to escape a degenerate `board.rng`
 * during cap-hit recovery below, deterministically. */
function localRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- swap-to-activate seeding ----------------------------------------------
// Add every in-bounds cell within `rad` of (cr,cc) to `set` (a square blast).
function blastRect(board, set, cr, cc, rad) {
  for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const r = cr + dr, c = cc + dc;
    if (r >= 0 && c >= 0 && r < board.rows && c < board.cols) set.add(r * board.cols + c);
  }
}
// Add a cross of full rows/cols within `w` of (cr,cc) — w=0 is a thin cross,
// w=1 a 3-wide "fat" cross.
function blastCross(board, set, cr, cc, w) {
  for (let d = -w; d <= w; d++) {
    const rr = cr + d, cc2 = cc + d;
    if (rr >= 0 && rr < board.rows) for (let c = 0; c < board.cols; c++) set.add(rr * board.cols + c);
    if (cc2 >= 0 && cc2 < board.cols) for (let r = 0; r < board.rows; r++) set.add(r * board.cols + cc2);
  }
}
/** Cells to force-clear on the first resolution pass when a special was just
 *  swapped (reads the two cells POST-swap). A single special seeds its own cell
 *  (the cascade's activation block expands it: line→row/col, bomb→3x3,
 *  chest→5x5). Two specials swapped together seed an enhanced COMBO region,
 *  centred on the landing cell (r2,c2): chest→7x7 giant, bomb+bomb→5x5,
 *  line+bomb→fat cross, line+line→full cross. Their individual activations also
 *  fire (union), so chest/bomb detonations stay counted. */
function seedSwapActivation(board, r1, c1, r2, c2) {
  const set = new Set();
  const key = (r, c) => r * board.cols + c;
  const a = board.tiles[r1][c1], b = board.tiles[r2][c2];
  const aSp = a && a.special, bSp = b && b.special;
  if (!aSp && !bSp) return set;
  if (aSp && bSp) {
    const kinds = new Set([a.special, b.special]);
    if (kinds.has('chest')) blastRect(board, set, r2, c2, 3);                       // giant 7x7
    else if (a.special === 'bomb' && b.special === 'bomb') blastRect(board, set, r2, c2, 2);   // 5x5
    else if (kinds.has('bomb') && kinds.has('line')) blastCross(board, set, r2, c2, 1);        // fat cross
    else { blastCross(board, set, r1, c1, 0); blastCross(board, set, r2, c2, 0); }             // line+line → full cross
    set.add(key(r1, c1)); set.add(key(r2, c2));
  } else {
    if (aSp) set.add(key(r1, c1));
    if (bSp) set.add(key(r2, c2));
  }
  return set;
}

/** Swap two adjacent tiles and resolve to a stable board, returning ordered
 * animation steps, per-type cleared counts, and a score. No-op (ok:false) when
 * the swap makes no match. A run of len>=4 spawns a `line` special, len>=5
 * spawns a `bomb`, placed at the swapped-into cell on the first resolution
 * pass (else the run's middle cell). A cleared cell whose `special` is set
 * activates before clearing: `line` adds its full row (if its axis is the
 * horizontal 'row' axis) or its full column ('col' axis) — orientation
 * only, matching the spawning run's axis; `bomb` adds its 3x3 neighborhood.
 * Both expand the cleared set (chained cascades). */
export function applySwap(board, r1, c1, r2, c2) {
  if (!legalSwap(board, r1, c1, r2, c2)) return { ok: false, steps: [], cleared: {}, score: 0, chests: 0 };
  const steps = [];
  const cleared = {};
  let score = 0;
  let chests = 0;   // chest specials that detonated (drives bonus salvage + jingle)
  let blasts = 0;   // bomb OR chest detonations (drives the boom sound)
  swapCells(board, r1, c1, r2, c2);
  steps.push({ kind: 'swap', a: [r1, c1], b: [r2, c2] });
  let depth = 0;
  const swapCellsSet = new Set([r1 * board.cols + c1, r2 * board.cols + c2]);
  // Swap-to-activate: cells the swapped special(s) detonate on the first pass,
  // even when the swap made no run. Consumed once (pass 1), then null.
  let pending = seedSwapActivation(board, r1, c1, r2, c2);
  while (true) {
    const runs = findRuns(board);
    const inject = pending; pending = null;
    if (!runs.length && !(inject && inject.size)) break;
    if (depth >= MAX_CASCADE) {
      // Degenerate/adversarial rng kept recreating a run every pass. The
      // injected rng itself is the pathology, so reshuffling with that same
      // rng can't reliably escape it (e.g. a truly constant rng forces
      // every refill to the same type, which a same-rng reshuffle would
      // just reproduce). Recover with a rng seeded deterministically from
      // the current board layout (hashBoard + localRng, both pure/local —
      // no Math.random, no cross-module import) instead: it has the value
      // variety fillNoMatch needs to settle run-free, and — because it's a
      // pure function of board state — the recovery is itself reproducible
      // (same board ⇒ same escape sequence ⇒ same stable board), keeping
      // the module's "deterministic via injected rng" contract intact even
      // on this exceptional path. applySwap must always return a stable
      // board, never spin forever.
      const badRng = board.rng;
      board.rng = localRng(hashBoard(board));
      reshuffle(board);
      board.rng = badRng;
      steps.push({ kind: 'reshuffle' });
      break;
    }
    depth++;
    const key = (r, c) => r * board.cols + c;
    const set = new Set();
    if (inject) for (const k of inject) set.add(k);
    for (const run of runs) for (const [r, c] of run.cells) set.add(key(r, c));

    // activate specials caught in the cleared set (one level of expansion)
    for (const k of Array.from(set)) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      if (!t || !t.special) continue;
      if (t.special === 'line') {
        // axis === run's spawning axis: 'row' (horizontal run) clears the
        // full row it sits in; 'col' (vertical run) clears the full column.
        // Orientation-only — never both (spec §3.4).
        if (t.axis === 'col') { for (let y = 0; y < board.rows; y++) set.add(key(y, c)); }
        else { for (let x = 0; x < board.cols; x++) set.add(key(r, x)); }
      } else if (t.special === 'bomb') {
        blasts++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const rr = r + dy, cc = c + dx;
          if (rr >= 0 && cc >= 0 && rr < board.rows && cc < board.cols) set.add(key(rr, cc));
        }
      } else if (t.special === 'chest') {
        chests++; blasts++;   // bonus salvage + jingle in the module
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const rr = r + dy, cc = c + dx;
          if (rr >= 0 && cc >= 0 && rr < board.rows && cc < board.cols) set.add(key(rr, cc));
        }
      }
    }

    // decide special spawns (before clearing).
    const spawns = [];
    // Treasure Chest: any cell shared by a horizontal run and a vertical run
    // (a T / L / + intersection). Collect each axis's cells, then intersect.
    const rowCells = new Set(), colCells = new Set();
    for (const run of runs) {
      const s = run.axis === 'row' ? rowCells : colCells;
      for (const [r, c] of run.cells) s.add(key(r, c));
    }
    const chestCells = new Set();
    for (const k of rowCells) if (colCells.has(k)) chestCells.add(k);
    for (const k of chestCells) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      spawns.push({ at: [r, c], special: 'chest', type: t ? t.type : runs[0].type });
    }
    // Straight-line specials from runs of length ≥4 — but never on a cell a
    // chest already claimed (the intersection); the chest wins that pivot.
    for (const run of runs) {
      if (run.len < 4) continue;
      const special = run.len >= 5 ? 'bomb' : 'line';
      // prefer a swapped cell on the first pass, else the run's middle
      let at = run.cells.find(([r, c]) => swapCellsSet.has(key(r, c))) || run.cells[Math.floor(run.cells.length / 2)];
      if (chestCells.has(key(at[0], at[1]))) continue;
      spawns.push({ at, special, axis: run.axis, type: run.type });
    }

    // clear the set
    const cells = [];
    const counts = {};
    for (const k of set) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      if (t) { cleared[t.type] = (cleared[t.type] || 0) + 1; counts[t.type] = (counts[t.type] || 0) + 1; cells.push([r, c]); board.tiles[r][c] = null; }
    }
    score += cells.length * 10 * depth;

    // place spawned specials into their (now-empty) cells
    for (const s of spawns) {
      const [r, c] = s.at;
      board.tiles[r][c] = { type: s.type, special: s.special, axis: s.special === 'line' ? s.axis : undefined };
    }

    steps.push({ kind: 'clear', cells, spawns: spawns.map(({ at, special, axis }) => ({ at, special, axis })), counts });
    steps.push({ kind: 'fall', moves: applyGravity(board) });
    steps.push({ kind: 'refill', spawns: refill(board) });
    swapCellsSet.clear();   // only the first pass uses swap-cell preference
  }
  if (!hasAnyMove(board)) { reshuffle(board); steps.push({ kind: 'reshuffle' }); }
  score += chests * 200;   // treasure-chest detonation bonus
  return { ok: true, steps, cleared, score, chests, blasts };
}
