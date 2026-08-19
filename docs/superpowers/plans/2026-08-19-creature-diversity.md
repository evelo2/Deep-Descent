# Creature Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 new hazard creatures across new behavior archetypes, give each zone/location its own signature fauna via a data-driven reef-gated spawn table, and keep every existing weapon/snare/dark interaction working.

**Architecture:** Extend the existing `Creature` base-class model in `src/entities/creatures.js` (each creature owns `update(dt,t,diver,lit)` + a `drawX` in `src/render/sprites.js`; contact = a life). New tuning lives in a `CREATURES` config block. A new `src/entities/spawn.js` holds a `ZONE_FAUNA` data table + a `spawnCreature()` factory; `game._generateWorld` and the belly/temple/wreck/dark/current generators call it with a zone context instead of hard-coding rosters. Ranged attacks (Electric Ray pulse, Moray strike) damage via each creature's own `hits()` — no projectile system. The Giant Squid is a mini-boss with a small HP pool chipped by weapons like the Kraken.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D, no build step, no deps. Node runs the ES modules directly for unit tests (`node tests/creatures/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-19-creature-diversity-design.md`

## Global Constraints

- No new dependencies, no build step. New creatures are `class X extends Creature` with a `drawX(ctx, t, hurt)` in `render/sprites.js`.
- Every creature keeps the base contract: `x, y, radius, snareT, facing`, `get points`, `hits(diver)`, `update(dt, t, diver, lit)`, `draw(ctx, camX, camY, t)`. `snareT > 0` must always freeze behavior AND disable contact (the Game skips `hits()` when `snareT > 0`).
- Tuning numbers live in `CREATURES.<type>` in `config.js`; class points come from `KILL_POINTS[ClassName]` (add an entry per new class). No magic numbers in the classes.
- Behaviors must be telegraphed/fair: chargers wind up visibly, ambushers only strike within range, camouflaged types are revealable by light or proximity. No unavoidable hits.
- **Procedural sprites are a contract, not verbatim code:** each `drawX` task specifies silhouette, key features, palette, and a reference function to match the house style (e.g. `drawShark`, `drawEel`). The implementer draws it in-style; the test asserts the class/behavior, not pixels. This is the one intentional exception to "show the code" — art is drawn to the contract.
- The unit `t` passed to `update` is `game.t` (seconds); `lit` is `game.flareT > 0 || (game.torchOn && game.shockBattery > 0)`. Existing creatures ignore the extra `lit` arg.
- Creatures are confined by the Cave collider (the Game clamps them each frame); never assume a creature may leave the cave.

## File Structure

- `src/config.js` — MODIFY: add `CREATURES` block; add new `KILL_POINTS` entries.
- `src/entities/creatures.js` — MODIFY: add 8 creature classes + 2 reskins; add `takeDamage` to the mini-boss.
- `src/entities/spawn.js` — CREATE: `ZONE_FAUNA` table + `spawnCreature(key, x, y, reef, opts)` factory + `pickFauna(band, reef, rng)` weighted selector.
- `src/render/sprites.js` — MODIFY: add `drawX` for each new creature.
- `src/game.js` — MODIFY: route all creature spawns through `spawn.js`; pass `lit` to `update`; net-immunity for urchins; squid HP in weapon-hit paths; pass `lit` to camouflaged draw.
- `tests/creatures/*.test.mjs` — CREATE: one behavior test per creature + a spawn-table test.

---

### Task 1: Spawn framework + refactor (no behavior change)

Prove the data-driven spawn path using ONLY the existing 6 creatures, so the framework is trusted before new creatures land.

**Files:**
- Create: `src/entities/spawn.js`, `tests/creatures/spawn.test.mjs`
- Modify: `src/config.js` (add empty-ish `CREATURES` scaffold + keep `KILL_POINTS`), `src/game.js` (`_generateWorld` creature loop, `_generateBelly`, `_generateTemple`)

**Interfaces:**
- Produces: `spawnCreature(key, x, y, reef, opts={}) -> Creature|Creature[]` (swarms return an array); `pickFauna(band, reef, rng=Math.random) -> key|null` (weighted, filters `minReef>reef`); `ZONE_FAUNA` (see below).
- Consumes: the existing creature classes from `creatures.js`.

