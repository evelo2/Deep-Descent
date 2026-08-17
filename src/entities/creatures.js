// Hazard creatures. Each owns its movement behaviour and knows how to draw
// itself. Contact costs the diver a life (handled by the Game).
import { WORLD } from '../config.js';
import { drawOctopus, drawShark, drawJelly, drawPuffer } from '../render/sprites.js';

class Creature {
  constructor(x, y) {
    this.x = x; this.y = y; this.baseY = y;
    this.facing = 1; this.t0 = Math.random() * Math.PI * 2;
    this.radius = 18;
  }
  hits(diver) {
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius * 0.7;
  }
  _wrapX(margin = 60) {
    if (this.x < -margin) this.x = WORLD.W + margin;
    if (this.x > WORLD.W + margin) this.x = -margin;
  }
}

// Cruises horizontally, fastest and most dangerous.
export class Shark extends Creature {
  constructor(x, y) { super(x, y); this.radius = 24; this.speed = 95 + Math.random() * 55; this.dir = Math.random() < 0.5 ? 1 : -1; }
  update(dt, t) {
    this.x += this.speed * this.dir * dt;
    this.y = this.baseY + Math.sin(t * 1.2 + this.t0) * 26;
    this.facing = this.dir;
    this._wrapX(70);
  }
  draw(ctx, camY, t) { blit(ctx, this, camY, drawShark, t); }
}

// Slowly homes toward the diver when nearby; drifts otherwise.
export class Octopus extends Creature {
  constructor(x, y) { super(x, y); this.radius = 20; this.speed = 46; }
  update(dt, t, diver) {
    const dx = diver.x - this.x, dy = diver.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < 230) { this.x += (dx / dist) * this.speed * dt; this.y += (dy / dist) * this.speed * dt; this.baseY = this.y; }
    else { this.x += Math.sin(t * 0.7 + this.t0) * 20 * dt; this.y = this.baseY + Math.sin(t * 0.9 + this.t0) * 18; }
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camY, t) { blit(ctx, this, camY, drawOctopus, t); }
}

// Bobs vertically, drifts slowly sideways.
export class Jelly extends Creature {
  constructor(x, y) { super(x, y); this.radius = 16; this.dir = Math.random() < 0.5 ? 1 : -1; }
  update(dt, t) {
    this.y = this.baseY + Math.sin(t * 0.8 + this.t0) * 40;
    this.x += this.dir * 18 * dt;
    this._wrapX(40);
  }
  draw(ctx, camY, t) { blit(ctx, this, camY, drawJelly, t, false); }
}

// Patrols horizontally, slow.
export class Puffer extends Creature {
  constructor(x, y) { super(x, y); this.radius = 18; this.speed = 40 + Math.random() * 30; this.dir = Math.random() < 0.5 ? 1 : -1; }
  update(dt, t) {
    this.x += this.speed * this.dir * dt;
    this.y = this.baseY + Math.sin(t * 1.6 + this.t0) * 14;
    this.facing = this.dir;
    this._wrapX(50);
  }
  draw(ctx, camY, t) { blit(ctx, this, camY, drawPuffer, t); }
}

function blit(ctx, c, camY, fn, t, flip = true) {
  ctx.save();
  ctx.translate(c.x, c.y - camY);
  if (flip && c.facing < 0) ctx.scale(-1, 1);
  fn(ctx, t + c.t0, false);
  ctx.restore();
}
