// Alternate weapon projectiles beyond the harpoon.
//   Net         — a spinning mesh that snares the first creature it touches.
//   DepthCharge — a lobbed mine that sinks under gravity and blasts an area.
import { NET, CHARGE, PAL } from '../config.js';
const TAU = Math.PI * 2;

export class Net {
  constructor(x, y, dx, dy) {
    const m = Math.hypot(dx, dy) || 1;
    this.x = x + (dx / m) * 16; this.y = y + (dy / m) * 16;
    this.vx = (dx / m) * NET.speed; this.vy = (dy / m) * NET.speed;
    this.life = NET.range / NET.speed;
    this.r = NET.r; this.spin = 0; this.dead = false;
  }
  update(dt, cave) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.985; this.vy *= 0.985; this.spin += dt * 5;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (cave && cave.isSolid(this.x, this.y)) this.dead = true;
  }
  hits(c) { return !this.dead && Math.hypot(c.x - this.x, c.y - this.y) < this.r + (c.radius || 14); }
  draw(ctx, camX, camY) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY); ctx.rotate(this.spin);
    ctx.strokeStyle = 'rgba(210,235,250,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * this.r, Math.sin(a) * this.r);
      ctx.lineTo(-Math.cos(a) * this.r, -Math.sin(a) * this.r);
      ctx.moveTo(Math.cos(a + 0.5) * this.r, Math.sin(a + 0.5) * this.r);
      ctx.lineTo(-Math.cos(a + 0.5) * this.r, -Math.sin(a + 0.5) * this.r);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// A drifting supply crate: swim into it to be granted a new weapon, a weapon
// upgrade, or a stash of gold (decided by the game when opened).
export class SupplyCrate {
  constructor(x, y) { this.x = x; this.baseY = y; this.y = y; this.r = 20; this.taken = false; this.phase = Math.random() * TAU; }
  update(dt, t) { this.y = this.baseY + Math.sin(t * 1.4 + this.phase) * 4; }
  reached(d) { return !this.taken && Math.hypot(d.x - this.x, d.y - this.y) < this.r + d.radius; }
  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    const pulse = 0.5 + 0.3 * Math.sin(t * 3 + this.phase);
    const gg = ctx.createRadialGradient(0, 0, 3, 0, 0, 34);
    gg.addColorStop(0, `rgba(255,207,92,${0.22 * pulse})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
    // crate body
    ctx.fillStyle = '#8a6a3c'; ctx.beginPath(); ctx.roundRect(-16, -16, 32, 32, 3); ctx.fill();
    ctx.strokeStyle = '#5e4826'; ctx.lineWidth = 3;
    ctx.strokeRect(-16, -16, 32, 32);
    ctx.beginPath(); ctx.moveTo(-16, -16); ctx.lineTo(16, 16); ctx.moveTo(16, -16); ctx.lineTo(-16, 16); ctx.stroke();
    // glowing "?"
    ctx.fillStyle = PAL.bellLight; ctx.font = '900 18px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 1);
    ctx.restore();
  }
}

export class DepthCharge {
  constructor(x, y, dx, dy) {
    const m = Math.hypot(dx, dy) || 1;
    this.x = x + (dx / m) * 16; this.y = y + (dy / m) * 16;
    this.vx = (dx / m) * CHARGE.speed;
    this.vy = (dy / m) * CHARGE.speed - CHARGE.up;   // a little lob before it sinks
    this.fuse = CHARGE.fuse; this.blast = CHARGE.blast;
    this.r = 9; this.dead = false; this.exploded = false; this.t = 0;
  }
  update(dt, cave) {
    this.t += dt;
    this.vy += CHARGE.gravity * dt; this.vx *= 0.995;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.fuse -= dt;
    if (this.fuse <= 0 || (cave && cave.isSolid(this.x, this.y))) { this.exploded = true; this.dead = true; }
  }
  draw(ctx, camX, camY) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    // spikes
    ctx.strokeStyle = '#4a5560'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); ctx.stroke(); }
    // body
    ctx.fillStyle = '#2b3540'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3c4854'; ctx.beginPath(); ctx.arc(-2, -2, 3, 0, TAU); ctx.fill();
    // blinking fuse light (faster as the fuse runs down)
    const blink = Math.sin(this.t * (10 + (CHARGE.fuse - this.fuse) * 12)) > 0;
    ctx.fillStyle = blink ? PAL.danger : '#611';
    ctx.beginPath(); ctx.arc(0, -11, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
