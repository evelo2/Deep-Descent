// @ts-check
// Pure resolution-timeline builder for Salvage Match. No canvas, no timers.
//
// The engine (board.js `applySwap`) resolves a swap synchronously and returns an
// ordered list of discrete `steps` (swap → clear/fall/refill per cascade pass →
// rare reshuffle). That list is enough to REPLAY the resolution as a rich
// animation, but two things are missing from it: the `clear` step omits each
// cleared tile's `type` (and its spawns' types), and no step carries the grid
// *state* between passes. So we re-simulate the steps here against a running grid
// copy, emitting one "beat" per step. Each beat carries a `gridBefore` snapshot
// (the renderer draws from it and interpolates motion) plus per-kind motion data,
// and target-tile clears emit "flyers" that arc into the HUD collect counter.
//
// Pure + deterministic: same (preTiles, steps) ⇒ same timeline. The re-simulated
// `finalGrid` must equal the engine's settled board (the correctness gate in
// anim.test.mjs), which is what lets the module hand the settled board straight
// to the renderer once the animation ends.

/** Per-beat durations (seconds). Small + snappy — a 3-cascade swap resolves in
 * ~1s. Tuned to read as "full cascades, snappy". */
const DUR = { swap: 0.10, clear: 0.15, fall: 0.11, refill: 0.11, reshuffle: 0.14 };

/** How long a collected-tile flyer takes to arc from its cell into the counter. */
export const FLYER_DUR = 0.5;

/** Deep-copy a tile grid (tiles are plain {type,special,axis} or null). */
function cloneGrid(g) {
  return g.map((row) => row.map((t) => (t ? { type: t.type, special: t.special, axis: t.axis } : null)));
}

/**
 * Build the animation timeline for one resolved swap.
 * @param {(any)[][]} preTiles   grid BEFORE the swap (module _snapshot())
 * @param {any[]} steps          ordered steps from applySwap()
 * @param {number} targetTile    the level's objective tile type (drives flyers)
 * @param {(any)[][]} [settledTiles] engine's settled board — closes out a reshuffle
 * @returns {{ beats:any[], flyers:any[], totalDur:number, flyersEndT:number, finalGrid:any[][], targetTile:number }}
 */
export function buildTimeline(preTiles, steps, targetTile, settledTiles) {
  const beats = [];
  const flyers = [];
  let g = cloneGrid(preTiles);
  let at = 0;
  const push = (beat, dur) => { beat.at = at; beat.dur = dur; beats.push(beat); at += dur; return beat; };

  for (const step of steps) {
    if (step.kind === 'swap') {
      const [ar, ac] = step.a, [br, bc] = step.b;
      push({ kind: 'swap', gridBefore: cloneGrid(g), a: step.a, b: step.b }, DUR.swap);
      const tmp = g[ar][ac]; g[ar][ac] = g[br][bc]; g[br][bc] = tmp;   // apply the swap
    } else if (step.kind === 'clear') {
      const gridBefore = cloneGrid(g);                    // post-swap, pre-clear
      // Reconstruct each cleared cell's type from the pre-clear grid; flag target
      // tiles so the renderer can spark them harder and launch a flyer.
      const clears = step.cells.map(([r, c]) => {
        const t = gridBefore[r][c];
        const type = t ? t.type : -1;
        return { r, c, type, target: type === targetTile };
      });
      const beat = push({ kind: 'clear', gridBefore, clears, counts: step.counts || {} }, DUR.clear);
      for (const cl of clears) if (cl.target) flyers.push({ from: [cl.r, cl.c], t0: beat.at + 0.03, type: targetTile });
      // Apply the clear to the running grid, then reconstruct + place any spawns
      // (their type is the run's type = the pre-clear tile sitting at `at`).
      for (const [r, c] of step.cells) g[r][c] = null;
      for (const s of step.spawns || []) {
        const [r, c] = s.at;
        const type = gridBefore[r][c] ? gridBefore[r][c].type : 0;
        g[r][c] = { type, special: s.special, axis: s.special === 'line' ? s.axis : undefined };
      }
    } else if (step.kind === 'fall') {
      const moves = step.moves || [];
      push({ kind: 'fall', gridBefore: cloneGrid(g), moves }, moves.length ? DUR.fall : 0);
      // Replay gravity. A column shift makes `from`/`to` sets overlap (e.g. a
      // full column dropping one row is 2→3,1→2,0→1), so place every moved tile
      // first (read from the pre-fall grid) then null a source ONLY if it isn't
      // itself a destination — the cells that end empty are froms minus tos.
      const after = cloneGrid(g);
      const toSet = new Set(moves.map((m) => m.to[0] * 1000 + m.to[1]));
      for (const m of moves) { const [fr, fc] = m.from, [tr, tc] = m.to; after[tr][tc] = g[fr][fc]; }
      for (const m of moves) { const [fr, fc] = m.from; if (!toSet.has(fr * 1000 + fc)) after[fr][fc] = null; }
      g = after;
    } else if (step.kind === 'refill') {
      const spawns = (step.spawns || []).map((s) => ({ at: s.at, type: s.type }));
      push({ kind: 'refill', gridBefore: cloneGrid(g), spawns }, spawns.length ? DUR.refill : 0);
      for (const s of spawns) { const [r, c] = s.at; g[r][c] = { type: s.type, special: null }; }
    } else if (step.kind === 'reshuffle') {
      // Rare dead-board/adversarial recovery. The step carries no new layout, so
      // flash the old grid and snap to the engine's settled board to stay exact.
      push({ kind: 'reshuffle', gridBefore: cloneGrid(g) }, DUR.reshuffle);
      g = settledTiles ? cloneGrid(settledTiles) : g;
    }
  }

  let flyersEndT = 0;
  for (const f of flyers) flyersEndT = Math.max(flyersEndT, f.t0 + FLYER_DUR);
  return { beats, flyers, totalDur: at, flyersEndT, finalGrid: g, targetTile };
}
