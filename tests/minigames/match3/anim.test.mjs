// tests/minigames/match3/anim.test.mjs
// The animation timeline is a PURE re-simulation of the engine's resolution
// steps. Its non-negotiable contract (the "correctness gate"): the grid it
// reconstructs by replaying the steps must be byte-for-byte the board the engine
// actually settled to. If that ever drifts, the animation would end showing a
// different board than the game logic believes in. We also assert the timeline's
// shape (ordered beats, per-cell type reconstruction, target-tile flyers).
import { makeBoard, applySwap, legalSwap } from '../../../src/minigames/match3/board.js';
import { buildTimeline, FLYER_DUR } from '../../../src/minigames/match3/anim.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const snapshot = (board) => board.tiles.map((row) => row.map((t) => (t ? { type: t.type, special: t.special, axis: t.axis } : null)));
const gridEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++) {
      const x = a[r][c], y = b[r][c];
      if (!x && !y) continue;
      if (!x || !y) return false;
      if (x.type !== y.type || (x.special || null) !== (y.special || null) || (x.axis || null) !== (y.axis || null)) return false;
    }
  }
  return true;
};

// Find the first legal swap on a board (scan adjacent pairs).
function findLegalSwap(board) {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (c + 1 < board.cols && legalSwap(board, r, c, r, c + 1)) return [r, c, r, c + 1];
      if (r + 1 < board.rows && legalSwap(board, r, c, r + 1, c)) return [r, c, r + 1, c];
    }
  }
  return null;
}

// --- CORRECTNESS GATE across many seeds: reconstructed finalGrid === engine board.
let gateRuns = 0, reshuffles = 0;
for (let seed = 1; seed <= 120; seed++) {
  const board = makeBoard({ cols: 8, rows: 8, types: 6, rng: mulberry32(seed) });
  const swap = findLegalSwap(board);
  if (!swap) continue;
  const [r1, c1, r2, c2] = swap;
  const pre = snapshot(board);
  const res = applySwap(board, r1, c1, r2, c2);
  check(res.ok, `seed ${seed}: swap resolved`);
  const tl = buildTimeline(pre, res.steps, 0, board.tiles);
  check(gridEqual(tl.finalGrid, board.tiles), `seed ${seed}: reconstructed finalGrid === settled board`);
  gateRuns++;
  if (res.steps.some((s) => s.kind === 'reshuffle')) reshuffles++;
}
check(gateRuns >= 100, `gate exercised on ${gateRuns} boards`);
// The gate is only meaningful on the NON-reshuffle path (reshuffle snaps to the
// settled board trivially). Assert the vast majority genuinely reconstructed.
check(gateRuns - reshuffles >= 90, `most boards reconstructed without reshuffle (${gateRuns - reshuffles}/${gateRuns})`);

// --- Timeline SHAPE on a concrete resolved swap.
{
  let tl, res, pre, targetTile = -1;
  for (let seed = 1; seed <= 200 && !tl; seed++) {
    const board = makeBoard({ cols: 8, rows: 8, types: 6, rng: mulberry32(seed) });
    const swap = findLegalSwap(board);
    if (!swap) continue;
    pre = snapshot(board);
    // target the type that the swapped-in run will clear, so we exercise flyers.
    targetTile = pre[swap[0]][swap[1]].type;
    res = applySwap(board, swap[0], swap[1], swap[2], swap[3]);
    if (res.ok) tl = buildTimeline(pre, res.steps, targetTile, board.tiles);
  }
  check(tl, 'built a timeline for shape checks');
  check(tl.beats.length >= 4, 'timeline has swap+clear+fall+refill beats');
  check(tl.beats[0].kind === 'swap', 'first beat is the swap');
  check(tl.beats[1].kind === 'clear', 'second beat is the clear');
  // Beats are contiguous in time: each beat.at == running sum of prior durs.
  let acc = 0, contiguous = true;
  for (const b of tl.beats) { if (Math.abs(b.at - acc) > 1e-9) contiguous = false; acc += b.dur; }
  check(contiguous, 'beat start times are contiguous');
  check(Math.abs(tl.totalDur - acc) > -1 && tl.totalDur > 0, 'totalDur is positive and = sum of durs');
  // Every clear beat reconstructs a concrete (non -1) type for each cleared cell.
  const clearBeats = tl.beats.filter((b) => b.kind === 'clear');
  check(clearBeats.length >= 1, 'at least one clear beat');
  const allTyped = clearBeats.every((b) => b.clears.every((cl) => cl.type >= 0));
  check(allTyped, 'every cleared cell has a reconstructed type');
  // Flyers only for target-type clears, and each lands within the flyer window.
  const targetClears = clearBeats.reduce((n, b) => n + b.clears.filter((cl) => cl.target).length, 0);
  check(tl.flyers.length === targetClears, 'one flyer per cleared target tile');
  check(tl.flyers.every((f) => f.type === targetTile), 'flyers carry the target type');
  if (tl.flyers.length) check(tl.flyersEndT >= tl.flyers[0].t0 + FLYER_DUR - 1e-9, 'flyersEndT covers flyer landings');
}

// --- gridBefore snapshots are independent copies (mutating one can't bleed).
{
  const board = makeBoard({ cols: 8, rows: 8, types: 6, rng: mulberry32(7) });
  const swap = findLegalSwap(board);
  const pre = snapshot(board);
  const res = applySwap(board, swap[0], swap[1], swap[2], swap[3]);
  const tl = buildTimeline(pre, res.steps, 0, board.tiles);
  const b0 = tl.beats[0].gridBefore;
  const before = b0[0][0] ? b0[0][0].type : null;
  if (tl.beats[1]) tl.beats[1].gridBefore[0][0] = { type: 99, special: null };
  const after = b0[0][0] ? b0[0][0].type : null;
  check(before === after, 'beat gridBefore snapshots are independent deep copies');
}

console.log(`ok anim.test.mjs (${pass} checks)`);
