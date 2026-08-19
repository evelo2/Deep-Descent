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
