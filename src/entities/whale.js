// A benign living whale that drifts through a large reef chamber, its mouth
// slowly opening and closing. Swim into the open mouth to be swallowed — the
// entrance to the belly bonus zone. Authored facing +x (mouth to the right);
// the entity flips with its drift direction.
import { WHALE, PAL } from '../config.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Whale {
  constructor(x, y) {
    this.homeX = x; this.homeY = y;
    this.x = x; this.y = y;
    this.scale = WHALE.scale;
    this.w = TAU / WHALE.mouthCycle;
    this.phase = Math.random() * TAU;
    this.facing = 1;
    this.mouthOpen = 0;
    this.radius = 150 * this.scale;   // rough body radius (unused for collision)
  }

  update(dt, t) {
    this.mouthOpen = clamp01(Math.sin(t * this.w + this.phase) * 1.4);
    this.x = this.homeX + Math.sin(t * 0.2 + this.phase) * 120;
    this.y = this.homeY + Math.sin(t * 0.5 + this.phase) * 16;
    this.facing = Math.cos(t * 0.2 + this.phase) >= 0 ? 1 : -1;
  }

  // The open-mouth cavity the diver enters (world space).
  mouthZone() {
    return { x: this.x + this.facing * this.scale * 150, y: this.y + this.scale * 12, r: this.scale * 42 };
  }
  swallowReady(diver) {
    if (this.mouthOpen < 0.5) return false;
    const m = this.mouthZone();
    return Math.hypot(diver.x - m.x, diver.y - m.y) < m.r + diver.radius;
  }

  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    ctx.scale(this.facing * this.scale, this.scale);
    drawWhaleBody(ctx, this.mouthOpen, t);
    ctx.restore();
  }
}

function drawWhaleBody(ctx, open, t) {
  const L = 180, Hh = 66;
  // body
  const g = ctx.createLinearGradient(0, -Hh, 0, Hh);
  g.addColorStop(0, PAL.whale); g.addColorStop(0.6, PAL.whaleDark); g.addColorStop(1, PAL.whaleBelly);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(-10, 0, L, Hh, 0, 0, TAU); ctx.fill();

  // tail fluke at the back
  ctx.fillStyle = PAL.whaleDark;
  ctx.beginPath();
  ctx.moveTo(-L + 6, 0);
  ctx.quadraticCurveTo(-L - 40, -8, -L - 58, -40);
  ctx.quadraticCurveTo(-L - 30, -12, -L - 6, 0);
  ctx.quadraticCurveTo(-L - 30, 12, -L - 58, 40);
  ctx.quadraticCurveTo(-L - 40, 8, -L + 6, 0);
  ctx.fill();

  // pectoral fin
  ctx.fillStyle = PAL.whaleDark;
  ctx.beginPath();
  ctx.moveTo(-20, 40); ctx.quadraticCurveTo(-30, 90, 20, 74); ctx.quadraticCurveTo(6, 52, -20, 40);
  ctx.fill();

  // belly grooves
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(40 + i * 22, 30); ctx.lineTo(70 + i * 22, 58); ctx.stroke(); }

  // ---- mouth at the front ----
  const jaw = open * 46;          // how far the lower jaw drops
  // dark throat cavity, revealed as the mouth opens
  if (open > 0.05) {
    ctx.save();
    const cav = ctx.createRadialGradient(L * 0.72, 14, 4, L * 0.72, 14, 54);
    cav.addColorStop(0, open > 0.5 ? PAL.throat : '#2a0e12');
    cav.addColorStop(0.5, '#3a1119'); cav.addColorStop(1, '#12060a');
    ctx.globalAlpha = Math.min(1, open * 1.4);
    ctx.fillStyle = cav;
    ctx.beginPath(); ctx.ellipse(L * 0.7, 8 + jaw * 0.4, 40, 26 + jaw * 0.4, 0, 0, TAU); ctx.fill();
    // golden "come in" glow when fully open
    if (open > 0.55) { ctx.globalAlpha = (open - 0.55) * 1.6; ctx.fillStyle = PAL.throat;
      ctx.beginPath(); ctx.arc(L * 0.72, 12 + jaw * 0.3, 10, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // upper jaw / snout
  ctx.fillStyle = PAL.whale;
  ctx.beginPath();
  ctx.moveTo(L * 0.2, -Hh * 0.7);
  ctx.quadraticCurveTo(L * 0.95, -Hh * 0.7, L * 0.98, -6);
  ctx.quadraticCurveTo(L * 0.7, -2, L * 0.4, -8);
  ctx.closePath(); ctx.fill();
  // lower jaw (drops open)
  ctx.fillStyle = PAL.whaleBelly;
  ctx.beginPath();
  ctx.moveTo(L * 0.28, 10);
  ctx.quadraticCurveTo(L * 0.85, 14 + jaw, L * 0.98, 6 + jaw);
  ctx.quadraticCurveTo(L * 0.7, 20 + jaw, L * 0.3, 20);
  ctx.closePath(); ctx.fill();
  // baleen on the upper jaw
  ctx.strokeStyle = 'rgba(20,10,12,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) { const x = L * 0.5 + i * 6; ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, -6 + 8 + open * 6); ctx.stroke(); }

  // eye
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L * 0.42, -22, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#10151c'; ctx.beginPath(); ctx.arc(L * 0.44, -22, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L * 0.45, -23.5, 1.2, 0, TAU); ctx.fill();
}
