// Game orchestration: state machine, 2D world generation, 2D camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, GAME, CAVE, HARPOON, SHARK, SHELL, BUBBLE, PAL } from './config.js';
import { Diver } from './entities/diver.js';
import { Boat } from './entities/boat.js';
import { Clam, Chest } from './entities/shell.js';
import { BigBubble } from './entities/bigbubble.js';
import { Treasure } from './entities/treasure.js';
import { Shark, Octopus, Jelly, Puffer, Eel, Angler } from './entities/creatures.js';
import { Cave } from './systems/cave.js';
import { Flora } from './render/flora.js';
import { Harpoon } from './entities/harpoon.js';
import { AirVent } from './entities/airvent.js';
import { Wreck } from './entities/wreck.js';
import { Whale } from './entities/whale.js';
import { Current } from './entities/current.js';
import { drawWhaleSkeleton, drawRib, drawThroat } from './render/props.js';

const HI_KEY = 'deepdescent.hi';
const { W, H, WW, WH, OPEN_BAND, CELL } = WORLD;

export class Game {
  constructor(ctx, input, audio, particles, background) {
    this.ctx = ctx; this.input = input; this.audio = audio;
    this.particles = particles; this.bg = background;
    this.state = 'menu';                 // menu | playing | paused | gameover
    this.t = 0; this.shake = 0;
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.hi = +(localStorage.getItem(HI_KEY) || 0);
    this.diver = new Diver();
    this.boat = new Boat();
    this.flash = 0; this.bankPulse = 0;
    this.harpoons = []; this.vents = []; this.wrecks = []; this.cave = null; this.flora = null;
    this.shells = []; this.bigBubbles = []; this.skeletons = []; this.whales = []; this.currents = [];
    this.zone = 'reef'; this.ribs = []; this.whaleExit = null; this.savedReef = null;
    this.reef = 1; this.dockHold = 0; this.sailT = 0; this.zoneFade = 0;
    this.diver.reset();
  }

  // ---- lifecycle -------------------------------------------------------
  start() {
    this.state = 'playing';
    this.score = 0; this.carried = 0; this.lives = GAME.startLives;
    this.air = AIR.max; this.depthReached = 0; this.fireCd = 0;
    this.won = false; this.newHi = false;
    this.zone = 'reef'; this.savedReef = null;
    this.diver.reset();
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this._generateWorld();
    this.audio.select();
  }

