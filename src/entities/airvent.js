// Air vent — a teal "bubble clam" mounted on a cave wall. It uses the same
// open/close envelope as the other shells (rattle → slow open → hold → snap):
// while open it streams collectible bubbles up the corridor. Swim into the
// stream to refill air — the lifeline for deep dives.
import { VENT, PAL, shellShape } from '../config.js';

export class AirVent {
  constructor(x, y, side) {
    this.x = x; this.y = y;         // base of the vent, at the wall
    this.side = side;               // +1 opens rightward off a left wall, -1 mirror
    this.cycleT = VENT.cycle;
    this.phaseOffset = Math.random();
    this.open = 0; this.shake = 0;
    this.radius = 22; this._emitAcc = 0;
  }

  update(dt, t, emitBubble) {
    const p = ((t / this.cycleT + this.phaseOffset) % 1 + 1) % 1;
    const s = shellShape(p);
    this.open = s.open; this.shake = s.shake;
    if (this.open > 0.2) {
      this._emitAcc += dt * (8 + this.open * 30);
      while (this._emitAcc > 1) {
        this._emitAcc -= 1;
        const bx = this.x + this.side * (10 + Math.random() * 14);
        emitBubble(bx, this.y - 6, 2 + Math.random() * 3);
      }
    }
  }

  // Is the diver inside the flowing stream right now?
  collects(diver) {
    if (this.open < 0.25) return false;
    const inX = Math.abs(diver.x - (this.x + this.side * 16)) < VENT.streamHalfW + diver.radius;
    const inY = diver.y < this.y + 6 && diver.y > this.y - VENT.streamHeight;
    return inX && inY;
  }

  draw(ctx, camX, camY, t) {
    const f = this.open;
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    ctx.scale(this.side, 1);
    if (this.shake > 0.02) ctx.translate(Math.sin(t * 40) * 1.3 * this.shake, 0);

    // rising stream while flowing
    if (f > 0.15) {
      const g = ctx.createLinearGradient(16, 0, 16, -VENT.streamHeight);
      g.addColorStop(0, `rgba(150,235,255,${0.18 * f})`);
      g.addColorStop(1, 'rgba(150,235,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(16 - VENT.streamHalfW, -VENT.streamHeight, VENT.streamHalfW * 2, VENT.streamHeight);
    }

    // teal shells hinged at the wall (x=0), fanning into the corridor
    const jitter = this.shake > 0.02 ? Math.sin(t * 46) * 0.05 * this.shake : 0;
    ventHalf(1, f * 0.4 + jitter);
    ventHalf(-1, f + jitter);
    ctx.restore();

    function ventHalf(dir, rot) {
      ctx.save();
      ctx.rotate(-rot * dir);
      const grad = ctx.createLinearGradient(0, -16 * dir, 0, 2 * dir);
      grad.addColorStop(0, PAL.ventClam); grad.addColorStop(1, PAL.ventClamDk);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(20, -18 * dir, 40, -2 * dir);
      ctx.quadraticCurveTo(20, -5 * dir, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.moveTo(2, -1 * dir);
        ctx.quadraticCurveTo(i * 11, -14 * dir, i * 12, -2 * dir); ctx.stroke();
      }
      ctx.fillStyle = PAL.ventClamDk; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
