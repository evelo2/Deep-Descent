// Floating power-up pickups.
//   tank      — permanently raises max air for the run
//   multifire — timed 3-way harpoon spread
//   shield    — timed invulnerability
//   speed     — timed faster swimming
//   magnet    — timed treasure magnet
//   life      — one-off +1 life
import { PAL } from '../config.js';
const TAU = Math.PI * 2;

const COLORS = {
  tank: PAL.air, multifire: PAL.harpoonTip, shield: PAL.gateGlow,
  speed: PAL.air, magnet: PAL.gold, life: PAL.diver, ammo: PAL.harpoon, flare: '#ff7a3c',
};

export class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.baseY = y;
    this.type = type; this.phase = Math.random() * TAU;
    this.taken = false; this.radius = 16;
  }
  update(dt, t) {
    this.y = this.baseY + Math.sin(t * 1.5 + this.phase) * 5;
    this.flash = 0.5 + 0.5 * Math.sin(t * 6 + this.phase);   // 0..1 fast blink so it grabs the eye
  }
  reached(d) { return Math.hypot(d.x - this.x, d.y - this.y) < this.radius + d.radius; }

  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    const col = COLORS[this.type] || PAL.air;
    const f = this.flash !== undefined ? this.flash : 0.5;
    // Pulsing glow halo.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.32 + 0.42 * f; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 26 + 6 * f, 0, TAU); ctx.fill();
    // Flashing ring around it.
    ctx.globalAlpha = 0.35 + 0.6 * f;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 19 + 3 * f, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    // Icon, breathing slightly with the flash.
    const s = 1 + 0.09 * f; ctx.scale(s, s);
    ({ tank, multifire: multi, shield, speed, magnet, life, ammo, flare })[this.type](ctx);
    ctx.restore();
  }
}

// A flare (light source for dark caves).
function flare(ctx) {
  ctx.fillStyle = '#c9cdd2'; ctx.beginPath(); ctx.roundRect(-3, -10, 6, 20, 2); ctx.fill();   // stick
  ctx.fillStyle = '#ff7a3c'; ctx.beginPath(); ctx.arc(0, -11, 5, 0, TAU); ctx.fill();          // burning tip
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(-1, -12, 2.4, 0, TAU); ctx.fill();
}

// A bundle of harpoons (spare ammo).
function ammo(ctx) {
  for (const dx of [-5, 0, 5]) {
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dx, 9); ctx.lineTo(dx, -8); ctx.stroke();
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath(); ctx.moveTo(dx, -12); ctx.lineTo(dx - 4, -6); ctx.lineTo(dx + 4, -6); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 2;   // binding
  ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(8, 2); ctx.stroke();
}

function tank(ctx) {
  ctx.fillStyle = '#3fae9a';
  ctx.beginPath(); ctx.roundRect(-9, -13, 18, 26, 7); ctx.fill();
  ctx.fillStyle = '#2b7d6f'; ctx.fillRect(-9, -2, 18, 4);
  ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.roundRect(-3, -18, 6, 6, 2); ctx.fill();
  ctx.fillStyle = '#eaf6ff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', 0, 1);
}
function multi(ctx) {
  for (const a of [-0.45, 0, 0.45]) {
    ctx.save(); ctx.rotate(a);
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -8); ctx.stroke();
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-5, -7); ctx.lineTo(5, -7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function shield(ctx) {
  ctx.fillStyle = PAL.gateGlow;
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.lineTo(11, -8); ctx.lineTo(11, 3);
  ctx.quadraticCurveTo(11, 12, 0, 16); ctx.quadraticCurveTo(-11, 12, -11, 3);
  ctx.lineTo(-11, -8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#1a3a4a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-1, 5); ctx.lineTo(5, -5); ctx.stroke();   // check mark
}
function speed(ctx) {
  ctx.strokeStyle = PAL.air; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const dx of [-6, 1, 8]) {
    ctx.beginPath(); ctx.moveTo(dx - 6, -8); ctx.lineTo(dx + 2, 0); ctx.lineTo(dx - 6, 8); ctx.stroke();
  }
}
function magnet(ctx) {
  ctx.strokeStyle = '#d94a4a'; ctx.lineWidth = 7; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(0, -2, 9, Math.PI, TAU); ctx.stroke();      // horseshoe
  ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-9, 8); ctx.moveTo(9, -2); ctx.lineTo(9, 8); ctx.stroke();
  ctx.fillStyle = '#cfd8dc'; ctx.fillRect(-12.5, 8, 7, 5); ctx.fillRect(5.5, 8, 7, 5);   // poles
}
function life(ctx) {
  ctx.fillStyle = PAL.diver; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
  ctx.fillStyle = PAL.diverGlass; ctx.beginPath(); ctx.arc(3, -1, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('1UP', 0, 12);
}
