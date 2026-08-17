// Ledge-mounted open/close containers. A Shell pulses open and shut, releases a
// big air bubble each time it opens, holds loot you grab while it's open, and
// bites (costing a life) if it closes on the diver. Clam and Chest specialise it.
import { SHELL, PAL } from '../config.js';
import { drawClam } from '../render/sprites.js';
import { drawChestShell } from '../render/props.js';

const TAU = Math.PI * 2;

class Shell {
  constructor(x, y, radius, cycle) {
    this.x = x; this.y = y; this.radius = radius;
    this.w = TAU / cycle;
    this.phase = Math.random() * TAU;
    this.open = 0; this.prevOpen = 0;
    this.hasLoot = true; this.emptyT = 0;
  }

  update(dt, t, emitBig) {
    this.prevOpen = this.open;
    // Saturating sine → a clear shut dwell (whole negative half) and an open
    // dwell (near the peak), with smooth ramps between.
    this.open = Math.max(0, Math.min(1, Math.sin(t * this.w + this.phase) * 1.6));
    // Release a big air bubble as it swings open.
    if (this.prevOpen < 0.5 && this.open >= 0.5) emitBig(this.x, this.y - this.radius * 0.35);
    if (!this.hasLoot) this.emptyT += dt;
  }

  _near(d, f = 1) { return Math.hypot(d.x - this.x, d.y - this.y) < this.radius * f + d.radius * 0.6; }
  canTakeLoot(d) { return this.hasLoot && this.open > SHELL.openGrab && this._near(d, 0.9); }
  takeLoot() { this.hasLoot = false; return this.lootValue; }
  // Dangerous even once emptied — a closing shell always bites.
  bites(d) { return this.open < SHELL.biteShut && this._near(d, 0.7); }
}

export class Clam extends Shell {
  constructor(x, y) {
    super(x, y, SHELL.clamRadius, SHELL.clamCycle);
    this.lootValue = 400; this.lootColor = PAL.pearl;
    this.scale = SHELL.clamRadius / 28;   // drawClam is authored ~28px wide
  }
  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    ctx.scale(this.scale, this.scale);
    drawClam(ctx, this.open, this.hasLoot, t);
    ctx.restore();
  }
}

export class Chest extends Shell {
  constructor(x, y, value) {
    super(x, y, SHELL.chestRadius, SHELL.chestCycle);
    this.lootValue = value; this.lootColor = PAL.gold;
  }
  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    drawChestShell(ctx, this.open, this.hasLoot, t);
    ctx.restore();
  }
}
