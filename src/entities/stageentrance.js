// A reef-side entrance to a platformer stage. Its look advertises the theme
// behind it: a large shipwreck (→ ship stage) or a rocky cave mouth (→ lair).
// Occupies the rare one-special-per-reef slot; one-shot (removed on exit).
import { STAGE, PAL } from '../config.js';

const TAU = Math.PI * 2;

export class StageEntrance {
  constructor(x, y, theme) {
    this.x = x; this.y = y; this.theme = theme; this.r = STAGE.entranceR;
  }
  contains(diver) {
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.r + diver.radius;
  }
  draw(ctx, camX, camY, t) {
    const sx = this.x - camX, sy = this.y - camY, p = this.theme.palette;
    ctx.save();
    ctx.translate(sx, sy);
    // inviting glow
    const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, this.r + 26);
    glow.addColorStop(0, `rgba(143,230,255,${0.28 + 0.12 * Math.sin(t * 3)})`);
    glow.addColorStop(1, 'rgba(143,230,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, this.r + 26, 0, TAU); ctx.fill();

    if (this.theme.entrance === 'wreck') {
      // tilted hull with a dark doorway
      ctx.rotate(-0.14);
      ctx.fillStyle = p.solid;
      ctx.beginPath(); ctx.moveTo(-90, 30); ctx.quadraticCurveTo(-70, -46, 40, -40);
      ctx.quadraticCurveTo(96, -30, 84, 34); ctx.quadraticCurveTo(0, 54, -90, 30); ctx.fill();
      ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 4; ctx.stroke();
      // planks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
      for (let i = -1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-84, i * 14 + 6); ctx.lineTo(78, i * 14 - 2); ctx.stroke(); }
      // doorway
      ctx.fillStyle = '#05080d';
      ctx.beginPath(); ctx.ellipse(-6, 2, this.r * 0.7, this.r, 0, 0, TAU); ctx.fill();
    } else {
      // rocky cave mouth
      ctx.fillStyle = p.solid;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 30, Math.PI, 0); ctx.lineTo(this.r + 30, 40); ctx.lineTo(-this.r - 30, 40); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = '#05080d';
      ctx.beginPath(); ctx.ellipse(0, 6, this.r * 0.9, this.r, 0, 0, TAU); ctx.fill();
      // a few neon flecks
      ctx.fillStyle = p.ladder;
      for (let i = 0; i < 4; i++) { const a = t + i * 1.7; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(a * 2); ctx.beginPath(); ctx.arc(Math.cos(a) * 18, 4 + Math.sin(a) * 10, 1.6, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
