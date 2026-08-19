// Hazard creatures. Each owns its movement behaviour and knows how to draw
// itself. Contact costs the diver a life (handled by the Game). Movement is in
// the 2D world; the Game confines them to the cave via the Cave collider.
import { WORLD, SHARK, KILL_POINTS, CREATURES } from '../config.js';
import { drawOctopus, drawShark, drawJelly, drawPuffer, drawAngler, drawEel, drawPiranha, drawStonefish, drawBarracuda, drawMoray, drawElectricRay, drawGrouper, drawUrchin, drawGiantSquid, drawParasite, drawSentinel } from '../render/sprites.js';

class Creature {
  constructor(x, y) {
    this.x = x; this.y = y; this.baseY = y;
    this.facing = 1; this.t0 = Math.random() * Math.PI * 2;
    this.radius = 18; this.scale = 1;
    this.snareT = 0;   // >0 while netted/stunned: frozen and harmless
  }
  // Kill value. `_pointsOverride` lets a killing hit award a custom total (e.g.
  // a shoal folds its whole swarm's value onto the fish that clears it).
  get points() { return this._pointsOverride ?? (KILL_POINTS[this.constructor.name] ?? 100); }
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
  constructor(x, y) { super(x, y); this.radius = CREATURES.piranha.radius; this.hurtT = 0; }
  // Shoal group-death: hits drain the SHARED pool (`this.shoal`, linked at spawn);
  // when it empties, the whole swarm dies at once and this striker is credited
  // with the shoal's combined points (scored once at the weapon-hit call site).
  // A lone piranha with no shoal just dies in one hit. Routing through takeDamage
  // means every weapon path (harpoon/blast/shock) already handles it — those
  // sites branch on `cr.takeDamage`.
  takeDamage(n = 1) {
    this.hurtT = 0.2;
    const s = this.shoal;
    if (!s) { this.dead = true; return; }
    s.hp -= n;
    if (s.hp <= 0) {
      let total = 0;
      for (const u of s.units) if (!u.dead) { total += KILL_POINTS.Piranha ?? 100; u.dead = true; }
      this._pointsOverride = total;
    }
  }
  update(dt, t, diver) {
    const P = CREATURES.piranha, dx = diver.x - this.x, dy = diver.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.x += (dx / d) * P.speed * dt + Math.cos(t * 3 + this.t0) * P.jitter * dt;
    this.y += (dy / d) * P.speed * dt + Math.sin(t * 3.3 + this.t0) * P.jitter * dt;
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawPiranha, t); }
}

// Stonefish — camouflaged bottom-dweller: near-invisible until lit (flare/
// torch, passed in via `lit`) or the diver strays within revealRange; barely
// moves. Contact always damages regardless of `revealed` — camouflage only
// hides it, it doesn't make it safe to bump into.
export class Stonefish extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.stonefish.radius; this.revealed = false; }
  update(dt, t, diver, lit) {
    const d = Math.hypot(diver.x - this.x, diver.y - this.y);
    this.revealed = !!lit || d < CREATURES.stonefish.revealRange;
    this.y = this.baseY + Math.sin(t * 0.5 + this.t0) * 2;   // barely moves
  }
  draw(ctx, camX, camY, t) {
    ctx.save(); ctx.globalAlpha = this.revealed ? 1 : CREATURES.stonefish.hiddenAlpha;
    blit(ctx, this, camX, camY, drawStonefish, t); ctx.restore();
  }
}

// Barracuda — charger: patrols horizontally; when the diver lines up (in
// sightRange + vertically within alignBand) it winds up (a visible tell,
// rearing back), then dashes straight at them, then recovers. A snare
// cancels a windup/dash — a stunned barracuda can't charge.
export class Barracuda extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.barracuda.radius; this.dir = Math.random() < 0.5 ? 1 : -1; this.state = 'patrol'; this.timer = 0; this.dashY = y; }
  update(dt, t, diver) {
    const P = CREATURES.barracuda;
    if (this.snareT > 0) { this.state = 'patrol'; return; }   // stunned: no dash
    this.timer -= dt;
    if (this.state === 'patrol') {
      this.x += P.patrolSpeed * this.dir * dt; this.y = this.baseY + Math.sin(t * 1.3 + this.t0) * 16; this.facing = this.dir; this._edgeBounce();
      const dx = diver.x - this.x, dy = diver.y - this.y;
      if (Math.abs(dx) < P.sightRange && Math.abs(dy) < P.alignBand) { this.state = 'windup'; this.timer = P.windupTime; this.dir = dx >= 0 ? 1 : -1; this.facing = this.dir; this.dashY = diver.y; }
    } else if (this.state === 'windup') {
      this.x -= P.patrolSpeed * 0.4 * this.dir * dt;                       // rear back (tell)
      if (this.timer <= 0) { this.state = 'dash'; this.timer = P.dashTime; }
    } else if (this.state === 'dash') {
      this.x += P.dashSpeed * this.dir * dt;
      this.y += Math.sign(this.dashY - this.y) * Math.min(Math.abs(this.dashY - this.y), P.dashSpeed * 0.4 * dt);
      this.facing = this.dir; this._edgeBounce();
      if (this.timer <= 0) { this.state = 'recover'; this.timer = P.recover; }
    } else { this.x += P.patrolSpeed * 0.5 * this.dir * dt; if (this.timer <= 0) this.state = 'patrol'; }
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawBarracuda, t); }
}

