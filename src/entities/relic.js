// The reef's relic objective. Find it, carry it to the boat and bank it to
// unlock sailing on (or grind the high points goal instead).
import { drawRelic } from '../render/props.js';

export class Relic {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.baseY = y; this.type = type;
    this.phase = Math.random() * Math.PI * 2;
    this.taken = false; this.radius = 22;
  }
  update(dt, t) { this.y = this.baseY + Math.sin(t * 1.3 + this.phase) * 5; }
  reached(d) { return Math.hypot(d.x - this.x, d.y - this.y) < this.radius + d.radius; }
  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    drawRelic(ctx, this.type, t + this.phase);
    ctx.restore();
  }
}
