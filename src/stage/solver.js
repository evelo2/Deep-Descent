// Sound conservative reachability solver for PCG platformer rooms. Pure/
// canvas-free/Node-testable — no imports from stage.js/config.js on purpose,
// so it never drifts out of sync with a specific STAGE tuning constant; the
// movement model below is a deliberately CONSERVATIVE approximation of the
// real physics in src/stage/stage.js, hand-tuned against it (see
// tests/stage/solver.test.mjs and tests/stage/traversal.test.mjs).
//
// SOUNDNESS CONTRACT: if solvable(rows).ok is true, the room is truly
// beatable by the real Stage physics. We only ever add a graph edge when
// we're sure the real physics supports the corresponding move; when unsure,
// we omit it (a false negative — over-conservative — is acceptable; a false
// positive is not).
//
// Movement model (tile graph, BFS from spawn):
//  - STANDABLE(c,r): tile (c,r) is not solid '#' and not spike '^', AND the
//    tile directly below (c,r+1) is solid '#' or ladder 'H' (ladder tops are
//    one-way walkable platforms, matching the shipped physics).
//  - WALK: standable (c,r) -> (c±1,r) if that tile isn't solid or spike, and
//    is itself standable (a level deck step).
//  - MOUNT: standable (c,r) -> (c±1,r) if that tile is a ladder 'H' (you can
//    grab a ladder from the side even where the rung itself isn't otherwise
//    "standable", i.e. mid-shaft).
//  - LADDER: a ladder cell (c,r) climbs to vertically-adjacent ladder cells
//    (c,r-1)/(c,r+1); it also DISMOUNTs sideways onto an adjacent standable
//    deck cell (c±1,r).
//  - FALL: walking off an edge into a non-solid, non-standable, non-spike
//    cell falls straight down that column to the first standable cell;
//    landing on a spike, or falling past the bottom row (pit), is DEATH —
//    no edge is added for that move.
//  - JUMP: standable (c,r) -> standable (c±dc, r-du) for dc in 1..3 tiles,
//    du in 0..2 tiles (capped conservatively below the true jump arc from
//    STAGE.jump/gravity/walk — apex ~3 tiles, ~5 tiles across — specifically
//    so we UNDER-approximate), only if the straight bounding rectangle
//    between start and target contains no solid tile.
//
// A room is solvable iff the exit '>' cell is reached AND (if a cache '$'
// exists) the cache cell is reached, starting a BFS from the spawn 'S' cell.

const JUMP_ACROSS = 3;   // tiles, conservative cap (< the true ~5 tile reach)
const JUMP_UP = 2;       // tiles, conservative cap (< the true ~3 tile apex)

export function solvable(rows) {
  const ROWS = rows.length;
  const COLS = rows[0] ? rows[0].length : 0;

  const glyphAt = (c, r) => {
    if (r < 0) return '#';                 // ceiling — solid
    if (r >= ROWS) return '.';             // below the bottom row — open pit
    if (c < 0 || c >= COLS) return '#';    // side walls — solid
    return rows[r][c];
  };
  const isSolid = (c, r) => glyphAt(c, r) === '#';
  const isSpike = (c, r) => glyphAt(c, r) === '^';
  const isLadder = (c, r) => glyphAt(c, r) === 'H';
  const supportBelow = (c, r) => {
    const g = glyphAt(c, r + 1);
    return g === '#' || g === 'H';
  };
  const standable = (c, r) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const g = glyphAt(c, r);
    if (g === '#' || g === '^') return false;
    return supportBelow(c, r);
  };

  // Fall straight down column c from row rStart (exclusive of the cell the
  // body left, inclusive of rStart itself — the body starts unsupported at
  // (c, rStart)). Returns the landing row, or null on death (spike/pit) or
  // an unexpected solid (shouldn't happen given the standable scan below,
  // but guarded for safety — no edge rather than a wrong one).
  const fallLanding = (c, rStart) => {
    for (let r = rStart; r < ROWS; r++) {
      if (isSolid(c, r)) return null;
      if (isSpike(c, r)) return null;
      if (standable(c, r)) return r;
    }
    return null; // fell past the floor — pit
  };

  const clearPath = (c, r, c2, r2) => {
    const rowLo = Math.min(r, r2), rowHi = Math.max(r, r2);
    const colLo = Math.min(c, c2), colHi = Math.max(c, c2);
    for (let rr = rowLo; rr <= rowHi; rr++) {
      for (let cc = colLo; cc <= colHi; cc++) {
        if (rr === r && cc === c) continue;
        if (rr === r2 && cc === c2) continue;
        if (isSolid(cc, rr)) return false;
      }
    }
    return true;
  };

  function* neighbors(c, r) {
    const standHere = standable(c, r);
    const ladderHere = isLadder(c, r);

    if (standHere) {
      // WALK / FALL
      for (const dc of [-1, 1]) {
        const c2 = c + dc;
        if (isSolid(c2, r)) continue;
        if (isSpike(c2, r)) continue;
        if (standable(c2, r)) { yield [c2, r]; continue; }
        const land = fallLanding(c2, r);
        if (land != null) yield [c2, land];
      }
      // MOUNT (grab an adjacent ladder column from the side)
      for (const dc of [-1, 1]) {
        const c2 = c + dc;
        if (isLadder(c2, r)) yield [c2, r];
      }
      // JUMP (conservative arc)
      for (let dc = 1; dc <= JUMP_ACROSS; dc++) {
        for (let du = 0; du <= JUMP_UP; du++) {
          if (dc === 0 && du === 0) continue;
          for (const sign of [-1, 1]) {
            const c2 = c + sign * dc, r2 = r - du;
            if (!standable(c2, r2)) continue;
            if (!clearPath(c, r, c2, r2)) continue;
            yield [c2, r2];
          }
        }
      }
    }

    if (ladderHere) {
      if (isLadder(c, r - 1)) yield [c, r - 1];
      if (isLadder(c, r + 1)) yield [c, r + 1];
      for (const dc of [-1, 1]) {
        const c2 = c + dc;
        if (standable(c2, r)) yield [c2, r];
      }
    }
  }

  // Locate S / > / $.
  let start = null, exit = null, cache = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = rows[r][c];
      if (g === 'S') start = [c, r];
      else if (g === '>') exit = [c, r];
      else if (g === '$') cache = [c, r];
    }
  }
  if (!start) return { reachExit: false, reachCache: false, ok: false };

  // The body occupies wherever it lands at rest. If the spawn cell isn't
  // itself a standing/ladder position (shouldn't happen in real rooms, but
  // a generated/broken room might float S), resolve its immediate fall.
  let startNode = start;
  if (!standable(start[0], start[1]) && !isLadder(start[0], start[1])) {
    const land = fallLanding(start[0], start[1]);
    if (land == null) return { reachExit: false, reachCache: false, ok: false };
    startNode = [start[0], land];
  }

  const key = (c, r) => `${c},${r}`;
  const visited = new Set([key(startNode[0], startNode[1])]);
  const queue = [startNode];
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [c2, r2] of neighbors(c, r)) {
      const k = key(c2, r2);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push([c2, r2]);
    }
  }

  const reachExit = exit ? visited.has(key(exit[0], exit[1])) : false;
  const reachCache = cache ? visited.has(key(cache[0], cache[1])) : false;
  const ok = reachExit && (!cache || reachCache);
  return { reachExit, reachCache, ok };
}
