// Game orchestration: state machine, 2D world generation, 2D camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, GAME, CAVE, HARPOON, SHARK, SHELL, BUBBLE, PAL } from './config.js';
import { Diver } from './entities/diver.js';
import { Boat } from './entities/boat.js';
import { Clam, Chest } from './entities/shell.js';
import { BigBubble } from './entities/bigbubble.js';
import { Treasure } from './entities/treasure.js';
import { Shark, Octopus, Jelly, Puffer } from './entities/creatures.js';
import { Cave } from './systems/cave.js';
import { Flora } from './render/flora.js';
import { Harpoon } from './entities/harpoon.js';
import { AirVent } from './entities/airvent.js';
import { Wreck } from './entities/wreck.js';

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
    this.shells = []; this.bigBubbles = [];
    this.diver.reset();
  }

  // ---- lifecycle -------------------------------------------------------
  start() {
    this.state = 'playing';
    this.score = 0; this.carried = 0; this.lives = GAME.startLives;
    this.air = AIR.max; this.depthReached = 0; this.fireCd = 0;
    this.won = false; this.newHi = false;
    this.diver.reset();
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this._generateWorld();
    this.audio.select();
  }

  _generateWorld() {
    const C = this.cave = new Cave();
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.bigBubbles = [];
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

    // Creatures, including sharks of varied sizes.
    for (let i = 0; i < 34; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const deep = c.y / WH, r = Math.random();
      if (deep > 0.4 && r < 0.4) this.creatures.push(new Shark(c.x, c.y, SHARK.minScale + Math.random() * (SHARK.maxScale - SHARK.minScale)));
      else if (deep > 0.25 && r < 0.4) this.creatures.push(new Octopus(c.x, c.y));
      else if (r < 0.55) this.creatures.push(new Jelly(c.x, c.y));
      else this.creatures.push(new Puffer(c.x, c.y));
    }
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

    if (this.input.pressed('pause')) this.onAction();
    if (this.input.pressed('mute')) { this.audio.ensure(); this.muted = this.audio.toggleMute(); }

    if (this.state !== 'playing') { this.input.endFrame(); return; }
    if (this.input.consumeTapFire()) this.fire();
    this.fireCd = Math.max(0, this.fireCd - dt);

    const intent = this.input.vector();
    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y));
    this.cave.collide(this.diver);

    // 2D camera follows the diver, clamped to the world.
    const tx = Math.max(0, Math.min(WW - W, this.diver.x - W / 2));
    const ty = Math.max(0, Math.min(WH - H, this.diver.y - H / 2));
    this.camX += (tx - this.camX) * Math.min(1, dt * 6);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    this.depthReached = Math.max(this.depthReached, this.diver.y - WORLD.SURFACE);
    this.audio.setDepth(Math.min(1, this.camY / WH));

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
    const emitBig = (x, y) => this.bigBubbles.push(new BigBubble(x, y));
    for (const s of this.shells) s.update(dt, this.t, emitBig);
    for (const b of this.bigBubbles) b.update(dt, this.cave);
    for (const tr of this.treasures) tr.update(dt, this.t);
    for (const cr of this.creatures) {
      cr.update(dt, this.t, this.diver);
      if (this.cave.collide(cr) && cr.dir !== undefined) cr.dir = cr._nx > 0 ? -1 : 1; // turn off walls
    }
    for (const h of this.harpoons) h.update(dt, this.cave);

    this._collisions();

    this.treasures = this.treasures.filter((tr) => !tr.taken);
    this.creatures = this.creatures.filter((cr) => !cr.dead);
    this.harpoons = this.harpoons.filter((h) => !h.dead);
    this.bigBubbles = this.bigBubbles.filter((b) => !b.dead);

    if (this.shells.every((s) => !s.hasLoot) && this.treasures.length === 0 && this.carried === 0 && this.diver.atSurface) this._win();

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

  // ---- render ----------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const cx = this.camX, cy = this.camY;
    const depthT = Math.min(1, cy / WH);
    this.bg.draw(ctx, cx, cy, this.t, depthT);
    this.boat.draw(ctx, cx, cy, this.t);

    if (this.state !== 'menu') {
      if (this.flora) this.flora.draw(ctx, cx, cy, this.t);
      for (const w of this.wrecks) w.draw(ctx, cx, cy, this.t);
      for (const tr of this.treasures) tr.draw(ctx, cx, cy, this.t);
      for (const s of this.shells) s.draw(ctx, cx, cy, this.t);
      for (const cr of this.creatures) cr.draw(ctx, cx, cy, this.t);
      if (this.cave) this.cave.draw(ctx, cx, cy);   // rock occludes actors inside walls
      for (const v of this.vents) v.draw(ctx, cx, cy, this.t);
      for (const b of this.bigBubbles) b.draw(ctx, cx, cy);
      for (const h of this.harpoons) h.draw(ctx, cx, cy);
    }

    this.particles.draw(ctx, cx, cy);
    if (this.state !== 'menu') this.diver.draw(ctx, cx, cy);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`;
      ctx.fillRect(0, 0, W, H);
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
    this._text(`HI ${this.hi}`, W / 2, 22, 14, '#bfe6ff', 'center', 'top');
    if (this.muted) this._text('MUTED', W / 2, 42, 11, '#ff9a6b', 'center', 'top');

    if (this.boat.contains(this.diver)) this._text('◆ DOCKED — refilling air & banking treasure', W / 2, H - 30, 15, PAL.air, 'center', 'middle');
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