**ZONE_FAUNA (initial — existing roster only; new keys added in later tasks):**
```js
export const ZONE_FAUNA = {
  shallow: [ {k:'jelly',w:3}, {k:'puffer',w:3}, {k:'shark',w:2,scale:'small'} ],
  mid:     [ {k:'octopus',w:2}, {k:'shark',w:3,scale:'mid'}, {k:'puffer',w:2}, {k:'jelly',w:1} ],
  deep:    [ {k:'shark',w:2,scale:'big'}, {k:'eel',w:2}, {k:'angler',w:2} ],
  dark:    [ {k:'eel',w:2}, {k:'jelly',w:1} ],
  wreck:   [ {k:'puffer',w:2}, {k:'eel',w:1} ],
  current: [ {k:'jelly',w:1} ],
  belly:   [ {k:'eel',w:1}, {k:'jelly',w:1} ],
  temple:  [ {k:'eel',w:1}, {k:'puffer',w:1} ],
};
```

**spawn.js factory (shark scale bands use the reef `sizeUp` passed via opts):**
```js
import { Shark, Octopus, Jelly, Puffer, Eel, Angler } from './creatures.js';
export function pickFauna(band, reef, rng = Math.random) {
  const pool = (ZONE_FAUNA[band] || []).filter((e) => (e.minReef || 0) <= reef);
  if (!pool.length) return null;
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of pool) { if ((r -= e.w) <= 0) return e; }
  return pool[pool.length - 1];
}
export function spawnCreature(entry, x, y, reef, opts = {}) {
  const sizeUp = opts.sizeUp || 0, rng = opts.rng || Math.random;
  switch (entry.k) {
    case 'shark': {
      const base = entry.scale === 'big' ? 1.3 : entry.scale === 'mid' ? 1.0 : 0.7;
      return new Shark(x, y, base + sizeUp + rng() * 0.4);
    }
    case 'octopus': return new Octopus(x, y);
    case 'jelly':   return new Jelly(x, y);
    case 'puffer':  return new Puffer(x, y);
    case 'eel':     return new Eel(x, y);
    case 'angler':  return new Angler(x, y);
    default: return null;
  }
}
```

**game.js refactor:** replace the depth-band `if/else` (currently ~lines 239-251) with:
```js
for (let i = 0; i < nCreatures; i++) {
  const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
  const deep = c.y / WH;
  const band = deep < 0.30 ? 'shallow' : deep < 0.62 ? 'mid' : 'deep';
  const entry = pickFauna(band, this.reef); if (!entry) continue;
  const spawned = spawnCreature(entry, c.x, c.y, this.reef, { sizeUp });
  if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
}
```
Belly/temple loops call `pickFauna('belly'|'temple', reef)` + `spawnCreature(...)` the same way.

- [ ] **Step 1: Write `tests/creatures/spawn.test.mjs`** — assert: `pickFauna('shallow',1)` returns one of jelly/puffer/shark; a `minReef` entry (add a temporary `{k:'x',w:1,minReef:9}`) is filtered out at low reef; `spawnCreature({k:'shark',scale:'big'},0,0,3,{sizeUp:0.2})` yields a `Shark` with `scale>=1.3`; each existing key builds the right class.
- [ ] **Step 2: Run it — expect FAIL** (`spawn.js` not written).
- [ ] **Step 3: Implement `spawn.js` + `CREATURES` scaffold in config.**
- [ ] **Step 4: Refactor game.js spawns; run the full suite + the new test — expect PASS.** Manually confirm a reef still generates ~`nCreatures` creatures.
- [ ] **Step 5: Commit** `feat(creatures): data-driven zone spawn table (existing roster)`.

---

### Tasks 2–9 — shared shape

Each creature task is: **(a)** add `CREATURES.<type>` params + `KILL_POINTS` entry; **(b)** add the `class` to `creatures.js` (behavior code given below — transcribe it); **(c)** add `drawX` to `sprites.js` (to the sprite contract); **(d)** register its key(s) in `ZONE_FAUNA` + `spawnCreature`; **(e)** write `tests/creatures/<name>.test.mjs` with the given assertions. Steps for every one: write test → run (FAIL) → implement class+config+sprite+spawn → run test + full suite (PASS) → commit `feat(creatures): <Name>`.