// Moray — ambusher: anchored in a wall/wreck crevice, hidden at (ax, ay)
// until the diver enters strikeRange, then lunges its head out toward them
// (a 0→reach→0 curve over strikeTime) and retracts, with a cooldown before
// it can strike again. Only the extended head is the hazard — hidden, it
// sits at the anchor inside the wall where the diver can't reach.
export class Moray extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.moray.radius; this.ax = x; this.ay = y; this.state = 'hidden'; this.timer = 0; }
  update(dt, t, diver) {
    const P = CREATURES.moray;
    if (this.snareT > 0) return;
    const dx = diver.x - this.ax, dy = diver.y - this.ay, d = Math.hypot(dx, dy) || 1;
    this.facing = dx >= 0 ? 1 : -1; this.timer -= dt;
    if (this.state === 'hidden') {
      this.x = this.ax; this.y = this.ay;
      if (d < P.strikeRange && this.timer <= 0) { this.state = 'strike'; this.timer = P.strikeTime; this.dirx = dx / d; this.diry = dy / d; }
    } else {
      const k = 1 - Math.abs(this.timer / P.strikeTime - 0.5) * 2;        // 0→1→0 lunge
      this.x = this.ax + this.dirx * P.reach * k; this.y = this.ay + this.diry * P.reach * k;
      if (this.timer <= 0) { this.state = 'hidden'; this.timer = P.cooldown; }
    }
  }
  // Only the extended head is a hazard — while hidden the moray is retracted into
  // its crevice and can't bite (its body sits at the anchor, not out in the open).
  hits(diver) { return this.state === 'strike' && super.hits(diver); }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawMoray, t); }
}

// Electric Ray — ranged drifter: drifts slowly and periodically emits an
// expanding pulse ring. Both its body AND the ring's leading edge (a band
// `band` px wide, centred at `pulseR`) are hazards, so hits() is overridden
// rather than relying on the base body-contact check alone. No projectile
// system involved — the ring is checked directly against the diver's
// distance, and drawn as a widening stroke while active.
export class ElectricRay extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.ray.radius; this.pulseT = Math.random() * CREATURES.ray.pulseCycle; this.pulseActive = 0; this.pulseR = 0; }
  update(dt, t, diver) {
    const P = CREATURES.ray;
    this.x += Math.sin(t * 0.5 + this.t0) * P.driftSpeed * dt; this.y = this.baseY + Math.sin(t * 0.7 + this.t0) * 12;
    this.pulseT += dt;
    if (this.pulseT >= P.pulseCycle) { this.pulseT = 0; this.pulseActive = P.pulseTime; }
    if (this.pulseActive > 0) { this.pulseActive -= dt; this.pulseR = P.pulseR * (1 - this.pulseActive / P.pulseTime); } else this.pulseR = 0;
  }
  hits(diver) {
    const d = Math.hypot(diver.x - this.x, diver.y - this.y);
    if (d < this.radius + diver.radius * 0.7) return true;
    return this.pulseR > 0 && Math.abs(d - this.pulseR) < CREATURES.ray.band + diver.radius * 0.5;
  }
  draw(ctx, camX, camY, t) {
    blit(ctx, this, camX, camY, drawElectricRay, t);
    if (this.pulseR > 0) {
      ctx.save();
      ctx.translate(this.x - camX, this.y - camY);
      ctx.strokeStyle = 'rgba(120,235,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, this.pulseR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

// Grouper — territorial guardian: anchored at a loot node (ax, ay), e.g. a
// wreck chest. While the diver is inside `territory` of the anchor it homes
// straight at them; once the diver leaves, it disengages and drifts back
// toward the anchor instead, at a slower speed — it guards the loot, it
// doesn't chase across the map.
export class Grouper extends Creature {
  constructor(x, y, anchor) { super(x, y); this.radius = CREATURES.grouper.radius; this.ax = anchor ? anchor.x : x; this.ay = anchor ? anchor.y : y; }
  update(dt, t, diver) {
    const P = CREATURES.grouper;
    const inTerritory = Math.hypot(diver.x - this.ax, diver.y - this.ay) < P.territory;
    const tx = inTerritory ? diver.x : this.ax, ty = inTerritory ? diver.y : this.ay;
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    const sp = inTerritory ? P.guardSpeed : P.guardSpeed * 0.7;
    if (d > 4) { this.x += (dx / d) * sp * dt; this.y += (dy / d) * sp * dt; }
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawGrouper, t); }
}

// Sea Urchin — static/slow-drift spiky contact hazard: net-immune (there's
// nothing for the net to snare — no body to wrap, just spines), but takes no
// special handling from harpoon/spear/charge — it dies like any creature via
// the default `dead = true` hit paths. Barely moves: a small vertical sway
// plus an optional slow horizontal drift.
export class Urchin extends Creature {
  constructor(x, y, drift = 0) { super(x, y); this.radius = CREATURES.urchin.radius; this.driftX = drift; this.netImmune = true; }
  update(dt, t) { this.x += this.driftX * dt; this.y = this.baseY + Math.sin(t * 0.4 + this.t0) * 3; }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawUrchin, t, false); }
}

