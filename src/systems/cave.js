// 2D cave system. A boolean grid is carved by "miner" agents that walk from the
// surface making tunnels, vertical drop-offs and chambers. A chamfer distance
// field over that grid gives smooth, organic rock: collision slides entities
// along curved walls, and rendering soft-carves the caves out of a rock layer.
import { WORLD, CAVE, PAL } from '../config.js';

const { WW, WH, CELL, OPEN_BAND } = WORLD;
const BIG = 9999;

export class Cave {
  constructor() {
    this.GW = Math.ceil(WW / CELL);
    this.GH = Math.ceil(WH / CELL);
    this.CARVE = CAVE.carve;
    this.open = new Uint8Array(this.GW * this.GH);
    this._generate();
    this._distanceField();
    // Offscreen rock layer, rebuilt each frame at screen resolution.
    this.oc = document.createElement('canvas');
    this.oc.width = WORLD.W; this.oc.height = WORLD.H;
    this.octx = this.oc.getContext('2d');
  }

  _idx(gx, gy) { return gy * this.GW + gx; }
  inGrid(gx, gy) { return gx >= 0 && gy >= 0 && gx < this.GW && gy < this.GH; }

  _carveDisc(cx, cy, r) {
    for (let gy = Math.max(0, cy - r); gy <= Math.min(this.GH - 1, cy + r); gy++)
      for (let gx = Math.max(0, cx - r); gx <= Math.min(this.GW - 1, cx + r); gx++)
        if ((gx - cx) ** 2 + (gy - cy) ** 2 <= r * r) this.open[this._idx(gx, gy)] = 1;
  }

  _generate() {
    const bandRow = Math.floor(OPEN_BAND / CELL);
    // Open sea band across the full width.
    for (let gy = 0; gy <= bandRow; gy++)
      for (let gx = 0; gx < this.GW; gx++) this.open[this._idx(gx, gy)] = 1;

    const clampX = (x) => Math.max(1, Math.min(this.GW - 2, x));
    const clampY = (y) => Math.max(bandRow, Math.min(this.GH - 2, y));

    // Miner stack. The first miner is a "main shaft" driven mostly downward from
    // directly under the boat (the dive point), so there's always an entrance and
    // a route to the bottom; the rest wander to make the network.
    const spawnGX = clampX(Math.round((WW / 2) / CELL));
    const miners = [];
    for (let i = 0; i < CAVE.miners; i++)
      miners.push({ x: i === 0 ? spawnGX : clampX(2 + Math.floor(Math.random() * (this.GW - 4))), y: bandRow, steps: CAVE.minerSteps, shaft: i === 0 });

    let guard = 0;
    while (miners.length && guard++ < 4000) {
      const m = miners.pop();
      let { x, y } = m, left = m.steps;
      while (left > 0) {
        const roll = Math.random();
        let mode, run, dir = Math.random() < 0.5 ? -1 : 1;
        if (m.shaft) { mode = roll < 0.8 ? 'down' : 'diag'; run = 3 + (Math.random() * 5 | 0); }
        else if (roll < 0.34) { mode = 'down'; run = 3 + (Math.random() * 7 | 0); }
        else if (roll < 0.64) { mode = 'horiz'; run = 4 + (Math.random() * 8 | 0); }
        else if (roll < 0.8) { mode = 'diag'; run = 3 + (Math.random() * 6 | 0); }
        else { mode = 'chamber'; run = 1; }

        for (let s = 0; s < run && left > 0; s++) {
          if (mode === 'chamber') this._carveDisc(x, y, 3 + (Math.random() * 2 | 0));
          else this._carveDisc(x, y, mode === 'horiz' ? 1 : 1 + (Math.random() < 0.3 ? 1 : 0));
          if (mode === 'down') y++;
          else if (mode === 'horiz') x += dir;
          else if (mode === 'diag') { x += dir; y++; }
          x = clampX(x); y = clampY(y);
          left--;
          if (!m.shaft && Math.random() < CAVE.branchChance && miners.length < 44)
            miners.push({ x, y, steps: 30 + (Math.random() * 60 | 0), shaft: false });
        }
      }
    }
    // Guaranteed grand chamber near the bottom for the deepest loot.
    this._carveDisc(this.GW >> 1, this.GH - 3, 4);
  }

  // Chamfer distance transform: cells → distance (in cell units) to nearest open.
  _distanceField() {
    const { GW, GH } = this;
    const d = new Float32Array(GW * GH);
    for (let i = 0; i < d.length; i++) d[i] = this.open[i] ? 0 : BIG;
    const D1 = 1, D2 = Math.SQRT2;
    const at = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? BIG : d[y * GW + x];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let v = d[y * GW + x];
      v = Math.min(v, at(x - 1, y) + D1, at(x, y - 1) + D1, at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
      d[y * GW + x] = v;
    }
    for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) {
      let v = d[y * GW + x];
      v = Math.min(v, at(x + 1, y) + D1, at(x, y + 1) + D1, at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
      d[y * GW + x] = v;
    }
    this.dist = d;
  }

  // Distance (px) from a world point to the nearest open-cell centre. 0 in the
  // open sea band; large (solid) outside the world.
  pxDist(x, y) {
    if (y < OPEN_BAND) return 0;
    if (x < 0 || x >= WW || y >= WH) return this.CARVE + 1000;
    const fx = x / CELL - 0.5, fy = y / CELL - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const g = (gx, gy) => (gx < 0 || gy < 0 || gx >= this.GW || gy >= this.GH) ? BIG : this.dist[gy * this.GW + gx];
    const top = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
    const bot = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
    return (top + (bot - top) * ty) * CELL;
  }

  isSolid(x, y) { return this.pxDist(x, y) >= this.CARVE; }

