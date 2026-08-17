// Game orchestration: state machine, world generation, camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, GAME, PAL } from './config.js';
import { Diver } from './entities/diver.js';
import { Boat } from './entities/boat.js';
import { Clam } from './entities/clam.js';
import { Treasure } from './entities/treasure.js';
import { Shark, Octopus, Jelly, Puffer } from './entities/creatures.js';

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
    this._seedMenu();
  }

  // ---- lifecycle -------------------------------------------------------
  _seedMenu() { this.diver.reset(); this.camY = 0; }

  start() {
    this.state = 'playing';
    this.score = 0; this.carried = 0; this.lives = GAME.startLives;
    this.air = AIR.max; this.depthReached = 0;
    this.won = false; this.newHi = false;
    this.diver.reset();
    this._generateWorld();
    this.audio.select();
  }

  _generateWorld() {
    this.clams = []; this.treasures = []; this.creatures = [];
    const top = WORLD.SURFACE + 260;
    const bottom = WORLD.DEPTH_MAX + WORLD.SEABED - 40;

    // Clams with pearls — more frequent and richer deeper.
    for (let y = top; y < bottom; y += 300 + Math.random() * 160) {
      const n = 1 + (Math.random() < (y / bottom) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = 80 + Math.random() * (WORLD.W - 160);
        this.clams.push(new Clam(x, y + (Math.random() - 0.5) * 120));
      }
    }
    // Scattered treasure.
    for (let y = top; y < bottom; y += 220 + Math.random() * 140) {
      const deep = y / bottom;
      const kind = Math.random() < 0.25 + deep * 0.3 ? 'chest' : 'coin';
      this.treasures.push(new Treasure(60 + Math.random() * (WORLD.W - 120), y, kind));
    }
    // Creatures by depth band — density and danger rise with depth.
    for (let y = top; y < bottom; y += 260) {
      const deep = y / bottom;
      const x = Math.random() * WORLD.W;
      const r = Math.random();
      if (deep > 0.55 && r < 0.4) this.creatures.push(new Shark(x, y));
      else if (deep > 0.3 && r < 0.4) this.creatures.push(new Octopus(x, y));
      else if (r < 0.5) this.creatures.push(new Jelly(x, y));
      else this.creatures.push(new Puffer(x, y));
      if (deep > 0.7 && Math.random() < 0.5) this.creatures.push(new Shark(Math.random() * WORLD.W, y + 120));
    }
  }

  // ---- input events (from main) ---------------------------------------
  onAction() {
    if (this.state === 'menu' || this.state === 'gameover') { this.audio.ensure(); this.audio.resume(); this.start(); }
    else if (this.state === 'paused') this.state = 'playing';
    else if (this.state === 'playing') this.state = 'paused';
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

    const intent = this.input.vector();
    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y));

    // Camera follows the diver, clamped to the world.
    const target = Math.max(0, Math.min(WORLD.DEPTH_MAX, this.diver.y - WORLD.H / 2));
    this.camY += (target - this.camY) * Math.min(1, dt * 6);
    this.depthReached = Math.max(this.depthReached, this.diver.y - WORLD.SURFACE);
    this.audio.setDepth(Math.min(1, this.camY / WORLD.DEPTH_MAX));

    // Air economy.
    const docked = this.boat.contains(this.diver);
    if (docked) {
      if (this.air < AIR.max) { this.air = Math.min(AIR.max, this.air + AIR.refillPerSec * dt); if (Math.random() < 0.3) this.audio.refill(); }
      if (this.carried > 0) { this.score += this.carried; this.carried = 0; this.bankPulse = 1; this.audio.bank(); }
    } else {
      const depthT = this.diver.y / (WORLD.DEPTH_MAX + WORLD.SEABED);
      this.air -= (AIR.drainPerSec + this.diver.y * AIR.drainDepthFactor) * dt;
      if (this.air <= 0) { this.air = 0; this._loseLife('drowned'); }
      else if (this.air < 20 && Math.random() < 0.02) this.audio.gasp();
    }

    // Entities.
    for (const c of this.clams) c.update(dt, this.t);
    for (const tr of this.treasures) tr.update(dt, this.t);
    for (const cr of this.creatures) cr.update(dt, this.t, this.diver);

    this._collisions();

    // Cull collected/gone.
    this.clams = this.clams.filter((c) => !c.gone);
    this.treasures = this.treasures.filter((tr) => !tr.taken);

    // Win condition: all pearls collected and banked, diver back at surface.
    if (this.clams.every((c) => !c.hasPearl) && this.treasures.length === 0 && this.carried === 0 && this.diver.atSurface) {
      this._win();
    }

    this.input.endFrame();
  }

  _collisions() {
    const d = this.diver;
    // Treasure.
    for (const tr of this.treasures) {
      if (!tr.taken && tr.reached(d)) {
        tr.taken = true; this.carried += tr.value;
        this.particles.sparkle(tr.x, tr.y, PAL.gold, 16);
        this.audio.pickup();
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
    // Creatures.
    if (d.invuln <= 0) {
      for (const cr of this.creatures) { if (cr.hits(d)) { this._hit(); break; } }
    }
  }

  _hit() {
    this.diver.hit(); this.flash = 1; this.shake = 12;
    this.audio.hit();
    this._loseLife('hit');
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
    // Bonus for remaining air and lives, then game over screen as victory.
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
      for (const tr of this.treasures) tr.draw(ctx, this.camY, this.t);
      for (const c of this.clams) c.draw(ctx, this.camY, this.t);
      for (const cr of this.creatures) cr.draw(ctx, this.camY, this.t);
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
    // Top gradient scrim for legibility.
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

    // Score / carried / depth / high.
    this._text(`SCORE ${this.score}`, WORLD.W - 20, 22, 18, PAL.hudText, 'right', 'top');
    const cp = this.bankPulse > 0 ? PAL.gold : PAL.hudText;
    this._text(`CARRYING ${this.carried}`, WORLD.W - 20, 46, 14, cp, 'right', 'top');
    const depthM = Math.round(this.depthReached / 10);
    this._text(`DEPTH ${depthM} m`, WORLD.W - 20, 66, 13, '#bfe6ff', 'right', 'top');
    this._text(`HI ${this.hi}`, WORLD.W / 2, 22, 14, '#bfe6ff', 'center', 'top');
    if (this.muted) this._text('MUTED', WORLD.W / 2, 42, 11, '#ff9a6b', 'center', 'top');

    // Docked prompt.
    if (this.boat.contains(this.diver)) this._text('◆ DOCKED — refilling air & banking treasure', WORLD.W / 2, WORLD.H - 30, 15, PAL.air, 'center', 'middle');
    ctx.restore();
  }

  _menu() {
    const ctx = this.ctx, cx = WORLD.W / 2;
    this._panel();
    this._text('DEEP DESCENT', cx, 200, 58, PAL.glow, 'center', 'middle', true);
    this._text('a modern homage to Durell’s SCUBA DIVE (1983)', cx, 246, 16, '#bfe6ff', 'center', 'middle');
    this._text('Dive for pearls & treasure — surface to bank your haul.', cx, 320, 17, PAL.hudText, 'center', 'middle');
    this._text('Watch your AIR. Dodge the deep’s hunters.', cx, 346, 17, PAL.hudText, 'center', 'middle');
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE', cx, 420, 22, PAL.gold, 'center', 'middle', true);
    this._text('Move: Arrows / WASD / drag   ·   Pause: P   ·   Mute: M', cx, 470, 13, '#9fc6e0', 'center', 'middle');
    if (this.hi > 0) this._text(`BEST ${this.hi}`, cx, 500, 14, '#bfe6ff', 'center', 'middle');
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
