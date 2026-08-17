// Collectable treasure — coins and chests. Bob gently in place until grabbed.
import { drawTreasure } from '../render/sprites.js';

export class Treasure {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;                       // 'coin' | 'chest'
    this.value = kind === 'chest' ? 250 : 60;
    this.radius = kind === 'chest' ? 18 : 10;
    this.phase = Math.random() * Math.PI * 2;
    this.baseY = y;
    this.taken = false;
  }

  update(dt, t) { this.y = this.baseY + Math.sin(t * 1.5 + this.phase) * 4; }

  reached(diver) {
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius;
  }

  draw(ctx, camY, t) {
    ctx.save();
    ctx.translate(this.x, this.y - camY);
    drawTreasure(ctx, this.kind, t + this.phase);
    ctx.restore();
  }
}
