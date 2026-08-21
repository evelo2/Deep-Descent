// Ledge-mounted open/close containers. A Shell pulses open and shut, releases a
// big air bubble when it opens, holds loot you grab while it's open, and bites
// (costing a life) if it closes on the diver. Clam and Chest specialise it.
//
// Timing is driven by a normalised cycle phase p∈[0,1). Each subclass shapes p
// into { open, shake }: clams ease open/shut symmetrically; chests rattle (a
// bubble forming), open slowly, hold, then snap shut.
import { SHELL, PAL, shellShape } from '../config.js';
import { drawClam } from '../render/sprites.js';
import { drawChestShell } from '../render/props.js';

class Shell {
  constructor(x, y, radius, cycle) {
    this.x = x; this.y = y; this.radius = radius;
    this.cycleT = cycle;
    this.phaseOffset = Math.random();
    this.open = 0; this.prevOpen = 0; this.shake = 0;
    this.hasLoot = true; this.emptyT = 0;
    this.facing = 1;   // +1 opens/faces right; -1 mirror. Set by placement so a
                       // shell against a side wall opens toward the open water.
  }

  update(dt, t, emitBig) {
    this.prevOpen = this.open;
    const p = ((t / this.cycleT + this.phaseOffset) % 1 + 1) % 1;
    const s = shellShape(p);
    this.open = s.open; this.shake = s.shake;
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
    this.scale = SHELL.clamRadius / 26;   // drawClam is authored ~26px half-wide
  }
  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    ctx.scale(this.scale * this.facing, this.scale);   // flip to open away from a wall
    drawClam(ctx, this.open, this.hasLoot, t, this.shake);
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
    drawChestShell(ctx, this.open, this.hasLoot, t, this.shake);
    ctx.restore();
  }
}
