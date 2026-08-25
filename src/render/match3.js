// @ts-check
// Canvas renderer for Salvage Match (Platform Phase 9). A pure draw from the
// module state — browser-tuned, not unit-tested. The engine resolves each swap
// synchronously (mod.board holds the settled result), but while mod.anim is
// live the renderer replays a short resolution: the two tiles slide together,
// then the matched run pops (shrinks + sparkles). Once anim clears, it draws
// the settled board straight.
import { PAL } from '../config.js';
import { text, panel } from './chrome.js';
import { TILE_NAMES } from '../minigames/match3/levels.js';
import { FLYER_DUR } from '../minigames/match3/anim.js';

// Board geometry: a centered square grid sized to the live viewport.
function geom(mod, host) {
  const { W, H } = host.viewport;
  const n = mod.board ? mod.board.cols : 8;
  const size = Math.min(W, H) * 0.72;
  const cell = Math.floor(size / n);
  const x0 = Math.round((W - cell * n) / 2);
  const y0 = Math.round((H - cell * n) / 2) + 20;
  return { cell, x0, y0, n };
}

// pearl · gem · coin · shell · starfish · coral
const TILE_COLORS = ['#eaf6ff', '#61dcff', '#ffcf5c', '#ff8f6b', '#ffe08a', '#b98cff'];

// Top-right ✕ quit button (logical units). Single source of geometry, shared by
// the draw + the pointer hit-test so touch users (no Esc key) can bail out.
function quitRect(host) {
  const { W } = host.viewport;
  return { x: W - 44, y: 16, w: 28, h: 28 };
}

/** True if a logical point lands on the ✕ quit button. */
export function backHitTest(mod, host, x, y) {
  const q = quitRect(host);
  return x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h;
}

/**
 * Map a logical playfield point to a board cell, or null if outside the grid.
 * @returns {{r:number,c:number}|null}
 */
export function boardHitTest(mod, host, x, y) {
  if (!mod.board) return null;
  const { cell, x0, y0, n } = geom(mod, host);
  const c = Math.floor((x - x0) / cell), r = Math.floor((y - y0) / cell);
  if (r < 0 || c < 0 || r >= n || c >= n) return null;
  return { r, c };
}

// A regular star path (used by the starfish icon and as a shape helper).
function starPath(ctx, cx, cy, points, outer, inner, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// Draw one tile as a distinct, canvas-drawn icon keyed by its type
// (0 pearl · 1 gem · 2 coin · 3 shell · 4 starfish · 5 coral), then overlay
// any special marker. No image assets — pure paths so it scales with the cell.
function drawTile(ctx, cx, cy, cell, tile) {
  if (!tile) return;
  const r = cell * 0.36;
  const base = TILE_COLORS[tile.type] || '#fff';
  ctx.save();
  // soft drop shadow so tiles read as objects, not flat dots
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = cell * 0.08; ctx.shadowOffsetY = cell * 0.03;

  switch (tile.type) {
    case 0: { // Pearl — pearlescent sphere with a specular highlight
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, base); g.addColorStop(1, '#9fb8cc');
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      break;
    }
    case 1: { // Gem — faceted diamond with a bright top facet
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.92, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.92, cy);
      ctx.closePath(); ctx.fillStyle = base; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.92, cy); ctx.lineTo(cx, cy); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
      break;
    }
    case 2: { // Coin — gold disc with a milled rim and inner ring
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = base; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,80,10,0.6)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      break;
    }
    case 3: { // Shell — scallop fan with radiating ridges
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.35, r, Math.PI * 1.15, Math.PI * 1.85); ctx.lineTo(cx, cy + r * 0.35);
      ctx.closePath(); ctx.fillStyle = base; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(120,50,30,0.5)'; ctx.lineWidth = 1.4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.35);
        ctx.lineTo(cx + Math.sin(i * 0.42) * r * 0.95, cy + r * 0.35 - Math.cos(i * 0.42) * r * 0.95); ctx.stroke();
      }
      break;
    }
    case 4: { // Starfish — five-armed star
      starPath(ctx, cx, cy, 5, r, r * 0.45);
      ctx.fillStyle = base; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(150,110,20,0.6)'; ctx.stroke();
      break;
    }
    default: { // Coral — branching stalks
      ctx.strokeStyle = base; ctx.lineWidth = cell * 0.12; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + r); ctx.lineTo(cx, cy - r * 0.2);
      ctx.moveTo(cx, cy + r * 0.2); ctx.lineTo(cx - r * 0.75, cy - r * 0.7);
      ctx.moveTo(cx, cy + r * 0.2); ctx.lineTo(cx + r * 0.75, cy - r * 0.7);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = base;
      for (const [dx, dy] of [[0, -0.2], [-0.75, -0.7], [0.75, -0.7]]) {
        ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r, cell * 0.07, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();

  if (tile.special) drawSpecialMarker(ctx, cx, cy, cell, r, tile);
}

