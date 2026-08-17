// The player diver. Lives in world coordinates: x across the playfield,
// y as absolute depth (SURFACE at top → increasing downward).
import { WORLD, DIVER } from '../config.js';
import { drawDiver } from '../render/sprites.js';

export class Diver {
  constructor() { this.reset(); }

  reset() {
    this.x = WORLD.WW / 2;
    this.y = WORLD.SURFACE + 40;
    this.vx = 0; this.vy = 0;
    this.facing = 1;      // +1 right, -1 left
    this.kick = 0;        // fin animation phase
    this.hurtT = 0;       // red-flash timer
    this.invuln = 0;      // mercy invulnerability timer
    this.aimX = 1; this.aimY = 0; // harpoon aim (last travel dir, else facing)
  }

  get radius() { return DIVER.radius; }
  get atSurface() { return this.y <= WORLD.SURFACE + 60; }

  update(dt, intent, emitBubble, speedMul = 1) {
    // Thrust from intent (boosted by speed fins).
    this.vx += intent.x * DIVER.accel * speedMul * dt;
    this.vy += intent.y * DIVER.accel * speedMul * dt;
    // Buoyancy — gentle lift, stronger the more you rise near surface.
    this.vy -= DIVER.buoyancy * dt;
    // Drag.
    const d = Math.max(0, 1 - DIVER.drag * dt);
    this.vx *= d; this.vy *= d;
    // Clamp speed.
    const maxSp = DIVER.maxSpeed * speedMul;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxSp) { this.vx *= maxSp / sp; this.vy *= maxSp / sp; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // World bounds (cave walls are handled separately by the Cave collider).
    const r = this.radius;
    this.x = Math.max(r, Math.min(WORLD.WW - r, this.x));
    if (this.y < WORLD.SURFACE) { this.y = WORLD.SURFACE; if (this.vy < 0) this.vy = 0; }
    if (this.y > WORLD.WH - r) { this.y = WORLD.WH - r; if (this.vy > 0) this.vy = 0; }

    // Facing + animation.
    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
    this.kick += (sp * 0.03 + 3) * dt;

    // Aim follows the direction of travel; falls back to facing when drifting.
    if (sp > 24) { this.aimX = this.vx / sp; this.aimY = this.vy / sp; }
    else { this.aimX = this.facing; this.aimY = 0; }

    // Trailing bubbles.
    this._bubT = (this._bubT || 0) + dt;
    if (this._bubT > 0.28) { this._bubT = 0; emitBubble(this.x - this.facing * 12, this.y - 4); }

    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
  }

  hit() { this.hurtT = 0.4; this.invuln = 1.6; this.vx *= -0.6; this.vy = -60; }

  draw(ctx, camX, camY) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    if (this.facing < 0) ctx.scale(-1, 1);
    // Blink while invulnerable.
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    drawDiver(ctx, 0, this.kick, this.hurtT > 0);
    ctx.restore();
  }
}
