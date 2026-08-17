// The kraken — a boss that lurks in a deep chamber guarding a hoard. Its long
// tentacles undulate and reach for the diver (contact costs a life). Harpoon it
// down over several hits; when its health hits zero it recoils, sinks and drops
// a big reward. Damage/collision use the same per-frame tentacle geometry.
import { KRAKEN, PAL } from '../config.js';

const TAU = Math.PI * 2;

export class Kraken {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = KRAKEN.hp; this.maxHp = KRAKEN.hp;
    this.radius = KRAKEN.radius; this.arms = KRAKEN.arms;
    this.t0 = Math.random() * TAU;
    this.hurtT = 0; this.retreat = 0; this.dead = false;
    this._t = 0; this._diver = { x, y };
  }

  update(dt, t, diver) {
    this._t = t; this._diver = diver;
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hp <= 0) { this.retreat += dt; this.y += 46 * dt; if (this.retreat > 2) this.dead = true; return; }
    // gentle idle bob
    this.y += Math.sin(t * 0.8 + this.t0) * 6 * dt;
  }

  // Points along tentacle i, reaching toward the diver when it's close.
  _arm(i, t, diver) {
    const a = (i / this.arms) * TAU + this.t0;
    let px = this.x + Math.cos(a) * this.radius * 0.8;
    let py = this.y + Math.sin(a) * this.radius * 0.8;
    let dirx = Math.cos(a), diry = Math.sin(a);
    const dx = diver.x - px, dy = diver.y - py, dist = Math.hypot(dx, dy) || 1;
    if (dist < KRAKEN.range && this.hp > 0) {
      const k = (1 - dist / KRAKEN.range) * 0.85;
      dirx = dirx * (1 - k) + (dx / dist) * k; diry = diry * (1 - k) + (dy / dist) * k;
      const m = Math.hypot(dirx, diry) || 1; dirx /= m; diry /= m;
    }
    const pts = [[px, py]];
    let ang = Math.atan2(diry, dirx);
    const segs = 6, len = 30;
    for (let s = 1; s <= segs; s++) {
      ang += Math.sin(t * 3 + i * 1.3 + s * 0.7) * 0.28;
      px += Math.cos(ang) * len; py += Math.sin(ang) * len;
      pts.push([px, py]);
    }
    return pts;
  }

  // Body + tentacle-tip contact with the diver.
  hits(diver) {
    if (this.hp <= 0) return false;
    if (Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius * 0.8) return true;
    for (let i = 0; i < this.arms; i++) {
      const pts = this._arm(i, this._t, diver);
      for (let s = 2; s < pts.length; s++) if (Math.hypot(diver.x - pts[s][0], diver.y - pts[s][1]) < 16 + diver.radius) return true;
    }
    return false;
  }

  // Does a harpoon tip strike the body or a tentacle?
  harpoonHit(h) {
    if (this.hp <= 0) return false;
    const tip = h.tip();
    if (Math.hypot(tip.x - this.x, tip.y - this.y) < this.radius) return true;
    for (let i = 0; i < this.arms; i++) {
      const pts = this._arm(i, this._t, this._diver);
      for (const p of pts) if (Math.hypot(tip.x - p[0], tip.y - p[1]) < 18) return true;
    }
    return false;
  }

  takeDamage(n = 1) { this.hp = Math.max(0, this.hp - n); this.hurtT = 0.28; }

  draw(ctx, camX, camY, t) {
    const hurt = this.hurtT > 0;
    ctx.save();
    ctx.globalAlpha = this.hp <= 0 ? Math.max(0, 1 - this.retreat / 2) : 1;
    // tentacles
    ctx.lineCap = 'round';
    for (let i = 0; i < this.arms; i++) {
      const pts = this._arm(i, t, this._diver);
      ctx.strokeStyle = hurt ? PAL.danger : PAL.kraken;
      for (let s = 1; s < pts.length; s++) {
        ctx.lineWidth = 16 - s * 2;
        ctx.beginPath(); ctx.moveTo(pts[s - 1][0] - camX, pts[s - 1][1] - camY); ctx.lineTo(pts[s][0] - camX, pts[s][1] - camY); ctx.stroke();
      }
      // suckers
      ctx.fillStyle = hurt ? PAL.danger : PAL.krakenDark;
      for (let s = 1; s < pts.length; s += 2) { ctx.beginPath(); ctx.arc(pts[s][0] - camX, pts[s][1] - camY, 2.5, 0, TAU); ctx.fill(); }
    }
    // mantle / head
    const sx = this.x - camX, sy = this.y - camY;
    const g = ctx.createRadialGradient(sx - 12, sy - 16, 6, sx, sy, this.radius);
    g.addColorStop(0, hurt ? '#ff8fb0' : '#9a4f88'); g.addColorStop(1, hurt ? PAL.danger : PAL.kraken);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(sx, sy - 6, this.radius * 0.8, this.radius, 0, 0, TAU); ctx.fill();
    // eyes
    for (const ex of [-20, 20]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx + ex, sy - 8, 12, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = PAL.krakenEye; ctx.beginPath(); ctx.arc(sx + ex, sy - 6, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20140a'; ctx.beginPath(); ctx.ellipse(sx + ex, sy - 6, 2.4, 5, 0, 0, TAU); ctx.fill();
    }
    // brow ridge
    ctx.strokeStyle = PAL.krakenDark; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx - 34, sy - 22); ctx.quadraticCurveTo(sx, sy - 34, sx + 34, sy - 22); ctx.stroke();
    ctx.restore();
  }
}
