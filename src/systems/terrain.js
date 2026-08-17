// Cave terrain. Below the open surface zone, rock walls form a winding vertical
// corridor: wide chambers connected by narrow passages. The corridor is defined
// by control points (centre + half-width) sampled down the world and smoothly
// interpolated. The diver is kept inside it; rock pillars are hard obstacles.
import { WORLD, CAVE, PAL } from '../config.js';

const smooth = (t) => t * t * (3 - 2 * t);
// Stable pseudo-noise for a jagged rock edge (deterministic in y).
const edgeNoise = (y) =>
  Math.sin(y * 0.11) * 10 + Math.sin(y * 0.037 + 1.7) * 16 + Math.sin(y * 0.23 + 0.5) * 5;

export class Terrain {
  constructor() {
    this.floorY = WORLD.DEPTH_MAX + WORLD.SEABED;
    this.points = [];   // {y, cx, hw}
    this.pillars = [];  // {x, y, r}
    this.chambers = [];  // wide spots for wrecks/loot {y, cx, hw}
    this._generate();
  }

  _generate() {
    const { openEnd, minHalfWidth, maxHalfWidth, segment, centerRange } = CAVE;
    const mid = WORLD.W / 2;
    // Mouth of the cave: full width, blending from open water.
    this.points.push({ y: openEnd, cx: mid, hw: WORLD.W / 2 });
    let cx = mid, wide = true;
    for (let y = openEnd + segment; y < this.floorY + segment; y += segment) {
      cx += (Math.random() - 0.5) * 220;
      cx = Math.max(mid - centerRange, Math.min(mid + centerRange, cx));
      const hw = wide
        ? maxHalfWidth - Math.random() * 60
        : minHalfWidth + Math.random() * 50;
      const p = { y, cx, hw };
      this.points.push(p);
      if (wide && y < this.floorY - 200) this.chambers.push(p);
      // Pillars sprout in chambers only, kept clear of the passage centre.
      if (wide && Math.random() < 0.55) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.pillars.push({ x: cx + side * (hw * 0.55), y: y + segment * 0.3, r: 26 + Math.random() * 18 });
      }
      wide = !wide;
    }
  }

  // Corridor centre + half-width at a given depth (smoothly interpolated).
  _at(y) {
    const pts = this.points;
    if (y <= pts[0].y) return { cx: WORLD.W / 2, hw: WORLD.W / 2 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y <= b.y) {
        const t = smooth((y - a.y) / (b.y - a.y));
        return { cx: a.cx + (b.cx - a.cx) * t, hw: a.hw + (b.hw - a.hw) * t };
      }
    }
    return pts[pts.length - 1];
  }

  // Passable x-range [left, right] at depth y for an entity of the given radius.
  bounds(y, r = 0) {
    if (y < CAVE.openEnd) return { left: r, right: WORLD.W - r }; // open water
    const { cx, hw } = this._at(y);
    const n = edgeNoise(y);
    let left = Math.max(r, cx - hw + n * 0.5);
    let right = Math.min(WORLD.W - r, cx + hw - n * 0.5);
    if (right - left < r * 2 + 8) { const c = (left + right) / 2; left = c - r - 4; right = c + r + 4; }
    return { left, right };
  }

  // Widest chamber near a depth — used to seat shipwrecks.
  chamberNear(y) {
    let best = null, bd = Infinity;
    for (const c of this.chambers) {
      const d = Math.abs(c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // Push an entity out of rock walls and pillars. Returns true if it bumped.
  constrain(e) {
    let bumped = false;
    const { left, right } = this.bounds(e.y, e.radius);
    if (e.x < left) { e.x = left; if (e.vx < 0) e.vx *= CAVE.wallDamp; bumped = true; }
    if (e.x > right) { e.x = right; if (e.vx > 0) e.vx *= CAVE.wallDamp; bumped = true; }
    for (const p of this.pillars) {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy), min = p.r + e.radius;
      if (d < min && d > 0.001) {
        const nx = dx / d, ny = dy / d;
        e.x = p.x + nx * min; e.y = p.y + ny * min;
        const vn = e.vx * nx + e.vy * ny;
        if (vn < 0) { e.vx -= vn * nx * 1.2; e.vy -= vn * ny * 1.2; }
        bumped = true;
      }
    }
    return bumped;
  }

  // Is this world point inside solid rock? (harpoon / projectile tests)
  isSolid(x, y) {
    const { left, right } = this.bounds(y, 0);
    if (x < left || x > right) return true;
    for (const p of this.pillars) if (Math.hypot(x - p.x, y - p.y) < p.r) return true;
    return false;
  }

  // ---- rendering -------------------------------------------------------
  draw(ctx, camY) {
    const { W, H } = WORLD;
    const top = camY, bot = camY + H;
    if (bot < CAVE.openEnd) return; // still in open water

    const step = 16;
    const leftPts = [], rightPts = [];
    for (let sy = -step; sy <= H + step; sy += step) {
      const wy = camY + sy;
      const { left, right } = this.bounds(wy, 0);
      leftPts.push([left, sy]);
      rightPts.push([right, sy]);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, PAL.rock);
    grad.addColorStop(1, PAL.rockDark);

    // Left rock mass.
    ctx.beginPath();
    ctx.moveTo(0, -step);
    for (const [x, sy] of leftPts) ctx.lineTo(x, sy);
    ctx.lineTo(0, H + step); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    this._edge(ctx, leftPts, 1);

    // Right rock mass.
    ctx.beginPath();
    ctx.moveTo(W, -step);
    for (const [x, sy] of rightPts) ctx.lineTo(x, sy);
    ctx.lineTo(W, H + step); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    this._edge(ctx, rightPts, -1);

    // Pillars (stalagmite columns).
    for (const p of this.pillars) {
      const sy = p.y - camY;
      if (sy < -80 || sy > H + 80) continue;
      const g = ctx.createRadialGradient(p.x - p.r * 0.3, sy - p.r * 0.3, 2, p.x, sy, p.r);
      g.addColorStop(0, PAL.rockLight); g.addColorStop(1, PAL.rockDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      // craggy blob
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = p.r * (0.82 + 0.18 * Math.sin(a * 3 + p.x));
        const px = p.x + Math.cos(a) * rr, py = sy + Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
  }

  // Highlight + rock-spike detailing along a wall edge. side=+1 left, -1 right.
  _edge(ctx, pts, side) {
    ctx.strokeStyle = PAL.rockEdge; ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach(([x, sy], i) => (i === 0 ? ctx.moveTo(x, sy) : ctx.lineTo(x, sy)));
    ctx.stroke();
    // subtle inner highlight
    ctx.strokeStyle = 'rgba(120,170,210,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, sy], i) => (i === 0 ? ctx.moveTo(x - side * 3, sy) : ctx.lineTo(x - side * 3, sy)));
    ctx.stroke();
    // occasional rock spikes jutting into the corridor
    ctx.fillStyle = PAL.rockDark;
    for (let i = 2; i < pts.length - 2; i += 6) {
      const [x, sy] = pts[i];
      const h = 10 + ((i * 37) % 14);
      ctx.beginPath();
      ctx.moveTo(x, sy - 7);
      ctx.lineTo(x - side * h, sy);
      ctx.lineTo(x, sy + 7);
      ctx.closePath(); ctx.fill();
    }
  }
}