  // Push an entity (with .x,.y,.radius and optional .vx,.vy) out of rock, sliding
  // along the wall. Returns true on contact.
  collide(e) {
    const allow = this.CARVE - e.radius;
    const d = this.pxDist(e.x, e.y);
    if (d <= allow) return false;
    const eps = 6;
    const gx = this.pxDist(e.x + eps, e.y) - this.pxDist(e.x - eps, e.y);
    const gy = this.pxDist(e.x, e.y + eps) - this.pxDist(e.x, e.y - eps);
    const gl = Math.hypot(gx, gy) || 1;
    const nx = gx / gl, ny = gy / gl;         // points into rock
    const push = d - allow;
    e.x -= nx * push; e.y -= ny * push;
    e._nx = nx; e._ny = ny;                    // surface normal, for callers
    if (e.vx !== undefined) {
      const vn = e.vx * nx + e.vy * ny;
      if (vn > 0) { e.vx -= vn * nx * (1 - CAVE.wallDamp); e.vy -= vn * ny * (1 - CAVE.wallDamp); }
    }
    return true;
  }

  // ---- spawn helpers ---------------------------------------------------
  cellCentre(gx, gy) { return { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 }; }

  // A random open cell centre below the given world y.
  randomOpen(minY = OPEN_BAND + CELL, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const gx = 1 + (Math.random() * (this.GW - 2) | 0);
      const gy = 1 + (Math.random() * (this.GH - 2) | 0);
      if (!this.open[this._idx(gx, gy)]) continue;
      const c = this.cellCentre(gx, gy);
      if (c.y > minY) return c;
    }
    return null;
  }

  // Cells whose 3×3 neighbourhood is fully open — roomy spots for wrecks.
  chambers(minY = OPEN_BAND + 200) {
    const out = [];
    for (let gy = 2; gy < this.GH - 2; gy++) for (let gx = 2; gx < this.GW - 2; gx++) {
      let all = true;
      for (let j = -1; j <= 1 && all; j++) for (let i = -1; i <= 1; i++)
        if (!this.open[this._idx(gx + i, gy + j)]) { all = false; break; }
      if (all) { const c = this.cellCentre(gx, gy); if (c.y > minY) out.push(c); }
    }
    return out;
  }

  // Open cells sitting directly above solid rock — floors for standing plants.
  floors(minY = OPEN_BAND + CELL) {
    const out = [];
    for (let gy = 1; gy < this.GH - 1; gy++) for (let gx = 0; gx < this.GW; gx++) {
      if (this.open[this._idx(gx, gy)] && !this.open[this._idx(gx, gy + 1)]) {
        const c = this.cellCentre(gx, gy);
        if (c.y > minY) out.push({ x: c.x, y: c.y + CELL * 0.45 });
      }
    }
    return out;
  }

  // Open cells against a side wall — mounts for air vents. side=+1 wall on left.
  walls(minY = OPEN_BAND + CELL) {
    const out = [];
    for (let gy = 1; gy < this.GH - 1; gy++) for (let gx = 1; gx < this.GW - 1; gx++) {
      if (!this.open[this._idx(gx, gy)]) continue;
      const c = this.cellCentre(gx, gy);
      if (c.y <= minY) continue;
      if (!this.open[this._idx(gx - 1, gy)]) out.push({ x: c.x - CELL * 0.4, y: c.y, side: 1 });
      else if (!this.open[this._idx(gx + 1, gy)]) out.push({ x: c.x + CELL * 0.4, y: c.y, side: -1 });
    }
    return out;
  }

  // ---- rendering -------------------------------------------------------
  draw(ctx, camX, camY) {
    const { W, H } = WORLD, octx = this.octx, R = this.CARVE * 1.18;
    octx.clearRect(0, 0, W, H);
    // Rock fill, subtly darker with depth.
    const depthT = Math.min(1, camY / WH);
    const g = octx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(PAL.rock, PAL.rockDark, depthT * 0.6));
    g.addColorStop(1, PAL.rockDark);
    octx.fillStyle = g; octx.fillRect(0, 0, W, H);

    // Carve the caves out with soft brushes at open-cell centres in view.
    octx.globalCompositeOperation = 'destination-out';
    const gx0 = Math.max(0, (camX / CELL | 0) - 1), gx1 = Math.min(this.GW - 1, ((camX + W) / CELL | 0) + 1);
    const gy0 = Math.max(0, (camY / CELL | 0) - 1), gy1 = Math.min(this.GH - 1, ((camY + H) / CELL | 0) + 1);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      if (!this.open[this._idx(gx, gy)]) continue;
      const sx = gx * CELL + CELL / 2 - camX, sy = gy * CELL + CELL / 2 - camY;
      const br = octx.createRadialGradient(sx, sy, R * 0.4, sx, sy, R);
      br.addColorStop(0, 'rgba(0,0,0,1)');
      br.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = br;
      octx.beginPath(); octx.arc(sx, sy, R, 0, Math.PI * 2); octx.fill();
    }
    // The open sea band is always water — clear any rock above it.
    octx.fillStyle = 'rgba(0,0,0,1)';
    const bandScreenY = OPEN_BAND - camY;
    if (bandScreenY > 0) octx.fillRect(0, 0, W, Math.min(H, bandScreenY));
    octx.globalCompositeOperation = 'source-over';

    // Rim light along cave edges for definition.
    octx.globalCompositeOperation = 'source-atop';
    const rim = octx.createLinearGradient(0, 0, 0, H);
    rim.addColorStop(0, 'rgba(120,170,210,0.05)');
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = rim; octx.fillRect(0, 0, W, H);
    octx.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.oc, 0, 0, W, H);
  }
}

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const ca = hex(a), cb = hex(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}
