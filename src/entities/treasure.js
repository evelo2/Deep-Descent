// Collectable treasure — coins, chests, gems, and Black Pearls. Bob gently
// until grabbed.
import { drawTreasure, drawBlackPearl } from '../render/sprites.js';
import { drawGem } from '../render/props.js';

// 'blackpearl' carries no in-run loot value — it's the rare Salvage-Log
// collectible, tracked separately (Game#carriedPearls) and never added to
// `carried`. Its VALUE/RADIUS entries exist only so generic lookups don't break.
const VALUE = { coin: 60, chest: 250, gem: 500, blackpearl: 0 };
const RADIUS = { coin: 10, chest: 18, gem: 12, blackpearl: 11 };

export class Treasure {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;                       // 'coin' | 'chest' | 'gem' | 'blackpearl'
    this.value = VALUE[kind] ?? 60;
    this.radius = RADIUS[kind] ?? 10;
    this.phase = Math.random() * Math.PI * 2;
    this.baseY = y;
    this.taken = false;
    this.pearl = kind === 'blackpearl';     // flags this as the meta-currency collectible
    this.locked = false;                    // vault loot: gated behind the temple key until opened
  }

  update(dt, t) { this.y = this.baseY + Math.sin(t * 1.5 + this.phase) * 4; }

  reached(diver) {
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius;
  }

  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    if (this.kind === 'blackpearl') drawBlackPearl(ctx, t + this.phase);
    else if (this.kind === 'gem') drawGem(ctx, t + this.phase);
    else drawTreasure(ctx, this.kind, t + this.phase);
    ctx.restore();
  }
}
