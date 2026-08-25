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

  // specials: line = horizontal bar, bomb = inner ring
  if (tile.special === 'line') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }
  else if (tile.special === 'bomb') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke(); }
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

const easeOut = (k) => 1 - (1 - k) * (1 - k);

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

// Rounded board backdrop (chrome.panel is a full-screen wash, so draw our own box).
function boardPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,36,56,0.85)';
  ctx.strokeStyle = 'rgba(150,200,240,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.restore();
}

export function drawMatch3(ctx, mod, host) {
  const { W, H } = host.viewport;
  const { cell, x0, y0, n } = geom(mod, host);
  const lv = mod.level;
  const counterX = W / 2, counterY = y0 - 34;            // objective-counter anchor (flyer target)

  // opaque underwater backdrop (fully covers the paused legacy frame beneath)
  ctx.fillStyle = 'rgb(4,16,30)'; ctx.fillRect(0, 0, W, H);
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
    text(ctx, `SALVAGE MATCH — Level ${lv.id}`, W / 2, 40, 22, PAL.glow, 'center', 'middle', true);
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

  // phase overlays (manual — chrome.overlay is a fixed 2-line banner)
  if (mod.phase === 'intro' && lv) {
    panel(ctx, 0.55);
    text(ctx, `Level ${lv.id}`, W / 2, H / 2 - 30, 40, PAL.glow, 'center', 'middle', true);
    text(ctx, `Collect ${lv.targetCount} ${TILE_NAMES[lv.targetTile]} in ${lv.moves} moves`, W / 2, H / 2 + 16, 18, PAL.hudText, 'center', 'middle');
    text(ctx, 'Space to begin', W / 2, H / 2 + 52, 14, '#9fc6e0', 'center', 'middle');
  } else if (mod.phase === 'won' && lv) {
    panel(ctx, 0.6);
    text(ctx, 'LEVEL CLEARED', W / 2, H / 2 - 20, 40, PAL.gold, 'center', 'middle', true);
    text(ctx, `⚙ SALVAGE +${lv.reward}  ·  ${host.economy.state.salvage} banked`, W / 2, H / 2 + 24, 18, PAL.gold, 'center', 'middle');
    text(ctx, 'Space: next level', W / 2, H / 2 + 56, 14, '#9fc6e0', 'center', 'middle');
  } else if (mod.phase === 'lost') {
    panel(ctx, 0.6);
    text(ctx, 'OUT OF MOVES', W / 2, H / 2 - 20, 40, PAL.danger, 'center', 'middle', true);
    text(ctx, 'Space: retry  ·  Esc: quit', W / 2, H / 2 + 24, 14, '#9fc6e0', 'center', 'middle');
  }
}
