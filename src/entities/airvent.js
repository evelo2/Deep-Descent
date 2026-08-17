// Air vent — a "bubble clam" seated on a ledge/wall that pulses open and emits
// a rising column of bubbles. Swim into the stream while it's flowing to refill
// air. This is how you survive deep cave dives without returning to the surface.
import { VENT, PAL } from '../config.js';

export class AirVent {
  constructor(x, y, side) {
    this.x = x; this.y = y;         // base of the vent (at the wall)
    this.side = side;               // +1 opens rightward off left wall, -1 mirror
    this.phase = Math.random() * Math.PI * 2;
    this.radius = 20;
    this._emitAcc = 0;
  }

  // 0 (shut) .. 1 (fully flowing), pulsing like the pearl clams.
  flow(t) { return Math.max(0, Math.sin(t * (Math.PI * 2 / VENT.cycle) + this.phase)); }

  update(dt, t, emitBubble) {
    const f = this.flow(t);
    if (f > 0.15) {
      this._emitAcc += dt * (10 + f * 26);
      while (this._emitAcc > 1) {
        this._emitAcc -= 1;
        const bx = this.x + this.side * (6 + Math.random() * 10);
        emitBubble(bx, this.y - 6, 2 + Math.random() * 3);
      }
    }
  }

  // Is the diver inside the flowing stream right now?
  collects(diver, t) {
    if (this.flow(t) < 0.2) return false;
    const inX = Math.abs(diver.x - (this.x + this.side * 12)) < VENT.streamHalfW + diver.radius;
    const inY = diver.y < this.y + 6 && diver.y > this.y - VENT.streamHeight;
    return inX && inY;
  }

  draw(ctx, camY, t) {
    const sy = this.y - camY;
    const f = this.flow(t);
    ctx.save();
    ctx.translate(this.x, sy);
    ctx.scale(this.side, 1);
    // stream glow while flowing
    if (f > 0.15) {
      const g = ctx.createLinearGradient(12, 0, 12, -VENT.streamHeight);
      g.addColorStop(0, `rgba(150,235,255,${0.16 * f})`);
      g.addColorStop(1, 'rgba(150,235,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(12 - VENT.streamHalfW, -VENT.streamHeight, VENT.streamHalfW * 2, VENT.streamHeight);
    }
    // vent clam shell (teal, distinct from pearl clams)
    const ang = 0.1 + f * 0.7;
    for (const dir of [1, -1]) {
      ctx.save();
      ctx.rotate(-ang * dir * 0.5);
      const grad = ctx.createLinearGradient(0, -14 * dir, 0, 4 * dir);
      grad.addColorStop(0, PAL.ventClam); grad.addColorStop(1, PAL.ventClamDk);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-20, 2 * dir);
      ctx.quadraticCurveTo(0, -16 * dir, 20, 2 * dir);
      ctx.quadraticCurveTo(0, 7 * dir, -20, 2 * dir);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}
