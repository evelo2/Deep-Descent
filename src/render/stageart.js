// Themed, neighbor-aware ("autotiled") wreck structure + ladders. Purely
// procedural canvas drawing, baked once per room into StageScene's offscreen
// layer (see stagescene.js `_bake`) — no per-frame animation lives here.
import { STAGE } from '../config.js';

const TAU = Math.PI * 2;
const T = STAGE.tile;

// Bitfield of SOLID neighbors around grid cell (c, r). Only '#' tiles count
// as solid; out-of-bounds reads as solid (framed edges) EXCEPT above the top
// row, which reads as open water so the map doesn't look capped overhead.
export const UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8;

export function neighborMask(room, c, r) {
  const solidAt = (cc, rr) => {
    if (rr < 0) return false;                                   // open water above
    if (cc < 0 || cc >= room.cols || rr >= room.rows) return true; // framed edges
    return room.grid[rr][cc] === '#';
  };
  let m = 0;
  if (solidAt(c, r - 1)) m |= UP;
  if (solidAt(c, r + 1)) m |= DOWN;
  if (solidAt(c - 1, r)) m |= LEFT;
  if (solidAt(c + 1, r)) m |= RIGHT;
  return m;
}

// One 30x30 structure tile, autotiled by its neighbor mask.
export function drawStructureTile(ctx, x, y, mask, palette, theme) {
  const isShip = theme.key === 'ship';
  const plank = palette.plank || palette.solid;
  const plankHi = palette.plankHi || plank;
  const brass = palette.brass || palette.solidEdge;
  const rivet = palette.rivet || palette.solidEdge;
  const neon = palette.neon || palette.ladder;
  const edge = palette.solidEdge;

  const topOpen = !(mask & UP);
  const leftOpen = !(mask & LEFT);
  const rightOpen = !(mask & RIGHT);

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();

  // base fill
  ctx.fillStyle = plank;
  ctx.fillRect(x, y, T, T);

  if (topOpen) {
    // lighter cap band along the exposed top
    const capH = 9;
    ctx.fillStyle = plankHi;
    ctx.fillRect(x, y, T, capH);
    if (isShip) {
      // oak cap grain
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 1, y + capH - 3); ctx.lineTo(x + T - 1, y + capH - 3); ctx.stroke();
      // brass bolts
      ctx.fillStyle = brass;
      ctx.beginPath(); ctx.arc(x + 7, y + 4, 1.7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + T - 7, y + 4, 1.7, 0, TAU); ctx.fill();
      // barnacle speckles
      ctx.fillStyle = 'rgba(230,225,205,0.55)';
      ctx.beginPath(); ctx.arc(x + 12, y + 6, 1.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 19, y + 3, 1.0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 22, y + 7, 0.9, 0, TAU); ctx.fill();
    } else {
      // wet-rock cap with riveted-steel dots
      ctx.fillStyle = rivet;
      ctx.beginPath(); ctx.arc(x + 7, y + 4, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + T - 7, y + 4, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + T / 2, y + 4, 1.4, 0, TAU); ctx.fill();
      // thin neon seam along the exposed top edge
      ctx.strokeStyle = neon; ctx.lineWidth = 1; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(x + 1, y + capH - 1); ctx.lineTo(x + T - 1, y + capH - 1); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    // interior: darker, low-detail so it recedes
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
    if (isShip) {
      ctx.beginPath(); ctx.moveTo(x + 2, y + T * 0.4); ctx.lineTo(x + T - 2, y + T * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 2, y + T * 0.75); ctx.lineTo(x + T - 2, y + T * 0.75); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + T * 0.3, y + T * 0.5, 2, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + T * 0.65, y + T * 0.7, 1.6, 0, TAU); ctx.stroke();
    }
  }

  if (leftOpen) {
    if (isShip) {
      ctx.fillStyle = brass;
      ctx.fillRect(x, y + (topOpen ? 9 : 0), 3, T - (topOpen ? 9 : 0));
      for (let k = 6; k < T; k += 9) { ctx.beginPath(); ctx.arc(x + 2, y + k, 1.3, 0, TAU); ctx.fill(); }
    } else {
      ctx.fillStyle = rivet;
      ctx.fillRect(x, y + (topOpen ? 9 : 0), 3, T - (topOpen ? 9 : 0));
      ctx.strokeStyle = neon; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + T); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (rightOpen) {
    if (isShip) {
      ctx.fillStyle = brass;
      ctx.fillRect(x + T - 3, y + (topOpen ? 9 : 0), 3, T - (topOpen ? 9 : 0));
      for (let k = 6; k < T; k += 9) { ctx.beginPath(); ctx.arc(x + T - 2, y + k, 1.3, 0, TAU); ctx.fill(); }
    } else {
      ctx.fillStyle = rivet;
      ctx.fillRect(x + T - 3, y + (topOpen ? 9 : 0), 3, T - (topOpen ? 9 : 0));
      ctx.strokeStyle = neon; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x + T - 4, y); ctx.lineTo(x + T - 4, y + T); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // outer dark seam, keeps the tile framed and seamless with its neighbors
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
  ctx.restore();
}

// Full room dimensions the bake canvas covers (see stagescene.js).
const ROOM_W = 900, ROOM_H = 600;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function rgba(hexColor, a) {
  const [r, g, b] = hexToRgb(hexColor);
  return `rgba(${r},${g},${b},${a})`;
}

// Baked deep backdrop: depth gradient + a couple of faint godray wedges +
// a subtle caustic band near the top. Fully static — `seed` (the room
// index) drives the only variety, never a live clock, since this is drawn
// once into the offscreen bake and must be identical every re-bake.
export function drawBackdrop(ctx, palette, seed) {
  ctx.save();
  const W = ROOM_W, H = ROOM_H;

  // 1. vertical depth gradient, top -> bottom.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, palette.bg1);
  g.addColorStop(1, palette.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 2. soft godray wedges, themed by the palette's glow color (warm for
  // SHIP, cool for LAIR). Kept low-alpha so they read as ambient light,
  // not a foreground effect.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tint = palette.glow || palette.neon || '#bfe9ff';
  const rayCount = 2 + (seed % 2); // 2 or 3 rays, varies by room
  for (let i = 0; i < rayCount; i++) {
    const bx = (seed * 197 + i * 260) % W;
    const topW = 50 + ((seed + i) * 17) % 40;
    const rayA = 0.05 + ((seed + i * 3) % 3) * 0.017; // ~0.05-0.10
    ctx.beginPath();
    ctx.moveTo(bx, -20);
    ctx.lineTo(bx + topW, -20);
    ctx.lineTo(bx + topW + 140, H);
    ctx.lineTo(bx - 40, H);
    ctx.closePath();
    const rg = ctx.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, rgba(tint, rayA));
    rg.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = rg;
    ctx.fill();
  }
  ctx.restore();

  // 3. one subtle caustic band near the top, phase-shifted by seed so
  // rooms don't look identical — static, no time term.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  const phase = seed * 0.9;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) {
      const yy = 50 + i * 28 + Math.sin(x * 0.05 + phase + i) * 10;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

// Dim, low-contrast parallax wreck silhouettes baked BEHIND the play
// structure — pure decoration, no collision meaning. `roomIndex` varies
// the composition (which elements appear) and placement so consecutive
// rooms in a theme don't look identical.
export function drawFarWreck(ctx, palette, roomIndex) {
  ctx.save();
  const mix = lerpColor(palette.bg2, palette.bg1, 0.45);
  const alpha = 0.14 + (roomIndex % 3) * 0.03; // 0.14 / 0.17 / 0.20
  ctx.globalAlpha = alpha;
  ctx.fillStyle = mix;
  ctx.strokeStyle = mix;
  ctx.lineCap = 'round';

  const variant = roomIndex % 3; // 0: hull+masts, 1: hull+ribs, 2: hull+masts+ribs
  const xOff = (roomIndex * 137) % 260;
  const baseX = 560 + xOff * 0.6;
  const baseY = 520;

  ctx.translate(baseX, baseY);
  ctx.rotate(-0.08 - (roomIndex % 2) * 0.05);

  // listing hull silhouette — always present, forms the base read.
  ctx.beginPath();
  ctx.moveTo(-140, -10);
  ctx.quadraticCurveTo(-160, 40, -100, 48);
  ctx.lineTo(100, 48);
  ctx.quadraticCurveTo(160, 36, 128, -16);
  ctx.lineTo(100, -8);
  ctx.quadraticCurveTo(0, 6, -120, -12);
  ctx.closePath();
  ctx.fill();

  if (variant !== 1) {
    // broken masts jutting up from the deck.
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-70, -10); ctx.lineTo(-64, -90); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, -8); ctx.lineTo(58, -60); ctx.stroke();
  }
  if (variant !== 0) {
    // exposed hull ribs.
    ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      const x = i * 26;
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.quadraticCurveTo(x + (i % 2 === 0 ? 14 : -14), 4, x, -30);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// One 30x30 ladder tile. `capTop` is true when the tile ABOVE is not a
// ladder — draw a rounded cap/knot so the ladder top reads finished.
export function drawLadderTile(ctx, x, y, capTop, palette, theme) {
  const isShip = theme.key === 'ship';
  const rail = palette.ladder;
  const glow = palette.glow || rail;
  const rivet = palette.rivet || rail;
  const lx = x + 7, rx = x + T - 7;

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();

  if (isShip) {
    // two knotted ropes
    ctx.strokeStyle = rail; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + T); ctx.moveTo(rx, y); ctx.lineTo(rx, y + T); ctx.stroke();
    // rope twist ticks
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for (let k = 3; k < T; k += 6) {
      ctx.beginPath(); ctx.moveTo(lx - 2, y + k); ctx.lineTo(lx + 2, y + k + 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx - 2, y + k); ctx.lineTo(rx + 2, y + k + 3); ctx.stroke();
    }
    // rope rungs
    ctx.strokeStyle = rail; ctx.lineWidth = 3;
    for (let k = 6; k < T; k += 10) { ctx.beginPath(); ctx.moveTo(lx, y + k); ctx.lineTo(rx, y + k); ctx.stroke(); }
    // knot bumps at each rung end
    ctx.fillStyle = rail;
    for (let k = 6; k < T; k += 10) {
      ctx.beginPath(); ctx.arc(lx, y + k, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, y + k, 2, 0, TAU); ctx.fill();
    }
    if (capTop) {
      ctx.fillStyle = rail;
      ctx.beginPath(); ctx.arc(lx, y + 3, 3.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, y + 3, 3.4, 0, TAU); ctx.fill();
    }
  } else {
    // two riveted metal rails
    ctx.strokeStyle = rail; ctx.lineWidth = 4; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + T); ctx.moveTo(rx, y); ctx.lineTo(rx, y + T); ctx.stroke();
    // faint inner glow line
    ctx.strokeStyle = glow; ctx.lineWidth = 1; ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + T); ctx.moveTo(rx, y); ctx.lineTo(rx, y + T); ctx.stroke();
    ctx.globalAlpha = 1;
    // rivets
    ctx.fillStyle = rivet;
    for (let k = 4; k < T; k += 8) {
      ctx.beginPath(); ctx.arc(lx, y + k, 1.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, y + k, 1.3, 0, TAU); ctx.fill();
    }
    // rung bars
    ctx.strokeStyle = rail; ctx.lineWidth = 3;
    for (let k = 6; k < T; k += 10) { ctx.beginPath(); ctx.moveTo(lx, y + k); ctx.lineTo(rx, y + k); ctx.stroke(); }
    if (capTop) {
      ctx.strokeStyle = rail; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(lx, y + 4, 3, Math.PI, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(rx, y + 4, 3, Math.PI, TAU); ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Live ambient layers — stateless, driven purely by `t` (no dt, no stored
// state, no Math.random). Every particle's position is a pure function of
// its fixed index `i` and the clock `t`, exactly like Background's motes
// (see render/background.js) — just computed inline instead of cached in an
// array, since these pools are small and cheap to recompute each frame.
// Composited by StageScene.composite(): drawShoal between the baked image
// and the actors, drawForeground after the diver (see stagescene.js).

const AMBIENT_W = 900, AMBIENT_H = 600;

// Cheap deterministic pseudo-random in [0,1) from an integer seed — no
// Math.random, fully reproducible per index.
function hash01(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const SHOAL_COUNT = 12;
// Dim background fish shoal drifting on a mid parallax plane, tinted toward
// palette.bg2 so it reads as distant/behind the play. Drawn between the
// baked backdrop+structure and the live actors.
export function drawShoal(ctx, palette, t, roomIndex) {
  ctx.save();
  const tint = palette.bg2 || '#0a0a0a';
  ctx.fillStyle = tint;
  const roomShift = (roomIndex * 173) % AMBIENT_W;
  for (let i = 0; i < SHOAL_COUNT; i++) {
    const band = 60 + hash01(i * 3 + 1) * 340; // vertical band, upper 2/3 of the room
    const speed = 8 + hash01(i * 5 + 2) * 14;  // px/sec, varies by index
    const dir = i % 2 === 0 ? 1 : -1;
    const startX = hash01(i * 7 + 3) * AMBIENT_W;
    let x = (startX + roomShift + dir * speed * t) % (AMBIENT_W + 40);
    if (x < 0) x += AMBIENT_W + 40;
    x -= 20;
    const y = band + Math.sin(t * 0.6 + i) * 6;
    const size = 5 + hash01(i * 11 + 4) * 4;
    const alpha = 0.25 + hash01(i * 13 + 5) * 0.15; // ~0.25-0.4
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(x, y);
    if (dir < 0) ctx.scale(-1, 1);
    // body
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.42, 0, 0, TAU); ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.lineTo(-size - size * 0.8, -size * 0.5);
    ctx.lineTo(-size - size * 0.8, size * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

const SILT_COUNT = 40;
const BUBBLE_COUNT = 16;
const KELP_COUNT = 4;

// Front-most live layer: drifting silt motes, rising bubbles, a few hanging
// kelp strands near the edges, and a soft vignette. Drawn after the diver so
// it reads as nearest-camera atmosphere; kept low-alpha/edge-hugging so it
// never obscures play.
export function drawForeground(ctx, palette, t, roomIndex) {
  ctx.save();
  const W = AMBIENT_W, H = AMBIENT_H;
  const seedShift = (roomIndex * 91) % W;

  // 1. Silt motes — slow drift, low alpha.
  const siltColor = palette.silt || '#d8e6ee';
  ctx.fillStyle = siltColor;
  for (let i = 0; i < SILT_COUNT; i++) {
    const baseX = hash01(i * 4 + 11) * W;
    const baseY = hash01(i * 6 + 13) * H;
    const speed = 3 + hash01(i * 8 + 17) * 5; // slow px/sec
    let x = (baseX + seedShift + speed * t) % W;
    if (x < 0) x += W;
    let y = (baseY + speed * 0.4 * t) % H;
    if (y < 0) y += H;
    const r = 0.7 + hash01(i * 9 + 19) * 1.3;
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  // 2. Rising bubbles — y decreases with t, wrapped; slight x wobble.
  ctx.strokeStyle = 'rgba(220,245,255,0.9)';
  ctx.lineWidth = 1;
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const baseX = hash01(i * 5 + 23) * W;
    const baseY = hash01(i * 7 + 29) * H;
    const rise = 12 + hash01(i * 10 + 31) * 18; // px/sec upward
    let y = (baseY - rise * t) % H;
    if (y < 0) y += H;
    const wobble = Math.sin(t * 2 + i * 1.7) * 5;
    const x = baseX + wobble;
    const r = 1.2 + hash01(i * 12 + 37) * 2.2;
    ctx.globalAlpha = 0.15 + hash01(i * 14 + 41) * 0.1; // ~0.15-0.25
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }

  // 3. Hanging kelp near the top edges (left/right), swaying — kept away
  // from the center play area so it frames rather than blocks.
  ctx.strokeStyle = palette.kelp || '#3fae6a';
  ctx.lineCap = 'round';
  for (let i = 0; i < KELP_COUNT; i++) {
    const leftSide = i % 2 === 0;
    const rootX = leftSide
      ? 24 + hash01(i * 15 + 43) * 48
      : W - 24 - hash01(i * 15 + 43) * 48;
    const len = 60 + hash01(i * 17 + 47) * 50;
    const segs = 5;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let x = rootX, y = 0;
    ctx.moveTo(x, y);
    for (let s = 1; s <= segs; s++) {
      const sway = Math.sin(t + i + s * 0.5) * (4 + s);
      x = rootX + sway;
      y = (s / segs) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // 4. Soft vignette — subtle edge darkening, center stays bright.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
}