// Giant Squid — deep-water pursuer mini-boss: homes persistently on the diver
// (unlike Octopus/Angler, it never disengages) and, once within lungeRange,
// speed-bursts ("lunges") toward them before resting and resuming a cruise
// approach. Has a small HP pool — takeDamage() chips it down over several
// weapon hits, like the Kraken, but simpler: no arms, no boss HP bar.
export class GiantSquid extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.squid.radius; this.hp = CREATURES.squid.hp; this.hurtT = 0; this.lungeT = 0; this.rest = 0; }
  takeDamage(n = 1) { this.hp -= n; this.hurtT = 0.2; if (this.hp <= 0) this.dead = true; }
  update(dt, t, diver) {
    const P = CREATURES.squid; this.hurtT = Math.max(0, this.hurtT - dt);
    const dx = diver.x - this.x, dy = diver.y - this.y, d = Math.hypot(dx, dy) || 1; this.facing = dx >= 0 ? 1 : -1;
    this.lungeT -= dt; this.rest = Math.max(0, this.rest - dt);
    if (d < P.lungeRange && this.rest <= 0 && this.lungeT <= 0) { this.lungeT = P.lungeTime; this.rest = P.restTime; }
    const sp = this.lungeT > 0 ? P.lunge : P.cruise;
    this.x += (dx / d) * sp * dt; this.y += (dy / d) * sp * dt;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawGiantSquid, t); }
}

// Gut Parasite — belly-zone reskin of the Piranha: a translucent acid blob
// that drifts/darts toward the diver, identical behaviour to Piranha (just a
// touch slower, and spawned solo rather than in a swarm cluster).
export class Parasite extends Creature {
  constructor(x, y) { super(x, y); this.radius = CREATURES.parasite.radius; }
  update(dt, t, diver) {
    const P = CREATURES.parasite, dx = diver.x - this.x, dy = diver.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * P.speed * dt + Math.cos(t * 3 + this.t0) * P.jitter * dt;
    this.y += (dy / d) * P.speed * dt + Math.sin(t * 3.3 + this.t0) * P.jitter * dt;
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawParasite, t); }
}

// Stone Sentinel — temple-zone reskin of the Grouper: a carved idol anchored
// at the key/vault. Same guard geometry as Grouper (homes on the diver while
// they're inside `territory`, else drifts back to the anchor), but it also
// wakes and holds the guard permanently once `awake` is flipped true (the
// temple does this when the key is grabbed) — until then, straying inside
// `territory` is the only thing that rouses it.
export class Sentinel extends Creature {
  constructor(x, y, anchor) { super(x, y); this.radius = CREATURES.sentinel.radius; this.ax = anchor ? anchor.x : x; this.ay = anchor ? anchor.y : y; this.awake = false; }
  update(dt, t, diver) {
    const P = CREATURES.sentinel;
    const inTerritory = Math.hypot(diver.x - this.ax, diver.y - this.ay) < P.territory;
    const guarding = this.awake || inTerritory;
    const tx = guarding ? diver.x : this.ax, ty = guarding ? diver.y : this.ay;
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    const sp = guarding ? P.guardSpeed : P.guardSpeed * 0.7;
    if (d > 4) { this.x += (dx / d) * sp * dt; this.y += (dy / d) * sp * dt; }
    this.facing = dx >= 0 ? 1 : -1;
  }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawSentinel, t); }
}

function blit(ctx, c, camX, camY, fn, t, flip = true) {
  ctx.save();
  ctx.translate(c.x - camX, c.y - camY);
  if (c.scale !== 1) ctx.scale(c.scale, c.scale);
  if (flip && c.facing < 0) ctx.scale(-1, 1);
  fn(ctx, t + c.t0, (c.hurtT || 0) > 0);   // forward a hurt flash for stateful-hurt creatures (e.g. the squid)
  ctx.restore();
}
