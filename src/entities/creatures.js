// Hazard creatures. Each owns its movement behaviour and knows how to draw
// itself. Contact costs the diver a life (handled by the Game). Movement is in
// the 2D world; the Game confines them to the cave via the Cave collider.
import { WORLD, SHARK, KILL_POINTS, CREATURES } from '../config.js';
import { drawOctopus, drawShark, drawJelly, drawPuffer, drawAngler, drawEel, drawPiranha } from '../render/sprites.js';

class Creature {
  constructor(x, y) {
    this.x = x; this.y = y; this.baseY = y;
    this.facing = 1; this.t0 = Math.random() * Math.PI * 2;
    this.radius = 18; this.scale = 1;
    this.snareT = 0;   // >0 while netted/stunned: frozen and harmless
  }
  get points() { return KILL_POINTS[this.constructor.name] ?? 100; }
  hits(diver) {
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius * 0.7;
  }
  // Reverse a horizontal mover at the world edges (cave walls are handled by the
  // Game's collider).
  _edgeBounce() {
    if (this.x < this.radius) { this.x = this.radius; this.dir = 1; }
    if (this.x > WORLD.WW - this.radius) { this.x = WORLD.WW - this.radius; this.dir = -1; }
  }
}

// Cruises horizontally. Comes in sizes — small darters to big hunters.
export class Shark extends Creature {
  constructor(x, y, scale = 1) {
    super(x, y);
    this.scale = scale;
    this.radius = 24 * scale;
    this.speed = (110 - scale * 22) + Math.random() * 40; // bigger = a touch slower
    this.dir = Math.random() < 0.5 ? 1 : -1;
  }
  get points() { return Math.round(220 * this.scale); }
  update(dt, t) {
    this.x += this.speed * this.dir * dt;
    this.y = this.baseY + Math.sin(t * 1.2 + this.t0) * 26 * this.scale;
    this.facing = this.dir;
    this._edgeBounce();
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawShark, t); }
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
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawOctopus, t); }
}

// Bobs vertically, drifts slowly sideways.
export class Jelly extends Creature {
  constructor(x, y) { super(x, y); this.radius = 16; this.dir = Math.random() < 0.5 ? 1 : -1; }
  update(dt, t) {
    this.y = this.baseY + Math.sin(t * 0.8 + this.t0) * 40;
    this.x += this.dir * 18 * dt;
    this._edgeBounce();
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawJelly, t, false); }
}

// Patrols horizontally, slow.
export class Puffer extends Creature {
  constructor(x, y) { super(x, y); this.radius = 18; this.speed = 40 + Math.random() * 30; this.dir = Math.random() < 0.5 ? 1 : -1; }
  update(dt, t) {
    this.x += this.speed * this.dir * dt;
    this.y = this.baseY + Math.sin(t * 1.6 + this.t0) * 14;
    this.facing = this.dir;
    this._edgeBounce();
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawPuffer, t); }
}

// Anglerfish — deep-sea; drifts, then homes slowly, lured glow leading.
export class Angler extends Creature {
  constructor(x, y) { super(x, y); this.radius = 20; this.speed = 38; }
  update(dt, t, diver) {
    const dx = diver.x - this.x, dy = diver.y - this.y, dist = Math.hypot(dx, dy) || 1;
    if (dist < 260) { this.x += (dx / dist) * this.speed * dt; this.y += (dy / dist) * this.speed * dt; this.baseY = this.y; }
    else { this.x += Math.sin(t * 0.6 + this.t0) * 16 * dt; this.y = this.baseY + Math.sin(t * 0.7 + this.t0) * 14; }
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawAngler, t); }
}

// Moray eel — fast horizontal patroller deep in the caves.
export class Eel extends Creature {
  constructor(x, y) { super(x, y); this.radius = 15; this.speed = 55 + Math.random() * 35; this.dir = Math.random() < 0.5 ? 1 : -1; }
  update(dt, t) {
    this.x += this.speed * this.dir * dt;
    this.y = this.baseY + Math.sin(t * 1.1 + this.t0) * 20;
    this.facing = this.dir;
    this._edgeBounce();
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawEel, t); }
}

// Piranha — small swarm hazard: fast, homes on the diver with a jittery dart.
// Spawned in clusters (see spawn.js); low value each, dangerous in numbers.
export class Piranha extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.piranha.radius; }
  update(dt, t, diver) {
    const P = CREATURES.piranha, dx = diver.x - this.x, dy = diver.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * P.speed * dt + Math.cos(t * 3 + this.t0) * P.jitter * dt;
    this.y += (dy / d) * P.speed * dt + Math.sin(t * 3.3 + this.t0) * P.jitter * dt;
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawPiranha, t); }
}

function blit(ctx, c, camX, camY, fn, t, flip = true) {
  ctx.save();
  ctx.translate(c.x - camX, c.y - camY);
  if (c.scale !== 1) ctx.scale(c.scale, c.scale);
  if (flip && c.facing < 0) ctx.scale(-1, 1);
  fn(ctx, t + c.t0, false);
  ctx.restore();
}
