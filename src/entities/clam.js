// Giant clam anchored to a wall/ledge. It cycles open↔shut. Grab the pearl
// while open; if it snaps shut on you, that's a hit (faithful to the original).
import { drawClam } from '../render/sprites.js';

export class Clam {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hasPearl = true;
    this.open = 0;                 // 0 shut .. 1 fully open
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 0.5 + Math.random() * 0.4;
    this.radius = 26;
    this.dead = false;             // removed once pearl taken (stays as empty shell briefly)
    this.emptyT = 0;
  }

  update(dt, t) {
    // Open/close on a smooth cycle; dwell shut a little longer (danger window).
    const s = Math.sin(t * this.speed + this.phase);
    this.open = Math.max(0, s);    // open only on the positive half → clear "shut" phase
    if (!this.hasPearl) { this.emptyT += dt; }
  }

  // Pearl is collectable only when meaningfully open.
  canTakePearl(diver) {
    if (!this.hasPearl || this.open < 0.5) return false;
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius;
  }
  takePearl() { this.hasPearl = false; }

  // A shut (or shutting) clam bites if the diver is inside it.
  bites(diver) {
    if (this.open > 0.35) return false;
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius * 0.7;
  }

  get gone() { return !this.hasPearl && this.emptyT > 2.5; }

  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    drawClam(ctx, this.open, this.hasPearl, t);
    ctx.restore();
  }
}