All classes `extend Creature` and import `CREATURES` from config. `get points()` inherits from base (`KILL_POINTS[ClassName]`).

---

### Task 2: Piranha (swarm) — reef 1

**Config:** `piranha: { speed: 70, count: [6,9], radius: 9, jitter: 14 }`, `KILL_POINTS.Piranha = 40`.
**ZONE_FAUNA:** add `{k:'piranha',w:2,minReef:1}` to `shallow` and `{k:'piranha',w:1,minReef:2}` to `mid`.
**Factory:** `case 'piranha':` returns an **array** of `count[0..1]` `Piranha` units clustered within ~40px of (x,y).
**Behavior:**
```js
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
```
**Sprite `drawPiranha`:** a small (~9px) fast fish — sharp triangular body, forked tail, tiny teeth; reddish-silver. Match `drawEel`'s scale/economy.
**Tests:** a unit started 200px away from a stub diver converges (distance decreases over 60 frames); `points === 40`; the factory returns 6–9 units.

### Task 3: Stonefish (camouflaged) — reef 1 + `lit` plumbing

**Config:** `stonefish: { revealRange: 70, hiddenAlpha: 0.12, radius: 18 }`, `KILL_POINTS.Stonefish = 180`.
**ZONE_FAUNA:** add `{k:'stonefish',w:3,minReef:1}` to `dark`; `{k:'stonefish',w:1,minReef:2}` to `deep`.
**game.js:** in the creature update loop, compute `const lit = this.flareT > 0 || (this.torchOn && this.shockBattery > 0);` and call `cr.update(dt, this.t, this.diver, lit)`. Pass `lit` into `cr.draw` too (add optional 5th arg used only by camouflaged draw), OR store `cr.revealed` in update and read it in draw (preferred — no draw signature change).
**Behavior:**
```js
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
```
`hits()` is unchanged (contact always damages — that's the point).
**Sprite `drawStonefish`:** a lumpy, rock-mottled bottom-dweller with venomous spines along the back; drab greens/browns so it blends. Reference `drawPuffer`.
**Tests:** `revealed` is false when far + unlit; true when `lit` passed truthy; true when diver within `revealRange`; `hits()` returns true on contact regardless of `revealed`.

### Task 4: Barracuda (charger) — reef 2 (worked example — follow this pattern)

**Config:** `barracuda: { patrolSpeed: 60, sightRange: 320, alignBand: 46, windupTime: 0.5, dashSpeed: 420, dashTime: 0.5, recover: 0.7, radius: 20 }`, `KILL_POINTS.Barracuda = 260`.
**ZONE_FAUNA:** add `{k:'barracuda',w:2,minReef:2}` to `mid`, `{k:'barracuda',w:1,minReef:3}` to `deep`.
**Behavior (state machine — snare cancels a dash):**
```js
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
```
**Sprite `drawBarracuda`:** long, lean, silver predator with an underbite of teeth and a forked tail; slightly hunched during `windup`. Reference `drawShark` proportions, thinner.
**Tests (stub diver + drive `update`):** aligned & in-range → enters `windup` within a frame, then `dash` after `windupTime`, and x moves toward the diver during dash; a vertically-misaligned diver → stays `patrol`; setting `snareT=1` during `windup` → returns to `patrol` (dash cancelled).

### Task 5: Moray (ambusher) — reef 2

**Config:** `moray: { strikeRange: 120, reach: 90, strikeTime: 0.35, cooldown: 2.5, radius: 16 }`, `KILL_POINTS.Moray = 240`.
**ZONE_FAUNA:** add `{k:'moray',w:2,minReef:2}` to `dark` and `wreck`, `{k:'moray',w:1,minReef:3}` to `deep`.
**Behavior (anchored; only the extended head is the hazard — when hidden it sits at the anchor inside the wall, unreachable):**
```js
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
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawMoray, t); }
}
```
**Sprite `drawMoray`:** a gaping eel head emerging from shadow — wide jaw, needle teeth, small eye; body fades into darkness behind. Reference `drawEel`.
**Tests:** diver outside `strikeRange` → stays `hidden`, head at anchor; diver inside → enters `strike`, head extends toward the diver (its x/y leaves the anchor); after `strikeTime` returns to `hidden` and won't re-strike until `cooldown` elapses.

### Task 6: Electric Ray (ranged pulse) — reef 3

**Config:** `ray: { pulseR: 130, pulseCycle: 2.4, pulseTime: 0.6, band: 10, driftSpeed: 20, radius: 20 }`, `KILL_POINTS.ElectricRay = 320`.
**ZONE_FAUNA:** add `{k:'ray',w:1,minReef:3}` to `deep`, `{k:'ray',w:1,minReef:3}` to `dark`.
**Behavior (pulse ring is a hazard band checked in `hits()`):**
```js
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
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawElectricRay, t); /* also stroke the pulse ring when pulseR>0 */ }
}
```
The Game already skips `hits()` while `snareT>0`, so a snared ray's pulse is inert — no change needed there.
**Sprite `drawElectricRay`:** a flat diamond ray with a long tail and faint electric arcs; draw the expanding pulse as a cyan ring at radius `pulseR` when active.
**Tests:** `pulseR` rises from 0 during a pulse then returns to 0; `hits()` true for a diver on the ring band (`d ≈ pulseR`) even when outside the body; `hits()` true on body contact; no ring hazard when `pulseR===0`.

### Task 7: Grouper (loot guardian) — reef 3

**Config:** `grouper: { territory: 260, guardSpeed: 70, radius: 22 }`, `KILL_POINTS.Grouper = 300`.
**ZONE_FAUNA:** add `{k:'grouper',w:2,minReef:3}` to `wreck`.
**Factory/placement:** spawned by the wreck generator anchored at the wreck chest; `spawnCreature` passes `opts.anchor = {x,y}` → the class stores `ax,ay`.
**Behavior:**
```js
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
```
**Sprite `drawGrouper`:** a big-lipped, heavy-bodied reef fish, mottled, with a permanent scowl. Reference `drawPuffer`, larger.
**Tests:** diver inside `territory` → grouper moves toward the diver (distance to diver shrinks); diver far outside → grouper drifts back toward its anchor (distance to anchor shrinks).

### Task 8: Sea Urchin (drift/static, net-immune) — reef 4

**Config:** `urchin: { driftSpeed: 0, radius: 15 }`, `KILL_POINTS.Urchin = 120`.
**ZONE_FAUNA:** add `{k:'urchin',w:3,minReef:4}` to `current`, `{k:'urchin',w:2,minReef:4}` to `dark`, `{k:'urchin',w:1,minReef:5}` to `deep`.
**game.js net collision:** the net-snare loop must skip urchins — change the condition to `if (!cr.dead && cr.snareT <= 0 && !cr.netImmune && n.hits(cr))`. Harpoon/spear/charge still kill it (default paths unchanged).
**Behavior:**
```js
export class Urchin extends Creature {
  constructor(x, y, drift = 0) { super(x, y); this.radius = CREATURES.urchin.radius; this.driftX = drift; this.netImmune = true; }
  update(dt, t) { this.x += this.driftX * dt; this.y = this.baseY + Math.sin(t * 0.4 + this.t0) * 3; }
  draw(ctx, camX, camY, t) { blit(ctx, this, camX, camY, drawUrchin, t, false); }
}
```
**Sprite `drawUrchin`:** a black/purple spiky ball — radial spines, subtle sway. Reference `drawJelly` (radial symmetry).
**Tests:** `netImmune === true`; a mostly-static urchin barely moves over 1s; `hits()` true on contact; (game-level, note only) net skips it.

### Task 9: Giant Squid (pursuer mini-boss) — reef 4 + weapon-HP integration

**Config:** `squid: { cruise: 60, lunge: 240, lungeRange: 220, lungeTime: 0.45, restTime: 0.8, hp: 4, radius: 26 }`, `KILL_POINTS.GiantSquid = 900`.
**ZONE_FAUNA:** add `{k:'squid',w:1,minReef:4}` to `deep`.
**Behavior:**
```js
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
```
**game.js weapon-hit integration:** where harpoons/spears hit a creature (~line 995), and in the charge blast (~line 1053) and `_fireShock` kill path, branch on `takeDamage`:
```js
if (cr.takeDamage) { cr.takeDamage(1); this.particles.sparkle(cr.x, cr.y, PAL.danger, 12); if (cr.dead) this.score += cr.points; }
else { cr.dead = true; this.score += cr.points; /* existing sparkle/sfx */ }
```
Keep it minimal: a small shared helper `_damageCreature(cr)` returning `died` avoids duplicating the branch across the harpoon/charge/shock sites.
**Sprite `drawGiantSquid`:** a large mantled squid — two long tentacles + shorter arms, big eye, jet-propelled taper; flash lighter when `hurtT>0`. Reference the Kraken art for scale/menace but simpler.
**Tests:** survives `hp-1` hits and dies on the `hp`-th (`takeDamage` loop); `hurtT>0` right after a hit; within `lungeRange` it speeds up (position advances more per frame during `lungeT>0` than at cruise); persistent homing reduces distance to a stub diver over time.

---

### Task 10: Zone reskins + generator wiring

**Files:** `creatures.js` (Parasite, Sentinel), `sprites.js` (drawParasite, drawSentinel), `spawn.js` (register), `game.js` (belly/temple/wreck/dark/current generators call `pickFauna`+`spawnCreature` with their context; wreck passes the chest as `anchor`; dark/current generators seed urchins/stonefish).

- **Gut Parasite** (`belly`): a Piranha-style drifter reskinned as a translucent acid blob; `KILL_POINTS.Parasite = 60`. `ZONE_FAUNA.belly = [{k:'parasite',w:3},{k:'urchin',w:1}]`. `drawParasite`: wobbling green-tinged blob with a nucleus.
- **Stone Sentinel** (`temple`): a Grouper-style guardian reskinned as an animated statue anchored by the key/vault; wakes (starts homing) only once `game.hasKey` OR the diver is within territory; `KILL_POINTS.Sentinel = 300`. `ZONE_FAUNA.temple = [{k:'sentinel',w:2}]`. `drawSentinel`: carved stone fish-idol with glowing eyes.
  - Sentinel needs `game.hasKey` — pass it via `opts`/an `update` flag, or read a `this.awake` the temple sets when the key is grabbed. Keep it a constructor `anchor` + a public `awake` flag the Game flips in `_generateTemple`'s key-grab handler.
- Update `ZONE_FAUNA.dark`/`wreck`/`current` to the final rosters (stonefish/moray/urchin, moray/grouper, urchin) now that those classes exist.

- [ ] TDD each reskin (behavior mirrors its parent archetype: parasite converges like Piranha; sentinel guards only when `awake`). Wire generators. Full suite green. Commit `feat(creatures): belly/temple reskins + zone wiring`.

### Task 11: Reef-gating tune + in-browser verification

**Files:** `config.js` (final `minReef`/weights), `game.js` (density if needed).

- [ ] Sanity-sim in Node: for reef 1..6, generate faunas via `pickFauna` many times and assert no `minReef>reef` type appears and each band's variety grows with reef.
- [ ] In-browser (temporary `window.game`, removed before commit): start a run, teleport across bands/zones, screenshot each new creature drawing + confirm no console errors; verify a swarm, a charge, a pulse, a guarded wreck, a camouflaged reveal under torch, and a squid taking multiple hits.
- [ ] Update `docs/DESIGN.md` (v19 — creature diversity) and `docs/ROADMAP.md` (move "more deep-sea creatures" to shipped).
- [ ] Full suite green, grep-clean. Commit `feat(creatures): reef-gating tune + docs`. Then finish the branch.

## Self-Review

- **Spec coverage:** all 8 archetypes (charger/ambusher/swarm/camouflaged/ranged/guardian/pursuer/drift) → Tasks 4/5/2/3/6/7/9/8; zone map → Task 1 (bands) + Task 10 (special zones); reef gating → Task 11; overlap-damage decision → Tasks 5/6 `hits()`; squid mini-boss → Task 9. Covered.
- **Type consistency:** class names (`Piranha, Stonefish, Barracuda, Moray, ElectricRay, Grouper, Urchin, GiantSquid, Parasite, Sentinel`) match `KILL_POINTS` keys and `spawnCreature` cases. `update(dt,t,diver,lit)` extra arg is backward-compatible. `hits()` overrides preserve the base signature.
- **Placeholders:** none — every task carries exact params + behavior code + test assertions; sprites are an explicit drawn-to-contract exception noted in Global Constraints.
