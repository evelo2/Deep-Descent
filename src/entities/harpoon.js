// The diver's harpoon — a spear fired along the aim direction. Spears creatures,
// sticks into rock, fizzles after a short range. World coordinates.
import { HARPOON, PAL } from '../config.js';

export class Harpoon {
  constructor(x, y, ax, ay) {
    const m = Math.hypot(ax, ay) || 1;
    this.dx = ax / m; this.dy = ay / m;
    this.angle = Math.atan2(this.dy, this.dx);
    // spawn slightly ahead of the diver
    this.x = x + this.dx * 14;
    this.y = y + this.dy * 14;
    this.vx = this.dx * HARPOON.speed;
    this.vy = this.dy * HARPOON.speed;
    this.life = HARPOON.life;
    this.dead = false;
    this.radius = 6;
  }

  update(dt, terrain) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    const t = this.tip();
    if (terrain && terrain.isSolid(t.x, t.y)) { this.dead = true; this.stuck = true; }
  }

  tip() {
    const h = HARPOON.length / 2;
    return { x: this.x + this.dx * h, y: this.y + this.dy * h };
  }

  hits(c) {
    const t = this.tip();
    return Math.hypot(t.x - c.x, t.y - c.y) < c.radius + this.radius;
  }

  draw(ctx, camX, camY) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    ctx.rotate(this.angle);
    const h = HARPOON.length / 2;
    // shaft
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h - 5, 0); ctx.stroke();
    // barbed tip
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath();
    ctx.moveTo(h, 0); ctx.lineTo(h - 8, -5); ctx.lineTo(h - 5, 0); ctx.lineTo(h - 8, 5);
    ctx.closePath(); ctx.fill();
    // fletching
    ctx.strokeStyle = PAL.harpoonTip; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(-h - 4, -4);
    ctx.moveTo(-h, 0); ctx.lineTo(-h - 4, 4); ctx.stroke();
    ctx.restore();
  }
}
