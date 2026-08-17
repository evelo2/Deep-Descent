// Lightweight particle system for bubbles and sparkles (game feel / juice).
import { PAL } from '../config.js';

export class Particles {
  constructor() { this.items = []; }

  // Rising bubble (wobbles upward, shrinks).
  bubble(x, y, opts = {}) {
    this.items.push({
      kind: 'bubble', x, y,
      vx: (Math.random() - 0.5) * 20,
      vy: -(30 + Math.random() * 40),
      r: opts.r ?? (2 + Math.random() * 4),
      life: opts.life ?? (1.4 + Math.random() * 1.2),
      age: 0, wob: Math.random() * Math.PI * 2,
    });
  }

  // Burst of sparkles (treasure pickup).
  sparkle(x, y, color = PAL.gold, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const sp = 60 + Math.random() * 140;
      this.items.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.5 + Math.random() * 2.5,
        life: 0.5 + Math.random() * 0.4, age: 0, color,
      });
    }
  }

  update(dt) {
    const keep = [];
    for (const p of this.items) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.kind === 'bubble') {
        p.wob += dt * 6;
        p.x += (p.vx + Math.sin(p.wob) * 14) * dt;
        p.y += p.vy * dt;
      } else {
        p.vx *= 0.90; p.vy = p.vy * 0.90 + 40 * dt; // slight sink
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      keep.push(p);
    }
    this.items = keep;
  }

  // Particles hold world coordinates; the camera converts to screen space.
  draw(ctx, camX = 0, camY = 0) {
    for (const p of this.items) {
      const k = 1 - p.age / p.life;
      const sx = p.x - camX, sy = p.y - camY;
      if (p.kind === 'bubble') {
        ctx.beginPath();
        ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(190,235,255,${0.5 * k})`;
        ctx.lineWidth = 1;
        ctx.fillStyle = `rgba(160,220,255,${0.12 * k})`;
        ctx.fill(); ctx.stroke();
        // highlight
        ctx.beginPath();
        ctx.arc(sx - p.r * 0.3, sy - p.r * 0.3, p.r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.6 * k})`;
        ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}
