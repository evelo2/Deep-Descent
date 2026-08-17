// Collectable treasure — coins, chests, and gems. Bob gently until grabbed.
import { drawTreasure } from '../render/sprites.js';
import { drawGem } from '../render/props.js';

const VALUE = { coin: 60, chest: 250, gem: 500 };
const RADIUS = { coin: 10, chest: 18, gem: 12 };

export class Treasure {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;                       // 'coin' | 'chest' | 'gem'
    this.value = VALUE[kind] ?? 60;
    this.radius = RADIUS[kind] ?? 10;
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
    if (this.kind === 'gem') drawGem(ctx, t + this.phase);
    else drawTreasure(ctx, this.kind, t + this.phase);
    ctx.restore();
  }
}
