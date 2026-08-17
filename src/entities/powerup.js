// Floating power-up pickups. 'tank' permanently raises max air for the run;
// 'multifire' grants a timed 3-way harpoon spread.
import { PAL } from '../config.js';
const TAU = Math.PI * 2;

export class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.baseY = y;
    this.type = type; this.phase = Math.random() * TAU;
    this.taken = false; this.radius = 16;
  }
  update(dt, t) { this.y = this.baseY + Math.sin(t * 1.5 + this.phase) * 5; }
  reached(d) { return Math.hypot(d.x - this.x, d.y - this.y) < this.radius + d.radius; }

  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    const col = this.type === 'tank' ? PAL.air : PAL.harpoonTip;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + Math.sin(t * 3 + this.phase) * 0.18; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (this.type === 'tank') tank(ctx); else multi(ctx);
    ctx.restore();
  }
}

function tank(ctx) {
  ctx.fillStyle = '#3fae9a';
  ctx.beginPath(); ctx.roundRect(-9, -13, 18, 26, 7); ctx.fill();
  ctx.fillStyle = '#2b7d6f'; ctx.fillRect(-9, -2, 18, 4);
  ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.roundRect(-3, -18, 6, 6, 2); ctx.fill(); // valve
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-9, -13, 18, 26, 7); ctx.stroke();
  ctx.fillStyle = '#eaf6ff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', 0, 1);
}

function multi(ctx) {
  for (const a of [-0.45, 0, 0.45]) {
    ctx.save(); ctx.rotate(a);
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -8); ctx.stroke();
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-5, -7); ctx.lineTo(5, -7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