// Overlay that marks a tile as a special. line = a glowing directional bar
// (oriented by its axis), bomb = a spiked naval mine, chest = a golden treasure
// chest. Drawn over the type icon so the tile keeps its colour identity.
function drawSpecialMarker(ctx, cx, cy, cell, r, tile) {
  ctx.save();
  if (tile.special === 'line') {
    const horiz = tile.axis !== 'col';                 // 'row'(default)→horizontal bar
    ctx.shadowColor = '#8ff0ff'; ctx.shadowBlur = cell * 0.3;
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = cell * 0.09; ctx.lineCap = 'round';
    ctx.beginPath();
    if (horiz) { ctx.moveTo(cx - r * 1.05, cy); ctx.lineTo(cx + r * 1.05, cy); }
    else { ctx.moveTo(cx, cy - r * 1.05); ctx.lineTo(cx, cy + r * 1.05); }
    ctx.stroke();
    // arrow heads to read as "clears a line"
    ctx.lineWidth = cell * 0.05;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      if (horiz) { ctx.moveTo(cx + s * r * 1.05, cy); ctx.lineTo(cx + s * r * 0.7, cy - r * 0.3); ctx.moveTo(cx + s * r * 1.05, cy); ctx.lineTo(cx + s * r * 0.7, cy + r * 0.3); }
      else { ctx.moveTo(cx, cy + s * r * 1.05); ctx.lineTo(cx - r * 0.3, cy + s * r * 0.7); ctx.moveTo(cx, cy + s * r * 1.05); ctx.lineTo(cx + r * 0.3, cy + s * r * 0.7); }
      ctx.stroke();
    }
  } else if (tile.special === 'bomb') {
    ctx.shadowColor = 'rgba(255,120,60,0.8)'; ctx.shadowBlur = cell * 0.25;
    ctx.fillStyle = '#1c2733';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#39506a'; ctx.lineWidth = cell * 0.05; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,220,180,0.9)';
    ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.22, r * 0.14, 0, Math.PI * 2); ctx.fill();
  } else if (tile.special === 'chest') {
    // A golden treasure chest — the star of the show.
    ctx.shadowColor = 'rgba(255,210,90,0.9)'; ctx.shadowBlur = cell * 0.35;
    const w = r * 1.5, h = r * 1.15, x = cx - w / 2, y = cy - h * 0.35;
    // body
    ctx.fillStyle = '#7a4b1e';
    ctx.beginPath(); ctx.roundRect(x, y, w, h * 0.75, cell * 0.04); ctx.fill();
    // lid
    ctx.fillStyle = '#8a5a26';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - h * 0.05); ctx.quadraticCurveTo(cx, y - h * 0.5, x, y - h * 0.05); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    // gold bands + trim
    ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = cell * 0.045;
    ctx.beginPath(); ctx.roundRect(x, y, w, h * 0.75, cell * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    // lock
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(cx, y + h * 0.28, r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a4b1e';
    ctx.beginPath(); ctx.arc(cx, y + h * 0.28, r * 0.06, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// A short expanding-ring sparkle for a popping non-target tile (k: 0→1).
function drawSpark(ctx, cx, cy, cell, k) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, cell * (0.18 + 0.5 * k), 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// A richer "you collected the objective" burst for a popping target tile: a
// golden expanding ring plus radiating shards (k: 0→1 progress).
function drawBurst(ctx, cx, cy, cell, k) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, cell * (0.2 + 0.55 * k), 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + k * 0.6;
    const r0 = cell * (0.2 + 0.3 * k), r1 = cell * (0.35 + 0.62 * k);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

// A big shockwave for a detonating special (bomb/chest). `big` widens it for a
// chest's 5x5 blast. k: 0→1 progress.
function drawDetonation(ctx, cx, cy, cell, k, big) {
  ctx.save();
  const reach = (big ? 2.4 : 1.5) * cell;
  ctx.globalAlpha = Math.max(0, 1 - k);
  // white-hot core flash early on
  if (k < 0.4) { ctx.globalAlpha = (0.4 - k) * 2; ctx.fillStyle = '#fff7e0'; ctx.beginPath(); ctx.arc(cx, cy, cell * (0.3 + k), 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.strokeStyle = big ? '#ffd25a' : '#ff9a5a'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(cx, cy, reach * (0.25 + 0.75 * k), 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5;
  const shards = big ? 10 : 8;
  for (let i = 0; i < shards; i++) {
    const ang = (i / shards) * Math.PI * 2 + k;
    const r0 = reach * (0.2 + 0.3 * k), r1 = reach * (0.4 + 0.7 * k);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

const easeOut = (k) => 1 - (1 - k) * (1 - k);

// An animated backlit halo behind an objective (target-type) tile, so the
// tiles that count toward the level goal glow and read at a glance. Additive
// so it reads as light coming from behind the tile; breathes off mod.clock,
// with a per-tile phase so the board shimmers rather than pulsing in lockstep.
function drawTargetHalo(ctx, cx, cy, cell, clock, phase) {
  const pulse = 0.5 + 0.5 * Math.sin(clock * 3 + phase);
  const hr = cell * (0.5 + 0.14 * pulse);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, hr * 0.15, cx, cy, hr);
  g.addColorStop(0, `rgba(255,240,175,${0.28 + 0.30 * pulse})`);
  g.addColorStop(0.55, `rgba(255,214,110,${0.12 + 0.15 * pulse})`);
  g.addColorStop(1, 'rgba(255,210,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Halo pass over a settled grid: one glow behind every tile whose type is the
// level objective. `grid` is a tiles[][]; skips specials (they have their own
// marker). Draw BEFORE the tiles so the glow sits behind them.
function drawTargetHalos(ctx, grid, targetTile, x0, y0, cell, n, clock) {
  if (targetTile == null || targetTile < 0) return;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const tl = grid[r][c];
    if (tl && tl.type === targetTile && !tl.special)
      drawTargetHalo(ctx, x0 + c * cell + cell / 2, y0 + r * cell + cell / 2, cell, clock, (r * 7 + c * 13) * 0.3);
  }
}

// Replay the resolution beat-by-beat from the timeline (anim = buildTimeline()
// output + a running clock `t`). Each beat draws its own `gridBefore` snapshot
// with per-kind motion: the swap slides the pair together; a clear shrinks +
// sparks the matched run (target tiles get the golden burst); a fall slides
// dropped tiles down; a refill drops fresh tiles in from above the board. Once
// every beat has elapsed (flyers may still be arcing) it draws the settled board.
function drawBeats(ctx, anim, mod, x0, y0, cell, n) {
  const cx = (c) => x0 + c * cell + cell / 2, cy = (r) => y0 + r * cell + cell / 2;
  const t = anim.t;
  if (t >= anim.totalDur) {
    if (mod.level) drawTargetHalos(ctx, mod.board.tiles, mod.level.targetTile, x0, y0, cell, n, mod.clock || 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) drawTile(ctx, cx(c), cy(r), cell, mod.board.tiles[r][c]);
    return;
  }
  let beat = anim.beats[0];
  for (const b of anim.beats) { if (t >= b.at) beat = b; else break; }
  const k = beat.dur > 0 ? Math.min(1, Math.max(0, (t - beat.at) / beat.dur)) : 1;
  const e = easeOut(k);
  const G = beat.gridBefore;

  if (beat.kind === 'swap') {
    const [ar, ac] = beat.a, [br, bc] = beat.b;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if ((r === ar && c === ac) || (r === br && c === bc)) continue;
      drawTile(ctx, cx(c), cy(r), cell, G[r][c]);
    }
    drawTile(ctx, cx(ac) + (cx(bc) - cx(ac)) * e, cy(ar) + (cy(br) - cy(ar)) * e, cell, G[ar][ac]);
    drawTile(ctx, cx(bc) + (cx(ac) - cx(bc)) * e, cy(br) + (cy(ar) - cy(br)) * e, cell, G[br][bc]);
  } else if (beat.kind === 'clear') {
    const clearing = new Set(beat.clears.map((cl) => cl.r * n + cl.c));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (clearing.has(r * n + c)) continue;
      drawTile(ctx, cx(c), cy(r), cell, G[r][c]);
    }
    for (const cl of beat.clears) {
      const s = 1 - k;
      if (s > 0.05) drawTile(ctx, cx(cl.c), cy(cl.r), cell * s, G[cl.r][cl.c]);
      if (cl.target) drawBurst(ctx, cx(cl.c), cy(cl.r), cell, k);
      else drawSpark(ctx, cx(cl.c), cy(cl.r), cell, k);
    }
    // Detonating specials (bomb/chest) throw a big shockwave from their cell.
    for (const cl of beat.clears) {
      const sp = G[cl.r][cl.c] && G[cl.r][cl.c].special;
      if (sp === 'bomb' || sp === 'chest') drawDetonation(ctx, cx(cl.c), cy(cl.r), cell, k, sp === 'chest');
    }
  } else if (beat.kind === 'fall') {
    const moving = new Set(beat.moves.map((m) => m.from[0] * n + m.from[1]));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (moving.has(r * n + c)) continue;
      drawTile(ctx, cx(c), cy(r), cell, G[r][c]);
    }
    for (const m of beat.moves) {
      const [fr, fc] = m.from, [tr] = m.to;
      drawTile(ctx, cx(fc), cy(fr) + (cy(tr) - cy(fr)) * e, cell, G[fr][fc]);
    }
  } else if (beat.kind === 'refill') {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) drawTile(ctx, cx(c), cy(r), cell, G[r][c]);
    for (const s of beat.spawns) {
      const [r, c] = s.at;
      const startY = y0 - cell;                          // drop from just above the board
      ctx.save(); ctx.globalAlpha = Math.min(1, 0.4 + e);
      drawTile(ctx, cx(c), startY + (cy(r) - startY) * e, cell, { type: s.type, special: null });
      ctx.restore();
    }
  } else if (beat.kind === 'reshuffle') {
    ctx.save(); ctx.globalAlpha = 1 - 0.5 * k;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) drawTile(ctx, cx(c), cy(r), cell, G[r][c]);
    ctx.restore();
  }
}

// Draw the collect-flyers arcing from their board cell into the HUD objective
// counter at (tx,ty). Returns how many have already landed (drives the count-up)
// and the most-recent landing time (drives the counter pulse).
function drawFlyers(ctx, anim, x0, y0, cell, tx, ty) {
  const cx = (c) => x0 + c * cell + cell / 2, cy = (r) => y0 + r * cell + cell / 2;
  let landed = 0, lastLand = -1;
  for (const f of anim.flyers) {
    const p = (anim.t - f.t0) / FLYER_DUR;
    if (p < 0) continue;
    if (p >= 1) { landed++; if (f.t0 + FLYER_DUR > lastLand) lastLand = f.t0 + FLYER_DUR; continue; }
    const e = easeOut(p);
    const sx = cx(f.from[1]), sy = cy(f.from[0]);
    const mx = (sx + tx) / 2, my = Math.min(sy, ty) - cell * 1.2;   // lift the arc's apex
    const u = 1 - e;
    const x = u * u * sx + 2 * u * e * mx + e * e * tx;
    const y = u * u * sy + 2 * u * e * my + e * e * ty;
    ctx.save(); ctx.globalAlpha = 0.92;
    drawTile(ctx, x, y, cell * (0.62 * (1 - 0.35 * e)), { type: f.type, special: null });
    ctx.restore();
  }
  return { landed, lastLand };
}

// --- Ambient side life ------------------------------------------------------
// Decorative critters that drift in the empty gutters beside the square board.
// Pure canvas paths, no assets; motion is driven by mod.clock (free-running
// seconds). Skipped when a gutter is too narrow (portrait / small screens).

// A huge decorative KRAKEN anchored in the bottom-left corner, drawn like the
// sea-monsters inked into the corners of antique treasure maps: faded teal
// chart-ink, sprawling curling arms with suckers, gently swaying off the clock.
// Semi-transparent + drawn behind the board panel, so it reads as a backdrop
// motif rather than clutter. `S` scales the whole beast.
function drawKraken(ctx, W, H, t) {
  const S = Math.min(W * 0.85, H) * 0.7;         // huge — fills the corner
  const ox = S * 0.14, oy = H - S * 0.12;         // body anchored into the corner
  const ink = (a) => `rgba(150,205,215,${a})`;    // faded nautical-chart ink
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Sprawling arms fanning up and to the right, toward the board.
  const arms = 7;
  for (let i = 0; i < arms; i++) {
    const base = -Math.PI * 0.92 + (i / (arms - 1)) * Math.PI * 0.92;   // up-left → right
    const len = S * (0.9 + 0.18 * ((i * 37) % 5) / 5);
    const sway = Math.sin(t * 0.7 + i * 0.8) * 0.16;
    let x = 0, y = -S * 0.18, ang = base + sway;
    const pts = [[x, y]];
    const segs = 11;
    for (let k = 1; k <= segs; k++) {
      const f = k / segs;
      ang += (0.17 + sway * 0.25) * (0.6 + f);          // progressive curl
      const step = (len / segs) * (1 - f * 0.4);
      x += Math.cos(ang) * step; y += Math.sin(ang) * step;
      pts.push([x, y]);
    }
    ctx.strokeStyle = ink(0.16); ctx.lineWidth = S * 0.055;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    ctx.fillStyle = ink(0.22);
    for (let k = 2; k < pts.length; k++) {
      const rr = S * 0.02 * (1 - k / pts.length);
      if (rr > 0.5) { ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], rr, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // Mantle / head.
  const g = ctx.createRadialGradient(-S * 0.06, -S * 0.28, S * 0.05, 0, -S * 0.18, S * 0.42);
  g.addColorStop(0, 'rgba(150,205,215,0.24)'); g.addColorStop(1, 'rgba(150,205,215,0.05)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -S * 0.18, S * 0.3, S * 0.4, -0.16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ink(0.2); ctx.lineWidth = S * 0.01;
  ctx.beginPath(); ctx.ellipse(0, -S * 0.18, S * 0.3, S * 0.4, -0.16, 0, Math.PI * 2); ctx.stroke();

  // Big map-monster eyes.
  for (const sx of [-0.13, 0.15]) {
    ctx.fillStyle = ink(0.3); ctx.beginPath(); ctx.arc(sx * S, -S * 0.26, S * 0.058, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(6,20,34,0.55)'; ctx.beginPath(); ctx.arc(sx * S + S * 0.012, -S * 0.26, S * 0.026, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFish(ctx, cx, cy, s, dir, col) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(dir, 1);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();      // body
  ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.5, -s * 0.6); ctx.lineTo(-s * 1.5, s * 0.6); ctx.closePath(); ctx.fill();   // tail
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.12, s * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a2030';
  ctx.beginPath(); ctx.arc(s * 0.48, -s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawKelp(ctx, x, baseY, h, t, phase) {
  ctx.save();
  ctx.strokeStyle = 'rgba(70,180,140,0.55)'; ctx.lineWidth = h * 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, baseY);
  for (let k = 1; k <= 6; k++) { const yy = baseY - (h / 6) * k; ctx.lineTo(x + Math.sin(t * 1.5 + phase + k * 0.5) * h * 0.05 * k / 6 * 3, yy); }
  ctx.stroke();
  ctx.restore();
}

// Draw one gutter column of ambient life (light rays, kelp, bubbles, a fish).
function drawGutter(ctx, gx0, gx1, H, t, seed) {
  const gw = gx1 - gx0; if (gw < 46) return;
  const cx = (gx0 + gx1) / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(gx0, 0, gw, H); ctx.clip();     // keep critters out of the board
  // faint light rays
  ctx.globalAlpha = 0.06; ctx.fillStyle = '#bfe6ff';
  for (let i = 0; i < 3; i++) { const rx = gx0 + gw * (0.2 + 0.3 * i) + Math.sin(t * 0.2 + i) * 8; ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx + 22, 0); ctx.lineTo(rx + 46, H); ctx.lineTo(rx + 8, H); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1;
  // kelp along the bottom
  const kelpH = Math.min(H * 0.34, 150);
  for (let i = 0; i < 3; i++) drawKelp(ctx, gx0 + gw * (0.25 + i * 0.28), H, kelpH * (0.7 + 0.3 * ((i + seed) % 2)), t, i + seed);
  // rising bubbles
  ctx.fillStyle = 'rgba(200,235,255,0.35)';
  for (let i = 0; i < 6; i++) {
    const bx = gx0 + gw * ((i * 0.37 + seed * 0.13) % 1);
    const by = H - ((t * (18 + i * 5) + i * 120 + seed * 60) % (H + 40));
    const br = 2 + (i % 3);
    ctx.beginPath(); ctx.arc(bx + Math.sin(by * 0.03 + i) * 5, by, br, 0, Math.PI * 2); ctx.fill();
  }
  // a drifting fish
  const fw = Math.max(0, gw + 60);
  const fx = gx0 - 30 + ((t * 26 + seed * 200) % fw);
  drawFish(ctx, fx, H * 0.32 + Math.sin(t + seed) * 14, Math.min(gw * 0.16, 16), 1, seed % 2 ? '#ff8f6b' : '#ffcf5c');
  ctx.restore();
}

function drawAmbient(ctx, mod, host, x0, cell, n) {
  const { W, H } = host.viewport;
  const t = mod.clock || 0;
  const boardL = x0 - 12, boardR = x0 + cell * n + 12;
  drawGutter(ctx, 8, boardL, H, t, 0);                // left gutter (fish/kelp/bubbles)
  drawGutter(ctx, boardR, W - 8, H, t, 1);            // right gutter
  drawKraken(ctx, W, H, t);                            // huge map-ink kraken, bottom-left corner
}

// Rounded board backdrop (chrome.panel is a full-screen wash, so draw our own box).
function boardPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,36,56,0.85)';
  ctx.strokeStyle = 'rgba(150,200,240,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// First-time-per-player explanation for each special. Shown once when a player
// first creates that special (persisted in the module); ids match board.js.
const SPECIAL_GUIDE = {
  line:  { name: 'LINE BLAST',     desc: 'Swap it anywhere to clear a full row or column.' },
  bomb:  { name: 'SEA MINE',       desc: 'Swap it anywhere to blast a 3×3 area.' },
  chest: { name: 'TREASURE CHEST', desc: 'Swap it anywhere to blow a 5×5 hole — bonus salvage!' },
};

// A non-blocking banner that flashes up the first time a player makes a special:
// its icon (drawn on a sample tile) + name + one-line description. Fades in/out
// over mod.guide.t / dur.
function drawSpecialGuide(ctx, mod, host) {
  if (!mod.guide) return;
  const info = SPECIAL_GUIDE[mod.guide.special];
  if (!info) return;
  const { W, H } = host.viewport;
  const p = mod.guide.t / mod.guide.dur;
  const a = Math.max(0, Math.min(1, Math.min(p * 6, (1 - p) * 6)));   // ease in + out
  const bw = 440, bh = 92, bx = W / 2 - bw / 2, by = H / 2 - bh / 2 - 8;   // centred over the board
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(8,26,44,0.94)'; ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill(); ctx.stroke();
  drawTile(ctx, bx + 52, by + bh / 2, 64, { type: 0, special: mod.guide.special, axis: 'row' });
  text(ctx, `NEW! ${info.name}`, bx + 98, by + 32, 19, PAL.gold, 'left', 'middle', true);
  text(ctx, info.desc, bx + 98, by + 60, 14, PAL.hudText, 'left', 'middle');
  ctx.restore();
}

export function drawMatch3(ctx, mod, host) {
  const { W, H } = host.viewport;
  const { cell, x0, y0, n } = geom(mod, host);
  const lv = mod.level;
  const counterX = W / 2, counterY = y0 - 34;            // objective-counter anchor (flyer target)

  // opaque underwater backdrop (fully covers the paused legacy frame beneath)
  ctx.fillStyle = 'rgb(4,16,30)'; ctx.fillRect(0, 0, W, H);
  drawAmbient(ctx, mod, host, x0, cell, n);            // octopus + fish + kelp in the side gutters
  boardPanel(ctx, x0 - 12, y0 - 12, cell * n + 24, cell * n + 24);

  // grid backing (checkerboard) — always drawn
  let displayed = mod.progress, pulse = 0;
  if (mod.board) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
    }
    if (mod.anim) {
      // Mid-resolution: replay the timeline beats, then arc collect-flyers into
      // the counter. The objective counts UP as flyers land (from progressStart),
      // and the counter pulses briefly on each landing. No cursor while busy.
      drawBeats(ctx, mod.anim, mod, x0, y0, cell, n);
      const fl = drawFlyers(ctx, mod.anim, x0, y0, cell, counterX, counterY);
      if (lv) displayed = Math.min(lv.targetCount, mod.anim.progressStart + fl.landed);
      if (fl.lastLand >= 0) pulse = Math.max(0, 1 - (mod.anim.t - fl.lastLand) / 0.25);
    } else {
      displayed = Math.min(mod.progress, lv ? lv.targetCount : mod.progress);
      if (lv) drawTargetHalos(ctx, mod.board.tiles, lv.targetTile, x0, y0, cell, n, mod.clock || 0);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        drawTile(ctx, x0 + c * cell + cell / 2, y0 + r * cell + cell / 2, cell, mod.board.tiles[r][c]);
      }
      // cursor + selection (keyboard/gamepad)
      const box = (cc, rr, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x0 + cc * cell + 2, y0 + rr * cell + 2, cell - 4, cell - 4); };
      box(mod.cursor.c, mod.cursor.r, PAL.gold);
      if (mod.sel) box(mod.sel.c, mod.sel.r, PAL.glow);
    }
  }

  // HUD: title + objective + moves + score + hint
  if (lv) {
    text(ctx, `TREASURE CHEST MADNESS — Level ${lv.id}`, W / 2, 40, 22, PAL.glow, 'center', 'middle', true);
    // The objective counter grows + goes glow-coloured for a beat as each flyer lands.
    text(ctx, `Collect ${TILE_NAMES[lv.targetTile]}: ${displayed}/${lv.targetCount}`, counterX, counterY, 18 + 6 * pulse, pulse > 0 ? PAL.glow : PAL.gold, 'center', 'middle', pulse > 0.3);
    text(ctx, `Moves ${mod.movesLeft}`, x0, y0 + cell * n + 30, 16, PAL.hudText, 'left', 'middle');
    text(ctx, `Score ${mod.score}`, x0 + cell * n, y0 + cell * n + 30, 16, PAL.hudText, 'right', 'middle');
    text(ctx, host.input.isTouch ? 'Drag or tap two tiles to swap · ✕ to quit' : 'Drag or click two tiles to swap · Arrows+Space · Esc to quit', W / 2, H - 24, 12, '#9fc6e0', 'center', 'middle');
  }

  // ✕ quit button (top-right) — a bail-out for touch, also clickable on desktop.
  const q = quitRect(host);
  ctx.save();
  ctx.fillStyle = 'rgba(10,30,50,0.8)'; ctx.strokeStyle = 'rgba(150,200,240,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, 6); ctx.fill(); ctx.stroke();
  ctx.restore();
  text(ctx, '✕', q.x + q.w / 2, q.y + q.h / 2 + 1, 18, PAL.hudText, 'center', 'middle', true);

  // First-time special guide (non-blocking banner; on top of the board/HUD).
  drawSpecialGuide(ctx, mod, host);

  // phase overlays (manual — chrome.overlay is a fixed 2-line banner)
  if (mod.phase === 'intro' && lv) {
    panel(ctx, 0.55);
    text(ctx, `Level ${lv.id}`, W / 2, H / 2 - 30, 40, PAL.glow, 'center', 'middle', true);
    text(ctx, `Collect ${lv.targetCount} ${TILE_NAMES[lv.targetTile]} in ${lv.moves} moves`, W / 2, H / 2 + 16, 18, PAL.hudText, 'center', 'middle');
    text(ctx, 'Space to begin', W / 2, H / 2 + 52, 14, '#9fc6e0', 'center', 'middle');
  } else if (mod.phase === 'won' && lv) {
    panel(ctx, 0.6);
    text(ctx, 'LEVEL CLEARED', W / 2, H / 2 - 20, 40, PAL.gold, 'center', 'middle', true);
    text(ctx, `⚙ SALVAGE +${mod.lastPayout || lv.reward}  ·  ${host.economy.state.salvage} banked`, W / 2, H / 2 + 24, 18, PAL.gold, 'center', 'middle');
    text(ctx, 'Space: next level', W / 2, H / 2 + 56, 14, '#9fc6e0', 'center', 'middle');
  } else if (mod.phase === 'lost') {
    panel(ctx, 0.6);
    text(ctx, 'OUT OF MOVES', W / 2, H / 2 - 20, 40, PAL.danger, 'center', 'middle', true);
    text(ctx, 'Space: retry  ·  Esc: quit', W / 2, H / 2 + 24, 14, '#9fc6e0', 'center', 'middle');
  }
}
