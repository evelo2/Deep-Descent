// Dive bell: a deep refuel/bank checkpoint. Swim into the glowing chamber to
// bank carried loot (points + gold) and quickly top up air — no need to surface.
// A brass bell hung from a cable that rises off the top of the screen, with a
// warm interior light and a steady curtain of escaping air bubbles.
import { PAL, BELL } from '../config.js';
const TAU = Math.PI * 2;

export class DiveBell {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = BELL.radius;
    this.phase = Math.random() * TAU;
    this.bubbles = [];
    for (let i = 0; i < 5; i++) this.bubbles.push({ t: Math.random(), off: (Math.random() - 0.5) * 22, sp: 0.5 + Math.random() * 0.4, sz: 1.5 + Math.random() * 2 });
  }

  // The diver is "docked" when inside the bell's chamber.
  contains(d) { return Math.hypot(d.x - this.x, d.y - this.y) < this.r; }

  update(dt) {
    for (const b of this.bubbles) { b.t += dt * b.sp; if (b.t > 1) b.t -= 1; }
  }

  draw(ctx, camX, camY, t) {
    const sx = this.x - camX, sy = this.y - camY;
    ctx.save();
    ctx.translate(sx, sy);

    // Cable rising off the top of the screen.
    ctx.strokeStyle = '#6b7480'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -sy - 40); ctx.stroke();

    // Soft interactive glow.
    const pulse = 0.5 + 0.3 * Math.sin(t * 2 + this.phase);
    const gg = ctx.createRadialGradient(0, 4, 6, 0, 4, 58);
    gg.addColorStop(0, `rgba(255,220,140,${0.28 * pulse})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 4, 58, 0, TAU); ctx.fill();

    // Escaping air bubbles rising from the open rim.
    ctx.fillStyle = 'rgba(200,235,255,0.6)';
    for (const b of this.bubbles) {
      const by = 26 - b.t * 60, bx = b.off * (1 - b.t * 0.4);
      ctx.globalAlpha = 0.6 * (1 - b.t);
      ctx.beginPath(); ctx.arc(bx, by, b.sz, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bell body: a domed brass chamber, open at the bottom.
    ctx.fillStyle = PAL.bellDark;
    ctx.beginPath();
    ctx.moveTo(-30, 24);
    ctx.lineTo(-24, -18);
    ctx.quadraticCurveTo(0, -40, 24, -18);
    ctx.lineTo(30, 24);
    ctx.closePath(); ctx.fill();
    // Brass front plate (lighter).
    ctx.fillStyle = PAL.bell;
    ctx.beginPath();
    ctx.moveTo(-24, 22);
    ctx.lineTo(-19, -15);
    ctx.quadraticCurveTo(0, -34, 19, -15);
    ctx.lineTo(24, 22);
    ctx.closePath(); ctx.fill();
    // Top hook / crown.
    ctx.fillStyle = '#8a6a2c';
    ctx.beginPath(); ctx.roundRect(-6, -40, 12, 8, 3); ctx.fill();

    // Warm light window.
    const lg = ctx.createRadialGradient(0, -6, 2, 0, -6, 15);
    lg.addColorStop(0, PAL.bellLight); lg.addColorStop(1, PAL.bellGlass);
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(0, -6, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b4f1e'; ctx.lineWidth = 2; ctx.stroke();

    // Open rim at the bottom (dark interior the diver enters).
    ctx.fillStyle = 'rgba(10,20,30,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 24, 26, 6, 0, 0, TAU); ctx.fill();

    ctx.restore();
  }
}
