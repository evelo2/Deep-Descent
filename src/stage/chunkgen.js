// Procedural room generator for platformer stages. Pure/canvas-free/
// Node-testable — no imports from stage.js/config.js on purpose (mirrors
// solver.js's isolation contract), no Math.random/Date.now: everything flows
// from an injected/seeded RNG so generation is fully reproducible.
//
// Every generated room is built on the "ladder-descent" skeleton the 8
// shipped rooms (src/stage/themes.js SHIP/LAIR) use: a spawn deck near the
// top, a single continuous ladder spine running down to row 18, and an exit
// on row 18 reachable by walking the floor from the spine's base. That
// skeleton alone is always solvable (climb down, walk right) — see
// src/stage/solver.js for the reachability model this must satisfy. Variety
// (side ledges, a decorative switchback ladder, spikes, movers) is layered
// on top WITHOUT ever touching the guaranteed spine column(s) or the
// spine-base -> exit floor walk, so it can never regress solvability.

const ROWS = 20;
const COLS = 30;

// --- deterministic seeded RNG (mulberry32) --------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, lo, hi) { // inclusive
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function chance(rng, p) {
  return rng() < p;
}
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- room generation --------------------------------------------------
export function generateRoom(opts = {}) {
  const rng = opts.rng || mulberry32(1);
  const difficulty = opts.difficulty || 1;
  const hasCache = !!opts.hasCache;

  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const setC = (r, c, ch) => { grid[r][c] = ch; };
  const fillRow = (r, c0, c1, ch) => { for (let c = c0; c <= c1; c++) grid[r][c] = ch; };
  const isFree = (r, c) => grid[r][c] === '.';
  const rectFree = (r, c0, c1) => {
    for (let c = c0; c <= c1; c++) if (!isFree(r, c)) return false;
    return true;
  };

  // --- floor: row 19 entirely solid ---
  fillRow(19, 0, COLS - 1, '#');

  // --- spawn + spawn deck ---
  const spawnRow = chance(rng, 0.5) ? 2 : 3;
  const deckRow = spawnRow + 1;
  const deckWidth = randInt(rng, 3, 4);
  const deckStart = randInt(rng, 0, 2);
  const deckEnd = deckStart + deckWidth - 1;
  const spawnCol = Math.min(deckStart + 1, deckEnd);

  fillRow(deckRow, deckStart, deckEnd, '#');
  setC(spawnRow, spawnCol, 'S');

  // --- primary ladder spine: single continuous H column, spawnRow..18 ---
  // Top rung sits one row above the deck it serves (spawnRow is one above
  // deckRow); the column stays clear of solids/hazards end-to-end so it is
  // always climbable to the floor.
  const lc = deckEnd + 1;
  for (let r = spawnRow; r <= 18; r++) setC(r, lc, 'H');

  // Columns that must never be touched by decoration (the guaranteed spine
  // and, if present, the decorative switchback spine).
  const protectedCols = new Set([lc]);

  // --- optional switchback: a second, decorative ladder segment + deck,
  // mirroring the shipped rooms' switchback flavor. Purely additive — the
  // primary spine above already guarantees solvability, so this never needs
  // to be reachable itself, but we build it as a genuine connected path
  // (rMid-1 top rung, deck at rMid with an H gap for the pass-through, spine
  // continuing to the floor) so it reads as a real second route. ---
  let lc2 = null;
  let rMid = null;
  if (difficulty >= 2 && chance(rng, 0.6)) {
    const candidateRMid = randInt(rng, deckRow + 3, 10);
    const candidateLc2 = lc + randInt(rng, 5, 8);
    if (candidateLc2 <= COLS - 6 && candidateRMid - 1 > deckRow) {
      rMid = candidateRMid;
      lc2 = candidateLc2;
      for (let r = rMid - 1; r <= 18; r++) setC(r, lc2, 'H');
      fillRow(rMid, lc + 1, lc2 - 1, '#');
      protectedCols.add(lc2);
    }
  }

  // --- exit: row 18, right of the spine(s), floor (row 19) solid beneath ---
  const spineMax = Math.max(lc, lc2 || 0);
  const minExitCol = Math.min(spineMax + 4, COLS - 4);
  const exitCol = randInt(rng, minExitCol, COLS - 2);
  setC(18, exitCol, '>');

  // --- cache: row 18, strictly between the spine and the exit ---
  let cacheCol = null;
  if (hasCache) {
    const lo = lc + 2;
    const hi = exitCol - 2;
    if (hi >= lo) {
      let candidate = randInt(rng, lo, hi);
      if (candidate === lc2) {
        candidate = candidate - 1 >= lo ? candidate - 1 : candidate + 1;
      }
      if (candidate !== lc2 && candidate >= lo && candidate <= hi) cacheCol = candidate;
    }
    if (cacheCol == null && lc + 1 < exitCol && lc + 1 !== lc2) cacheCol = lc + 1;
    if (cacheCol != null) setC(18, cacheCol, '$');
  }

  // The entire spine-base -> exit floor walk (row 18, [lc, exitCol]) must
  // stay free of solids/spikes/movers. Nothing below writes into this span
  // (ledges live on rows 1..17, floor spikes are placed outside this span),
  // but we guard it explicitly via a reserved-row check helper for safety.
  const walkLo = Math.min(lc, exitCol);
  const walkHi = Math.max(lc, exitCol);
  const onWalk = (r, c) => r === 18 && c >= walkLo && c <= walkHi;

  // --- side decks / ledges: variety, never touching a spine column ---
  const excludedRows = new Set([0, spawnRow, deckRow, 18, 19]);
  if (rMid != null) { excludedRows.add(rMid); excludedRows.add(rMid - 1); }
  const rowPool = [];
  for (let r = 1; r <= 17; r++) if (!excludedRows.has(r)) rowPool.push(r);
  const shuffledRows = shuffle(rng, rowPool);

  const ledgeCountByDifficulty = { 1: [2, 3], 2: [3, 4], 3: [4, 5] };
  const [lgLo, lgHi] = ledgeCountByDifficulty[difficulty] || ledgeCountByDifficulty[1];
  const ledgeCount = Math.min(randInt(rng, lgLo, lgHi), shuffledRows.length);

  const rightBandLo = spineMax + 3;
  const ledges = [];
  const usedRows = new Set();

  for (let i = 0; i < shuffledRows.length && ledges.length < ledgeCount; i++) {
    const row = shuffledRows[i];
    // keep >=1 row of clearance from every other ledge so one ledge's deck
    // never overwrites another ledge's loot (or vice versa)
    if (usedRows.has(row - 1) || usedRows.has(row) || usedRows.has(row + 1)) continue;
    const width = randInt(rng, 3, 6);
    const rightBandHi = COLS - width - 1;
    if (rightBandHi < rightBandLo) continue;
    const colStart = randInt(rng, rightBandLo, rightBandHi);
    const colEnd = colStart + width - 1;
    // never touch a protected (spine) column, and never overlap prior content
    let touchesSpine = false;
    for (const pc of protectedCols) if (pc >= colStart && pc <= colEnd) touchesSpine = true;
    if (touchesSpine) continue;
    if (!rectFree(row, colStart, colEnd)) continue;
    if (row - 1 >= 0 && !rectFree(row - 1, colStart, colEnd)) continue; // keep the space above clear

    fillRow(row, colStart, colEnd, '#');
    const lootCol = colStart + Math.floor(width / 2);
    setC(row - 1, lootCol, 'o');
    ledges.push({ row, colStart, colEnd, width, lootCol });
    usedRows.add(row);
  }

  // --- spikes (difficulty >= 2): floor spikes off the required walk, and/or
  // spikes on ledge edges (ledges are never on the required path) ---
  if (difficulty >= 2) {
    if (chance(rng, 0.5)) {
      const lo = 0, hi = walkLo - 2;
      if (hi >= lo) {
        const spikeCount = randInt(rng, 1, Math.min(3, hi - lo + 1));
        const cols = shuffle(rng, Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)).slice(0, spikeCount);
        for (const c of cols) if (isFree(18, c) && !onWalk(18, c)) setC(18, c, '^');
      }
    }
    for (const ledge of ledges) {
      if (!chance(rng, 0.35)) continue;
      const edgeCol = ledge.colStart === ledge.lootCol ? ledge.colEnd : ledge.colStart;
      if (edgeCol !== ledge.lootCol && grid[ledge.row][edgeCol] === '#') {
        // spike sits on the ledge top (one row above the deck), same as loot's row
        if (grid[ledge.row - 1][edgeCol] === '.') setC(ledge.row - 1, edgeCol, '^');
      }
    }
  }

  // --- movers (difficulty >= 3): wide open decks only, never on the spine
  // or the required exit walk ---
  if (difficulty >= 3) {
    for (const ledge of ledges) {
      if (ledge.width < 4) continue;
      if (!chance(rng, 0.4)) continue;
      const glyph = chance(rng, 0.5) ? 'x' : 'E';
      let moverCol = ledge.colStart;
      if (moverCol === ledge.lootCol) moverCol = ledge.colEnd;
      if (grid[ledge.row - 1][moverCol] === '.') setC(ledge.row - 1, moverCol, glyph);
    }
  }

  return grid.map((row) => row.join(''));
}
