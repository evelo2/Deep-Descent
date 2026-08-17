// A rectangular water current that pushes anything inside it along a flow
// direction — swim with it to be swept through a tunnel, or fight across it.
// Visualised with animated flow streaks clipped to the region.
import { CURRENT, WORLD, PAL } from '../config.js';

export class Current {
  constructor(x, y, w, h, fx, fy) {
    this.x = x; this.y = y; this.w = w; this.h = h;   // top-left + size (world)
    const m = Math.hypot(fx, fy) || 1;
    this.fx = fx / m; this.fy = fy / m;               // unit flow direction
  }

  contains(e) { return e.x > this.x && e.x < this.x + this.w && e.y > this.y && e.y < this.y + this.h; }

  apply(e, dt) {
    if (!this.contains(e)) return;
    e.vx += this.fx * CURRENT.accel * dt;
    e.vy += this.fy * CURRENT.accel * dt;
  }

  draw(ctx, camX, camY, t) {
    const sx = this.x - camX, sy = this.y - camY;
    if (sx > WORLD.W || sy > WORLD.H || sx + this.w < 0 || sy + this.h < 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx, sy, this.w, this.h); ctx.clip();
    ctx.strokeStyle = 'rgba(160,225,255,0.16)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const N = Math.max(12, (this.w * this.h / 5200) | 0);
    const span = this.w + this.h, scroll = (t * 95) % span;
    for (let i = 0; i < N; i++) {
      const rx = ((i * 97) % 1000) / 1000, ry = ((i * 57 + 13) % 1000) / 1000;
      let bx = (rx * this.w + this.fx * scroll) % this.w; if (bx < 0) bx += this.w;
      let by = (ry * this.h + this.fy * scroll) % this.h; if (by < 0) by += this.h;
      const px = this.x + bx - camX, py = this.y + by - camY;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - this.fx * 16, py - this.fy * 16); ctx.stroke();
    }
    // a few direction chevrons drifting along the flow
    ctx.strokeStyle = 'rgba(190,240,255,0.28)'; ctx.lineWidth = 2.5;
    const perpx = -this.fy, perpy = this.fx;
    for (let l = 0; l < 3; l++) {
      const along = ((t * 95 + l * span / 3) % span);
      const cxp = this.x + this.w / 2 + this.fx * (along - span / 2) + perpx * (l - 1) * 34;
      const cyp = this.y + this.h / 2 + this.fy * (along - span / 2) + perpy * (l - 1) * 34;
      const px = cxp - camX, py = cyp - camY;
      ctx.beginPath();
      ctx.moveTo(px - this.fx * 8 + perpx * 7, py - this.fy * 8 + perpy * 7);
      ctx.lineTo(px, py);
      ctx.lineTo(px - this.fx * 8 - perpx * 7, py - this.fy * 8 - perpy * 7);
      ctx.stroke();
    }
    ctx.restore();
  }
}