  _generateWorld() {
    const C = this.cave = new Cave('reef');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.bigBubbles = []; this.skeletons = [];
    this.whales = []; this.ribs = []; this.whaleExit = null; this.currents = [];
    const chestValue = (y) => 200 + Math.round((y / WH) * 400);   // 200..600 by depth

    // Clams and chests rest on cave-floor ledges, opening and closing.
    for (const f of spread(C.floors(), 34, 150)) {
      if (Math.random() < 0.62) this.shells.push(new Clam(f.x, f.y - SHELL.clamRadius * 0.35));
      else this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, chestValue(f.y)));
    }
    // Scattered coins & gems drift in open water.
    for (let i = 0; i < 40; i++) {
      const c = C.randomOpen(); if (!c) continue;
      this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.14 + (c.y / WH) * 0.18 ? 'gem' : 'coin'));
    }

    // Air vents on cave walls, spread out.
    for (const w of spread(C.walls(), 14, 360)) this.vents.push(new AirVent(w.x, w.y, w.side));

    // Shipwrecks seated on chamber floors, with a big chest on the deck + gems.
    for (const ch of spread(C.chambers(), 4, 700)) {
      const floorY = C.surfaceBelow(ch.x, ch.y, 300);
      this.wrecks.push(new Wreck(ch.x, floorY - 42));
      this.shells.push(new Chest(ch.x, floorY - 66, chestValue(ch.y) + 200));
      for (let k = 0; k < 3; k++) {
        const tx = ch.x + (Math.random() - 0.5) * 200, ty = floorY - 24 - Math.random() * 60;
        if (!C.isSolid(tx, ty)) this.treasures.push(new Treasure(tx, ty, 'gem'));
      }
    }

    // Flora rooted on cave floors — lots of it, for atmosphere.
    this.flora = new Flora(spread(C.floors(), 110, 70));

    // Whale skeletons resting on the deepest floors.
    const deepFloors = C.floors().filter((f) => f.y > WH * 0.72);
    for (const s of spread(deepFloors, 3, 500)) this.skeletons.push({ x: s.x, y: s.y - 6 });

    // Creatures change with depth: shallow reef → mid water → the deep.
    for (let i = 0; i < 36; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const deep = c.y / WH, r = Math.random();
      let cr;
      if (deep < 0.30) {                       // shallow reef
        cr = r < 0.42 ? new Jelly(c.x, c.y) : r < 0.72 ? new Puffer(c.x, c.y) : new Shark(c.x, c.y, 0.7 + Math.random() * 0.35);
      } else if (deep < 0.62) {                // mid water
        cr = r < 0.34 ? new Octopus(c.x, c.y) : r < 0.62 ? new Shark(c.x, c.y, 1.0 + Math.random() * 0.4)
          : r < 0.82 ? new Puffer(c.x, c.y) : new Jelly(c.x, c.y);
      } else {                                 // the deep
        cr = r < 0.34 ? new Shark(c.x, c.y, 1.3 + Math.random() * 0.4) : r < 0.64 ? new Eel(c.x, c.y) : new Angler(c.x, c.y);
      }
      this.creatures.push(cr);
    }

    // A living whale drifts in one of the larger chambers — swim into its mouth
    // to enter the belly bonus zone.
    const roomy = C.chambers(OPEN_BAND + 500);
    if (roomy.length) {
      const spot = roomy[(Math.random() * roomy.length) | 0];
      this.whales.push(new Whale(spot.x, spot.y - 10));
    }

    // Water currents sweep through a few spots — mostly sideways, one downdraft.
    this._makeCurrents(5);
  }

  // Scatter current zones on open cells, flowing along the cave.
  _makeCurrents(count) {
    const C = this.cave;
    for (let i = 0; i < count; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const horizontal = Math.random() < 0.7;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const w = horizontal ? 360 + Math.random() * 240 : 200 + Math.random() * 120;
      const h = horizontal ? 170 + Math.random() * 90 : 300 + Math.random() * 200;
      const fx = horizontal ? dir : 0, fy = horizontal ? 0 : 1;   // vertical currents pull down
      this.currents.push(new Current(c.x - w / 2, c.y - h / 2, w, h, fx, fy));
    }
  }

  // The whale's belly — a fleshy themed cave packed with a rich trove, a few
  // swallowed hazards and a glowing throat exit. No boat: grab and get out.
  _generateBelly() {
    const C = this.cave = new Cave('belly');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = [];
    const value = (y) => 350 + Math.round((y / WH) * 500);   // richer than the reef

    // Rib bones lining the belly.
    for (const f of spread(C.floors(), 40, 130)) this.ribs.push({ x: f.x, y: f.y - 40, dir: Math.random() < 0.5 ? 1 : -1 });
    // A generous trove: chests on ledges, gems & coins everywhere.
    for (const f of spread(C.floors(), 22, 150)) this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, value(f.y)));
    for (let i = 0; i < 60; i++) { const c = C.randomOpen(); if (c) this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.5 ? 'gem' : 'coin')); }
    // A couple of blowhole vents so it's survivable, plus swallowed hazards.
    for (const w of spread(C.walls(), 6, 400)) this.vents.push(new AirVent(w.x, w.y, w.side));
    for (let i = 0; i < 8; i++) { const c = C.randomOpen(OPEN_BAND + 200); if (c) this.creatures.push(Math.random() < 0.5 ? new Eel(c.x, c.y) : new Jelly(c.x, c.y)); }
    this.flora = new Flora([]);
    this._makeCurrents(3);   // churning guts
    // Glowing throat exit up in the entrance band; the diver starts down in the belly.
    this.whaleExit = { x: WW / 2, y: OPEN_BAND - 6, r: 46 };
  }

  // ---- input events (from main) ---------------------------------------
  onAction() {
    if (this.state === 'menu' || this.state === 'gameover') { this.audio.ensure(); this.audio.resume(); this.start(); }
    else if (this.state === 'paused') this.state = 'playing';
    else if (this.state === 'playing') this.state = 'paused';
  }

  fire() {
    if (this.state !== 'playing' || this.fireCd > 0) return;
    const d = this.diver;
    this.harpoons.push(new Harpoon(d.x, d.y, d.aimX, d.aimY));
    this.fireCd = HARPOON.cooldown;
    this.audio.fire();
  }

  // ---- update ----------------------------------------------------------
  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.bankPulse = Math.max(0, this.bankPulse - dt * 2);
    this.zoneFade = Math.max(0, this.zoneFade - dt * 1.2);

    if (this.input.pressed('pause')) this.onAction();
    if (this.input.pressed('mute')) { this.audio.ensure(); this.muted = this.audio.toggleMute(); }

    // Sailing to a new reef: brief transition, then a fresh cave.
    if (this.state === 'sailing') {
      this.sailT += dt;
      if (this.sailT > 1.8) this._newReef();
      this.input.endFrame(); return;
    }
    if (this.state !== 'playing') { this.input.endFrame(); return; }
    if (this.input.consumeTapFire()) this.fire();
    this.fireCd = Math.max(0, this.fireCd - dt);

    const intent = this.input.vector();
    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y));
    for (const cur of this.currents) cur.apply(this.diver, dt);   // swept by the flow
    this.cave.collide(this.diver);

    // 2D camera follows the diver, clamped to the world.
    const tx = Math.max(0, Math.min(WW - W, this.diver.x - W / 2));
    const ty = Math.max(0, Math.min(WH - H, this.diver.y - H / 2));
    this.camX += (tx - this.camX) * Math.min(1, dt * 6);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    this.depthReached = Math.max(this.depthReached, this.diver.y - WORLD.SURFACE);
    this.audio.setDepth(Math.min(1, this.camY / WH));

    // Air economy: bank + full refill at the boat (reef only); vents in the deep.
    const docked = this.zone === 'reef' && this.boat.contains(this.diver);
    let inVent = false;
    for (const v of this.vents) { v.update(dt, this.t, (x, y, r) => this.particles.bubble(x, y, { r })); if (!inVent && v.collects(this.diver, this.t)) inVent = true; }

    if (docked) {
      if (this.air < AIR.max) { this.air = Math.min(AIR.max, this.air + AIR.refillPerSec * dt); if (Math.random() < 0.3) this.audio.refill(); }
      if (this.carried > 0) { this.score += this.carried; this.carried = 0; this.bankPulse = 1; this.audio.bank(); }
      // Hold ↑ into the boat (once banked) to board and sail to a new reef.
      if (this.carried === 0 && intent.y < -0.3) { this.dockHold += dt; if (this.dockHold > 1.0) this._setSail(); }
      else this.dockHold = 0;
    } else {
      this.dockHold = 0;
      this.air -= (AIR.drainPerSec + this.diver.y * AIR.drainDepthFactor) * dt;
      if (inVent) { this.air = Math.min(AIR.max, this.air + AIR.ventRefillPerSec * dt); if (Math.random() < 0.2) this.audio.refill(); }
      if (this.air <= 0) { this.air = 0; this._loseLife(); }
      else if (this.air < 20 && Math.random() < 0.02) this.audio.gasp();
    }

    // Entities.
    const emitBig = (x, y) => this.bigBubbles.push(new BigBubble(x, y));
    for (const s of this.shells) s.update(dt, this.t, emitBig);
    for (const b of this.bigBubbles) b.update(dt, this.cave);
    for (const tr of this.treasures) tr.update(dt, this.t);
    for (const cr of this.creatures) {
      cr.update(dt, this.t, this.diver);
      if (this.cave.collide(cr) && cr.dir !== undefined) cr.dir = cr._nx > 0 ? -1 : 1; // turn off walls
    }
    for (const h of this.harpoons) h.update(dt, this.cave);

    // Whales (reef): swim into an open mouth to be swallowed into the belly.
    if (this.zone === 'reef') {
      for (const w of this.whales) { w.update(dt, this.t); if (w.swallowReady(this.diver)) { this._enterWhale(w); this.input.endFrame(); return; } }
    } else if (this.whaleExit) {
      // Belly: reach the glowing throat to escape back to the reef.
      const e = this.whaleExit;
      if (Math.hypot(this.diver.x - e.x, this.diver.y - e.y) < e.r + this.diver.radius) { this._exitWhale(); this.input.endFrame(); return; }
    }

    this._collisions();

    this.treasures = this.treasures.filter((tr) => !tr.taken);
    this.creatures = this.creatures.filter((cr) => !cr.dead);
    this.harpoons = this.harpoons.filter((h) => !h.dead);
    this.bigBubbles = this.bigBubbles.filter((b) => !b.dead);

    if (this.zone === 'reef' && this.shells.every((s) => !s.hasLoot) && this.treasures.length === 0 && this.carried === 0 && this.diver.atSurface) this._win();

    this.input.endFrame();
  }

  _collisions() {
    const d = this.diver;
    for (const tr of this.treasures) {
      if (!tr.taken && tr.reached(d)) {
        tr.taken = true; this.carried += tr.value;
        this.particles.sparkle(tr.x, tr.y, tr.kind === 'gem' ? PAL.gem : PAL.gold, tr.kind === 'coin' ? 12 : 18);
        tr.kind === 'gem' ? this.audio.gem() : this.audio.pickup();
      }
    }
    // Shells (clams & chests): grab loot while open, get bitten when they shut.
    for (const s of this.shells) {
      if (s.canTakeLoot(d)) {
        this.carried += s.takeLoot();
        this.particles.sparkle(s.x, s.y, s.lootColor, 24);
        this.audio.pearl();
      } else if (s.bites(d) && d.invuln <= 0) {
        this._hit();
      }
    }
    // Big air bubbles from opening shells — collect to refill air.
    for (const b of this.bigBubbles) {
      if (!b.dead && b.collected(d)) {
        b.dead = true;
        this.air = Math.min(AIR.max, this.air + BUBBLE.air);
        this.particles.sparkle(b.x, b.y, PAL.air, 12);
        this.audio.refill();
      }
    }
    for (const h of this.harpoons) {
      if (h.dead) continue;
      for (const cr of this.creatures) {
        if (!cr.dead && h.hits(cr)) {
          h.dead = true; cr.dead = true;
          this.score += cr.points;
          this.particles.sparkle(cr.x, cr.y, PAL.danger, 20);
          this.audio.kill();
          break;
        }
      }
    }
    if (d.invuln <= 0) {
      for (const cr of this.creatures) { if (cr.hits(d)) { this._hit(); break; } }
    }
  }

  _hit() {
    this.diver.hit(); this.flash = 1; this.shake = 12;
    this.audio.hit();
    this._loseLife();
  }

  _loseLife() {
    this.lives -= GAME.hitCost;
    if (this.lives <= 0) { this._gameOver(); return; }
    this.air = Math.max(this.air, 35);
    this.diver.invuln = GAME.invulnAfterHit;
    this.diver.y = Math.max(WORLD.SURFACE + 40, this.diver.y - 70);
  }

  _gameOver() {
    this.state = 'gameover';
    this.audio.gasp();
    if (this.score > this.hi) { this.hi = this.score; localStorage.setItem(HI_KEY, String(this.hi)); this.newHi = true; }
    else this.newHi = false;
  }

  _win() {
    this.score += Math.round(this.air) * 5 + this.lives * 500;
    this.won = true;
    this._gameOver();
  }

  // Board the boat and set sail for a fresh reef (score & lives carry over).
  _setSail() {
    this.state = 'sailing'; this.sailT = 0; this.reef += 1; this.dockHold = 0;
    this.audio.select();
  }
  _newReef() {
    this._generateWorld();
    this.diver.reset();
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.air = AIR.max;
    this.state = 'playing';
    this.audio.bank();
  }

  // Swallowed! Snapshot the reef, generate the belly, drop the diver inside.
  _enterWhale(whale) {
    this.savedReef = {
      cave: this.cave, shells: this.shells, treasures: this.treasures, creatures: this.creatures,
      vents: this.vents, wrecks: this.wrecks, flora: this.flora, skeletons: this.skeletons,
      bigBubbles: this.bigBubbles, whales: this.whales, ribs: this.ribs, currents: this.currents, whale,
    };
    this.zone = 'belly';
    this._generateBelly();
    const c = this.cave.randomOpen(WH * 0.55) || { x: WW / 2, y: WH * 0.6 };
    this._placeDiver(c.x, c.y, 0);
    this.shake = 10; this.zoneFade = 1;
    this.audio.gasp();
  }

  // Escape: restore the reef and drop the diver just outside the whale's mouth.
  _exitWhale() {
    const s = this.savedReef; if (!s) return;
    Object.assign(this, {
      cave: s.cave, shells: s.shells, treasures: s.treasures, creatures: s.creatures,
      vents: s.vents, wrecks: s.wrecks, flora: s.flora, skeletons: s.skeletons,
      bigBubbles: s.bigBubbles, whales: s.whales, ribs: s.ribs, currents: s.currents,
    });
    this.whaleExit = null; this.zone = 'reef';
    const m = s.whale.mouthZone();
    this._placeDiver(m.x + s.whale.facing * 34, m.y, s.whale.facing * 60);
    this.savedReef = null; this.zoneFade = 1;
    this.audio.bank();
  }

  _placeDiver(x, y, vx) {
    const d = this.diver;
    d.x = x; d.y = y; d.vx = vx; d.vy = 0; d.invuln = 1.6;
    this.camX = Math.max(0, Math.min(WW - W, x - W / 2));
    this.camY = Math.max(0, Math.min(WH - H, y - H / 2));
  }

  // ---- render ----------------------------------------------------------
  draw() {
    if (this.state === 'sailing') { this._sailScreen(); return; }
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const cx = this.camX, cy = this.camY;
    const depthT = Math.min(1, cy / WH);
    this.bg.draw(ctx, cx, cy, this.t, depthT);
    this.boat.draw(ctx, cx, cy, this.t);

    if (this.state !== 'menu') {
      for (const cur of this.currents) cur.draw(ctx, cx, cy, this.t);
      if (this.flora) this.flora.draw(ctx, cx, cy, this.t);
      for (const r of this.ribs) { ctx.save(); ctx.translate(r.x - cx, r.y - cy); drawRib(ctx, this.t, r.dir); ctx.restore(); }
      for (const s of this.skeletons) { ctx.save(); ctx.translate(s.x - cx, s.y - cy); drawWhaleSkeleton(ctx, this.t); ctx.restore(); }
      for (const w of this.wrecks) w.draw(ctx, cx, cy, this.t);
      for (const tr of this.treasures) tr.draw(ctx, cx, cy, this.t);
      for (const s of this.shells) s.draw(ctx, cx, cy, this.t);
      for (const cr of this.creatures) cr.draw(ctx, cx, cy, this.t);
      if (this.cave) this.cave.draw(ctx, cx, cy);   // rock occludes actors inside walls
      for (const w of this.whales) w.draw(ctx, cx, cy, this.t);
      for (const v of this.vents) v.draw(ctx, cx, cy, this.t);
      if (this.whaleExit) { ctx.save(); ctx.translate(this.whaleExit.x - cx, this.whaleExit.y - cy); drawThroat(ctx, this.t, this.whaleExit.r); ctx.restore(); }
      for (const b of this.bigBubbles) b.draw(ctx, cx, cy);
      for (const h of this.harpoons) h.draw(ctx, cx, cy);
      // Depth darkening — the deep swallows the light (drawn under the diver).
      if (this.zone === 'belly') {
        const beat = 0.30 + 0.10 * Math.sin(this.t * 2.2) + 0.04 * Math.sin(this.t * 4.4);
        ctx.fillStyle = `rgba(60,10,18,${beat})`; ctx.fillRect(0, 0, W, H);       // warm, pulsing "inside a body"
      } else if (depthT > 0.02) {
        ctx.fillStyle = `rgba(2,7,15,${0.5 * depthT})`; ctx.fillRect(0, 0, W, H);
      }
    }

    this.particles.draw(ctx, cx, cy);
    if (this.state !== 'menu') this.diver.draw(ctx, cx, cy);

    // Vignette — subtle at the surface, closing in with depth.
    if (this.state !== 'menu') {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.22 + 0.34 * depthT})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Zone-change wash (swallowed / escaped).
    if (this.zoneFade > 0.01) {
      ctx.fillStyle = this.zone === 'belly' ? `rgba(40,6,12,${this.zoneFade})` : `rgba(120,180,220,${0.7 * this.zoneFade})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused') this._hud();
    if (this.state === 'menu') this._menu();
    if (this.state === 'paused') this._overlay('PAUSED', 'Press P / tap to resume');
    if (this.state === 'gameover') this._gameOverScreen();
  }

  // Transition screen while the boat carries the diver to a new reef.
  _sailScreen() {
    const ctx = this.ctx, p = Math.min(1, this.sailT / 1.8), sy = H * 0.42;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.surfaceLight); g.addColorStop(0.42, PAL.waterTop); g.addColorStop(1, PAL.waterDeep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // surface line
    ctx.strokeStyle = 'rgba(220,250,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= W; x += 12) { const yy = sy + Math.sin(x * 0.04 + this.t * 2) * 3; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.stroke();
    // boat sailing across, with a wake
    const bx = W * 0.12 + p * W * 0.72;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 7; i++) { const wx = bx - 34 - i * 16 - ((this.t * 40) % 16); ctx.beginPath(); ctx.arc(wx, sy + 7, 3.2 - i * 0.3, 0, Math.PI * 2); ctx.fill(); }
    this.boat.draw(ctx, this.boat.x - bx, WORLD.SURFACE - sy, this.t);
    // caption
    this._text(`SAILING TO REEF ${this.reef}…`, W / 2, H * 0.72, 26, PAL.hudText, 'center', 'middle', true);
    this._text(`SCORE ${this.score}   ·   LIVES ${this.lives}`, W / 2, H * 0.72 + 34, 15, '#bfe6ff', 'center', 'middle');
  }

  // ---- HUD -------------------------------------------------------------
  _hud() {
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(0,10,20,0.55)'); g.addColorStop(1, 'rgba(0,10,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);

    const bx = 20, by = 20, bw = 240, bh = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
    const frac = this.air / AIR.max;
    const low = frac < 0.25;
    ctx.fillStyle = low && Math.floor(this.t * 6) % 2 === 0 ? PAL.airLow : (low ? '#ff9a6b' : PAL.air);
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * frac), bh, 9); ctx.fill();
    this._text('AIR', bx, by - 6, 12, PAL.hudText, 'left', 'bottom');
    this._text(`${Math.round(this.air)}`, bx + bw + 8, by + bh / 2, 13, PAL.hudText, 'left', 'middle');

    for (let i = 0; i < this.lives; i++) {
      ctx.save(); ctx.translate(bx + 8 + i * 22, by + bh + 22); ctx.scale(0.7, 0.7);
      ctx.fillStyle = PAL.diver; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.diverGlass; ctx.beginPath(); ctx.arc(2, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(bx + 8 + this.lives * 22 + 14, by + bh + 22);
    ctx.globalAlpha = this.fireCd > 0 ? 0.3 : 1;
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();

    this._text(`SCORE ${this.score}`, W - 20, 22, 18, PAL.hudText, 'right', 'top');
    const cp = this.bankPulse > 0 ? PAL.gold : PAL.hudText;
    this._text(`CARRYING ${this.carried}`, W - 20, 46, 14, cp, 'right', 'top');
    this._text(`DEPTH ${Math.round(this.depthReached / 10)} m`, W - 20, 66, 13, '#bfe6ff', 'right', 'top');
    this._text(this.zone === 'belly' ? '🐋 THE BELLY' : `REEF ${this.reef}`, W - 20, 84, 12, this.zone === 'belly' ? PAL.membrane : '#8fbfda', 'right', 'top');
    this._text(`HI ${this.hi}`, W / 2, 22, 14, '#bfe6ff', 'center', 'top');
    if (this.muted) this._text('MUTED', W / 2, 42, 11, '#ff9a6b', 'center', 'top');

    // Contextual prompts.
    if (this.zone === 'belly') {
      this._text('🐋 Swallowed! Grab the trove — reach the glowing throat to escape.', W / 2, H - 30, 15, PAL.throat, 'center', 'middle');
    } else if (this.boat.contains(this.diver)) {
      if (this.carried === 0) {
        this._text('◆ DOCKED — banked. Hold ↑ to set sail to a new reef', W / 2, H - 30, 15, PAL.gold, 'center', 'middle');
        if (this.dockHold > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.roundRect(W / 2 - 80, H - 16, 160, 6, 3); ctx.fill();
          ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.roundRect(W / 2 - 80, H - 16, 160 * Math.min(1, this.dockHold / 1.0), 6, 3); ctx.fill();
        }
      } else {
        this._text('◆ DOCKED — refilling air & banking treasure', W / 2, H - 30, 15, PAL.air, 'center', 'middle');
      }
    } else {
      // Near an open whale mouth?
      for (const w of this.whales) {
        if (w.mouthOpen > 0.4 && Math.hypot(this.diver.x - w.x, this.diver.y - w.y) < 320) {
          this._text('🐋 Its mouth is open — swim in to enter the whale', W / 2, H - 30, 14, PAL.whaleBelly, 'center', 'middle');
          break;
        }
      }
    }
    ctx.restore();
  }

  _menu() {
    const cx = W / 2;
    this._panel();
    this._text('DEEP DESCENT', cx, 170, 58, PAL.glow, 'center', 'middle', true);
    this._text('a modern homage to Durell’s SCUBA DIVE (1983)', cx, 216, 16, '#bfe6ff', 'center', 'middle');
    this._text('Explore 2D caves — tunnels, drop-offs & chambers.', cx, 288, 17, PAL.hudText, 'center', 'middle');
    this._text('Grab pearls, gems & sunken wrecks. Harpoon the hunters.', cx, 314, 17, PAL.hudText, 'center', 'middle');
    this._text('Refill air at bubble vents; surface at the boat to bank.', cx, 340, 17, PAL.hudText, 'center', 'middle');
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE', cx, 404, 22, PAL.gold, 'center', 'middle', true);
    this._text('Swim: Arrows / WASD / drag   ·   Fire: Space / F / tap   ·   Pause: P   ·   Mute: M', cx, 456, 13, '#9fc6e0', 'center', 'middle');
    if (this.hi > 0) this._text(`BEST ${this.hi}`, cx, 486, 14, '#bfe6ff', 'center', 'middle');
  }

  _gameOverScreen() {
    const cx = W / 2;
    this._panel();
    const title = this.won ? 'HAUL SECURED!' : 'OUT OF AIR';
    this._text(title, cx, 220, 48, this.won ? PAL.gold : PAL.danger, 'center', 'middle', true);
    this._text(`SCORE ${this.score}`, cx, 290, 30, PAL.hudText, 'center', 'middle');
    this._text(`DEEPEST ${Math.round(this.depthReached / 10)} m`, cx, 326, 16, '#bfe6ff', 'center', 'middle');
    if (this.newHi) this._text('★ NEW BEST ★', cx, 360, 20, PAL.glow, 'center', 'middle', true);
    else this._text(`BEST ${this.hi}`, cx, 360, 16, '#bfe6ff', 'center', 'middle');
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE AGAIN', cx, 430, 20, PAL.gold, 'center', 'middle', true);
  }

  _overlay(title, sub) {
    const cx = W / 2;
    this._panel(0.4);
    this._text(title, cx, H / 2 - 10, 44, PAL.hudText, 'center', 'middle', true);
    this._text(sub, cx, H / 2 + 34, 16, '#bfe6ff', 'center', 'middle');
  }

  _panel(alpha = 0.55) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(3,15,30,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  _text(str, x, y, size, color, align = 'left', base = 'alphabetic', bold = false) {
    const ctx = this.ctx;
    ctx.font = `${bold ? '800' : '600'} ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = base;
    if (bold) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }
}

// Pick up to `count` items from `list` that are at least `minDist` apart.
function spread(list, count, minDist) {
  const shuffled = list.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const out = [];
  for (const c of shuffled) {
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > minDist)) { out.push(c); if (out.length >= count) break; }
  }
  return out;
}
