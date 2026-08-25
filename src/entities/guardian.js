// The Guardian — an armored leviathan coiled around a special chest in the
// reef's deep third. Distinct from the Kraken (own silhouette + palette): a
// heavy oval carapace with a plated brow and glowing eye, plus lashing spines
// that reach for the diver. Its combat interface matches Kraken so the reef's
// harpoon/charge hit-test loops treat both uniformly. Killing it opens the
// chest (handled by the reef).
import { GUARDIAN, PAL } from '../config.js';

const TAU = Math.PI * 2;

export class Guardian {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = GUARDIAN.hp; this.maxHp = GUARDIAN.hp;
    this.radius = GUARDIAN.radius;
    this.t0 = 0;                 // deterministic phase (no rng: keeps tests stable)
    this.hurtT = 0; this.retreat = 0; this.dead = false;
    this._t = 0; this._diver = { x, y };
  }

  update(dt, t, diver, chest) {
    this._t = t; this._diver = diver;
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hp <= 0) { this.retreat += dt; this.y += 30 * dt; if (this.retreat > 1.6) this.dead = true; return; }
    // Orbit slowly around the chest it guards (falls back to a gentle bob).
    const cx = chest ? chest.x : this.x, cy = chest ? chest.y - 44 : this.y;
    const a = t * 0.6 + this.t0;
    this.x = cx + Math.cos(a) * 26;
    this.y = cy + Math.sin(a) * 14;
  }

  // Two lashing spines that straighten toward the diver when it's within range.
  _spine(i, t, diver) {
    const base = (i === 0 ? -0.5 : 0.5) * Math.PI;      // left/right
    let px = this.x + Math.cos(base) * this.radius * 0.7;
    let py = this.y + Math.sin(base) * this.radius * 0.7;
    let dirx = Math.cos(base), diry = Math.sin(base);
    const dx = diver.x - px, dy = diver.y - py, dist = Math.hypot(dx, dy) || 1;
    if (dist < GUARDIAN.range && this.hp > 0) {
      const k = (1 - dist / GUARDIAN.range) * 0.9;
      dirx = dirx * (1 - k) + (dx / dist) * k; diry = diry * (1 - k) + (dy / dist) * k;
      const m = Math.hypot(dirx, diry) || 1; dirx /= m; diry /= m;
    }
    const pts = [[px, py]];
    let ang = Math.atan2(diry, dirx);
    const segs = 5, len = 30;
    for (let s = 1; s <= segs; s++) {
      ang += Math.sin(t * 2.4 + i * 2 + s * 0.6) * 0.22;
      px += Math.cos(ang) * len; py += Math.sin(ang) * len;
      pts.push([px, py]);
    }
    return pts;
  }

  hits(diver) {
    if (this.hp <= 0) return false;
    if (Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius * 0.8) return true;
    for (let i = 0; i < 2; i++) {
      const pts = this._spine(i, this._t, diver);
      for (let s = 2; s < pts.length; s++) if (Math.hypot(diver.x - pts[s][0], diver.y - pts[s][1]) < 16 + diver.radius) return true;
    }
    return false;
  }

  harpoonHit(h) {
    if (this.hp <= 0) return false;
    const tip = h.tip();
    if (Math.hypot(tip.x - this.x, tip.y - this.y) < this.radius) return true;
    for (let i = 0; i < 2; i++) {
      const pts = this._spine(i, this._t, this._diver);
      for (const p of pts) if (Math.hypot(tip.x - p[0], tip.y - p[1]) < 18) return true;
    }
    return false;
  }

  takeDamage(n = 1) { this.hp = Math.max(0, this.hp - n); this.hurtT = 0.28; }

  draw(ctx, camX, camY, t) {
    const hurt = this.hurtT > 0;
    const sx = this.x - camX, sy = this.y - camY;
    ctx.save();
    ctx.globalAlpha = this.hp <= 0 ? Math.max(0, 1 - this.retreat / 1.6) : 1;
    ctx.lineCap = 'round';
    // spines
    for (let i = 0; i < 2; i++) {
      const pts = this._spine(i, t, this._diver);
      ctx.strokeStyle = hurt ? PAL.danger : (PAL.krakenDark || '#3a2a44');
      for (let s = 1; s < pts.length; s++) {
        ctx.lineWidth = 12 - s * 1.6;
        ctx.beginPath(); ctx.moveTo(pts[s - 1][0] - camX, pts[s - 1][1] - camY); ctx.lineTo(pts[s][0] - camX, pts[s][1] - camY); ctx.stroke();
      }
    }
    // armored carapace
    const g = ctx.createRadialGradient(sx - 14, sy - 18, 8, sx, sy, this.radius);
    g.addColorStop(0, hurt ? '#ffd27f' : '#5a6b7a'); g.addColorStop(1, hurt ? PAL.danger : '#26313c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(sx, sy, this.radius * 0.95, this.radius, 0, 0, TAU); ctx.fill();
    // plated ridges
    ctx.strokeStyle = hurt ? '#fff' : (PAL.gold || '#d9a441'); ctx.lineWidth = 3;
    for (const ry of [-0.4, 0, 0.4]) {
      ctx.beginPath(); ctx.ellipse(sx, sy + ry * this.radius, this.radius * 0.7, 8, 0, 0, Math.PI); ctx.stroke();
    }
    // single glowing eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy - 10, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = hurt ? PAL.danger : (PAL.krakenEye || '#ffcf3f'); ctx.beginPath(); ctx.arc(sx, sy - 10, 6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
