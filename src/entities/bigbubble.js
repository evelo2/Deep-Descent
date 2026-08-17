// A big collectible air bubble, released when a shell opens. It rises and
// wobbles; collecting it refills a chunk of air. Pops on the ceiling or timeout.
import { BUBBLE, WORLD } from '../config.js';

export class BigBubble {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = BUBBLE.r * (0.85 + Math.random() * 0.4);
    this.radius = this.r;
    this.vy = -BUBBLE.rise * (0.85 + Math.random() * 0.3);
    this.wob = Math.random() * Math.PI * 2;
    this.life = BUBBLE.life;
    this.dead = false;
  }

  update(dt, cave) {
    this.wob += dt * 2.5;
    this.x += Math.sin(this.wob) * 12 * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.y < WORLD.SURFACE + 6) this.dead = true;
    if (cave && cave.isSolid(this.x, this.y - this.r)) this.dead = true; // bumped the ceiling
  }

  collected(d) { return Math.hypot(d.x - this.x, d.y - this.y) < this.r + d.radius; }

  draw(ctx, camX, camY) {
    const sx = this.x - camX, sy = this.y - camY;
    const wob = Math.sin(this.wob * 2) * 1.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(190,235,255,0.8)'; ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(150,220,255,0.18)';
    ctx.beginPath(); ctx.ellipse(sx, sy, this.r + wob, this.r - wob, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx - this.r * 0.32, sy - this.r * 0.32, this.r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    ctx.restore();
  }
}
