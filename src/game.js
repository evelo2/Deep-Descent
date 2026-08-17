// Game orchestration: state machine, world generation, camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, GAME, CAVE, HARPOON, KILL_POINTS, PAL } from './config.js';
import { Diver } from './entities/diver.js';
import { Boat } from './entities/boat.js';
import { Clam } from './entities/clam.js';
import { Treasure } from './entities/treasure.js';
import { Shark, Octopus, Jelly, Puffer } from './entities/creatures.js';
import { Terrain } from './systems/terrain.js';
import { Harpoon } from './entities/harpoon.js';
import { AirVent } from './entities/airvent.js';
import { Wreck } from './entities/wreck.js';

const HI_KEY = 'deepdescent.hi';

export class Game {
  constructor(ctx, input, audio, particles, background) {
    this.ctx = ctx; this.input = input; this.audio = audio;
    this.particles = particles; this.bg = background;
    this.state = 'menu';                 // menu | playing | paused | gameover
    this.t = 0; this.camY = 0; this.shake = 0;
    this.hi = +(localStorage.getItem(HI_KEY) || 0);
    this.diver = new Diver();
    this.boat = new Boat();
    this.flash = 0;                      // full-screen damage flash
    this.bankPulse = 0;
    this.harpoons = []; this.vents = []; this.wrecks = []; this.terrain = null;
    this._seedMenu();
  }

  // ---- lifecycle -------------------------------------------------------
  _seedMenu() { this.diver.reset(); this.camY = 0; }

  start() {
    this.state = 'playing';
    this.score = 0; this.carried = 0; this.lives = GAME.startLives;
    this.air = AIR.max; this.depthReached = 0; this.fireCd = 0;
    this.won = false; this.newHi = false;
    this.diver.reset();
    this._generateWorld();
    this.audio.select();
  }

  _generateWorld() {
    this.terrain = new Terrain();
    this.clams = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = [];
    const T = this.terrain;
    const top = WORLD.SURFACE + 240;
    const bottom = T.floorY - 60;
    // Pick an x that lands inside the cave corridor at depth y.
    const randX = (y, pad = 30) => { const { left, right } = T.bounds(y, pad); return left + Math.random() * Math.max(1, right - left); };

    // Pearl clams — richer/denser deeper.
    for (let y = top; y < bottom; y += 300 + Math.random() * 150) {
      const n = 1 + (Math.random() < y / bottom ? 1 : 0);
      for (let i = 0; i < n; i++) this.clams.push(new Clam(randX(y), y + (Math.random() - 0.5) * 80));
    }
    // Scattered treasure — gems appear deeper.
    for (let y = top; y < bottom; y += 200 + Math.random() * 130) {
      const deep = y / bottom, r = Math.random();
      const kind = r < 0.1 + deep * 0.16 ? 'gem' : r < 0.4 + deep * 0.3 ? 'chest' : 'coin';
      this.treasures.push(new Treasure(randX(y, 20), y, kind));
    }
    // Air vents mounted on cave walls — the deep-diving lifeline.
    for (let y = CAVE.openEnd + 240; y < bottom; y += 560 + Math.random() * 220) {
      const { left, right } = T.bounds(y, 0);
      const onLeft = Math.random() < 0.5;
      this.vents.push(new AirVent(onLeft ? left : right, y, onLeft ? 1 : -1));
    }
    // Shipwrecks seated in chambers, ringed with rich loot.
    for (let i = 0; i < T.chambers.length; i += 2) {
      const ch = T.chambers[i];
      if (ch.y < CAVE.openEnd + 260) continue;
      this.wrecks.push(new Wreck(ch.cx, ch.y + 44));
      for (let k = 0; k < 4; k++) {
        const kx = Math.max(ch.cx - 150, Math.min(ch.cx + 150, ch.cx + (Math.random() - 0.5) * 220));
        this.treasures.push(new Treasure(kx, ch.y + 30 + (Math.random() - 0.5) * 40, Math.random() < 0.5 ? 'gem' : 'chest'));
      }
    }
    // Creatures by depth band.
    for (let y = top + 160; y < bottom; y += 260) {
      const deep = y / bottom, x = randX(y, 24), r = Math.random();
      if (deep > 0.55 && r < 0.4) this.creatures.push(new Shark(x, y));
      else if (deep > 0.3 && r < 0.4) this.creatures.push(new Octopus(x, y));
      else if (r < 0.5) this.creatures.push(new Jelly(x, y));
      else this.creatures.push(new Puffer(x, y));
      if (deep > 0.7 && Math.random() < 0.5) this.creatures.push(new Shark(randX(y + 120, 24), y + 120));
    }
  }

  // ---- input events (from main) ---------------------------------------
  onAction() {
    if (this.state === 'menu' || this.state === 'gameover') { this.audio.ensure(); this.audio.resume(); this.start(); }
    else if (this.state === 'paused') this.state = 'playing';
    else if (this.state === 'playing') this.state = 'paused';
  }

  // Fire the harpoon along the diver's aim (called by main on Space/F).
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

    if (this.input.pressed('pause')) this.onAction();
    if (this.input.pressed('mute')) { this.audio.ensure(); this.muted = this.audio.toggleMute(); }

    if (this.state !== 'playing') { this.input.endFrame(); return; }
    if (this.input.consumeTapFire()) this.fire();
    this.fireCd = Math.max(0, this.fireCd - dt);

    const intent = this.input.vector();
    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y));
    this.terrain.constrain(this.diver);

    // Camera follows the diver, clamped to the world.
    const target = Math.max(0, Math.min(WORLD.DEPTH_MAX, this.diver.y - WORLD.H / 2));
    this.camY += (target - this.camY) * Math.min(1, dt * 6);
    this.depthReached = Math.max(this.depthReached, this.diver.y - WORLD.SURFACE);
    this.audio.setDepth(Math.min(1, this.camY / WORLD.DEPTH_MAX));

    // Air economy: bank + full refill at the boat; vents refill in the deep.
    const docked = this.boat.contains(this.diver);
    let inVent = false;
    for (const v of this.vents) { v.update(dt, this.t, (x, y, r) => this.particles.bubble(x, y, { r })); if (!inVent && v.collects(this.diver, this.t)) inVent = true; }

    if (docked) {
      if (this.air < AIR.max) { this.air = Math.min(AIR.max, this.air + AIR.refillPerSec * dt); if (Math.random() < 0.3) this.audio.refill(); }
      if (this.carried > 0) { this.score += this.carried; this.carried = 0; this.bankPulse = 1; this.audio.bank(); }
    } else {
      this.air -= (AIR.drainPerSec + this.diver.y * AIR.drainDepthFactor) * dt;
      if (inVent) { this.air = Math.min(AIR.max, this.air + AIR.ventRefillPerSec * dt); if (Math.random() < 0.2) this.audio.refill(); }
      if (this.air <= 0) { this.air = 0; this._loseLife(); }
      else if (this.air < 20 && Math.random() < 0.02) this.audio.gasp();
    }

    // Entities.
    for (const c of this.clams) c.update(dt, this.t);
    for (const tr of this.treasures) tr.update(dt, this.t);
    for (const cr of this.creatures) { cr.update(dt, this.t, this.diver); if (cr.y >= CAVE.openEnd) this._confine(cr); }
    for (const h of this.harpoons) h.update(dt, this.terrain);

    this._collisions();

    // Cull collected/gone/dead.
    this.clams = this.clams.filter((c) => !c.gone);
    this.treasures = this.treasures.filter((tr) => !tr.taken);
    this.creatures = this.creatures.filter((cr) => !cr.dead);
    this.harpoons = this.harpoons.filter((h) => !h.dead);

    // Win: everything collected and banked, diver back at the surface.
    if (this.clams.every((c) => !c.hasPearl) && this.treasures.length === 0 && this.carried === 0 && this.diver.atSurface) this._win();

    this.input.endFrame();
  }

  // Keep a creature inside the cave corridor, turning wall-bouncers around.
  _confine(cr) {
    const { left, right } = this.terrain.bounds(cr.y, cr.radius);
    if (cr.x < left) { cr.x = left; if (cr.dir !== undefined) cr.dir = Math.abs(cr.dir); }
    if (cr.x > right) { cr.x = right; if (cr.dir !== undefined) cr.dir = -Math.abs(cr.dir); }
  }

  _collisions() {
    const d = this.diver;
    // Treasure.
    for (const tr of this.treasures) {
      if (!tr.taken && tr.reached(d)) {
        tr.taken = true; this.carried += tr.value;
        this.particles.sparkle(tr.x, tr.y, tr.kind === 'gem' ? PAL.gem : PAL.gold, tr.kind === 'coin' ? 12 : 18);
        tr.kind === 'gem' ? this.audio.gem() : this.audio.pickup();
      }
    }
    // Clams — take pearl when open, get bitten when shut.
    for (const c of this.clams) {
      if (c.canTakePearl(d)) {
        c.takePearl(); this.carried += 400;
        this.particles.sparkle(c.x, c.y, PAL.pearl, 22);
        this.audio.pearl();
      } else if (c.hasPearl && c.bites(d) && d.invuln <= 0) {
        this._hit();
      }
    }
    // Harpoons vs creatures.
    for (const h of this.harpoons) {
      if (h.dead) continue;
      for (const cr of this.creatures) {
        if (!cr.dead && h.hits(cr)) {
          h.dead = true; cr.dead = true;
          this.score += KILL_POINTS[cr.constructor.name] ?? 100;
          this.particles.sparkle(cr.x, cr.y, PAL.danger, 20);
          this.audio.kill();
          break;
        }
      }
    }
    // Creatures vs diver.
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
    // Respawn breath: reset air, bump diver upward a little.
    this.air = Math.max(this.air, 35);
    this.diver.invuln = GAME.invulnAfterHit;
    this.diver.y = Math.max(WORLD.SURFACE + 40, this.diver.y - 80);
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

  // ---- render ----------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const depthT = Math.min(1, this.camY / WORLD.DEPTH_MAX);
    this.bg.draw(ctx, this.camY, this.t, depthT);
    this.boat.draw(ctx, this.camY, this.t);

    if (this.state !== 'menu') {
      for (const w of this.wrecks) w.draw(ctx, this.camY, this.t);
      for (const tr of this.treasures) tr.draw(ctx, this.camY, this.t);
      for (const c of this.clams) c.draw(ctx, this.camY, this.t);
      for (const cr of this.creatures) cr.draw(ctx, this.camY, this.t);
      if (this.terrain) this.terrain.draw(ctx, this.camY);   // rock occludes creatures in walls
      for (const v of this.vents) v.draw(ctx, this.camY, this.t);
      for (const h of this.harpoons) h.draw(ctx, this.camY);
    }

    this.particles.draw(ctx, this.camY);
    if (this.state !== 'menu') this.diver.draw(ctx, this.camY);

    // Damage vignette flash.
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`;
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);
    }
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused') this._hud();
    if (this.state === 'menu') this._menu();
    if (this.state === 'paused') this._overlay('PAUSED', 'Press P / tap to resume');
    if (this.state === 'gameover') this._gameOverScreen();
  }

  // ---- HUD -------------------------------------------------------------
  _hud() {
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(0,10,20,0.55)'); g.addColorStop(1, 'rgba(0,10,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD.W, 70);

    // Air bar.
    const bx = 20, by = 20, bw = 240, bh = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
    const frac = this.air / AIR.max;
    const low = frac < 0.25;
    ctx.fillStyle = low && Math.floor(this.t * 6) % 2 === 0 ? PAL.airLow : (low ? '#ff9a6b' : PAL.air);
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * frac), bh, 9); ctx.fill();
    this._text('AIR', bx, by - 6, 12, PAL.hudText, 'left', 'bottom');
    this._text(`${Math.round(this.air)}`, bx + bw + 8, by + bh / 2, 13, PAL.hudText, 'left', 'middle');

    // Lives (diver pips).
    for (let i = 0; i < this.lives; i++) {
      ctx.save(); ctx.translate(bx + 8 + i * 22, by + bh + 22); ctx.scale(0.7, 0.7);
      ctx.fillStyle = PAL.diver; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.diverGlass; ctx.beginPath(); ctx.arc(2, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Harpoon-ready indicator.
    ctx.save();
    ctx.translate(bx + 8 + this.lives * 22 + 14, by + bh + 22);
    ctx.globalAlpha = this.fireCd > 0 ? 0.3 : 1;
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Score / carried / depth / high.
    this._text(`SCORE ${this.score}`, WORLD.W - 20, 22, 18, PAL.hudText, 'right', 'top');
    const cp = this.bankPulse > 0 ? PAL.gold : PAL.hudText;
    this._text(`CARRYING ${this.carried}`, WORLD.W - 20, 46, 14, cp, 'right', 'top');
    const depthM = Math.round(this.depthReached / 10);
    this._text(`DEPTH ${depthM} m`, WORLD.W - 20, 66, 13, '#bfe6ff', 'right', 'top');
    this._text(`HI ${this.hi}`, WORLD.W / 2, 22, 14, '#bfe6ff', 'center', 'top');
    if (this.muted) this._text('MUTED', WORLD.W / 2, 42, 11, '#ff9a6b', 'center', 'top');

    // Contextual prompt.
    if (this.boat.contains(this.diver)) this._text('◆ DOCKED — refilling air & banking treasure', WORLD.W / 2, WORLD.H - 30, 15, PAL.air, 'center', 'middle');
    ctx.restore();
  }

  _menu() {
    const cx = WORLD.W / 2;
    this._panel();
    this._text('DEEP DESCENT', cx, 180, 58, PAL.glow, 'center', 'middle', true);
    this._text('a modern homage to Durell’s SCUBA DIVE (1983)', cx, 226, 16, '#bfe6ff', 'center', 'middle');
    this._text('Dive the caves for pearls, gems & sunken wrecks.', cx, 300, 17, PAL.hudText, 'center', 'middle');
    this._text('Refill air at bubble vents · harpoon the hunters.', cx, 326, 17, PAL.hudText, 'center', 'middle');
    this._text('Surface at the boat to bank your haul.', cx, 352, 17, PAL.hudText, 'center', 'middle');
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE', cx, 416, 22, PAL.gold, 'center', 'middle', true);
    this._text('Swim: Arrows / WASD / drag   ·   Fire: Space / F / tap   ·   Pause: P   ·   Mute: M', cx, 468, 13, '#9fc6e0', 'center', 'middle');
    if (this.hi > 0) this._text(`BEST ${this.hi}`, cx, 498, 14, '#bfe6ff', 'center', 'middle');
  }

  _gameOverScreen() {
    const cx = WORLD.W / 2;
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
    const cx = WORLD.W / 2;
    this._panel(0.4);
    this._text(title, cx, WORLD.H / 2 - 10, 44, PAL.hudText, 'center', 'middle', true);
    this._text(sub, cx, WORLD.H / 2 + 34, 16, '#bfe6ff', 'center', 'middle');
  }

  _panel(alpha = 0.55) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(3,15,30,${alpha})`;
    ctx.fillRect(0, 0, WORLD.W, WORLD.H);
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
