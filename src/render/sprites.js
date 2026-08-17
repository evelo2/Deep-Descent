// Procedural vector sprites — the "updated graphics". Each function draws the
// creature centred at (0,0); callers translate/scale/flip via the ctx transform.
import { PAL } from '../config.js';

const TAU = Math.PI * 2;

function glow(ctx, r, color, alpha = 0.5) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

// Diver faces +x. `kick` animates the fins, `hurt` flashes red.
export function drawDiver(ctx, t, kick, hurt) {
  ctx.save();
  // fins
  const fin = Math.sin(kick) * 0.5;
  ctx.fillStyle = PAL.diverSuit;
  ctx.save(); ctx.translate(-16, 0); ctx.rotate(fin);
  ctx.beginPath(); ctx.ellipse(-6, 0, 10, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
  // body
  ctx.fillStyle = hurt ? PAL.danger : PAL.diverSuit;
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, TAU); ctx.fill();
  // tank
  ctx.fillStyle = '#4a5c78';
  ctx.beginPath(); ctx.roundRect(-12, -9, 7, 12, 3); ctx.fill();
  // arm
  ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(15, 6 + Math.sin(kick) * 2); ctx.stroke();
  // helmet + glass
  ctx.fillStyle = PAL.diver;
  ctx.beginPath(); ctx.arc(11, -2, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = PAL.diverGlass;
  ctx.beginPath(); ctx.arc(13, -2, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(14.5, -3.5, 1.5, 0, TAU); ctx.fill();
  ctx.restore();
}

// Giant clam. `open` 0..1. Pearl visible while shell is open.
export function drawClam(ctx, open, hasPearl, t) {
  ctx.save();
  const ang = 0.15 + open * 0.9;
  // pearl
  if (hasPearl) {
    ctx.save(); ctx.translate(0, -6);
    glow(ctx, 16, PAL.glow, 0.35 + Math.sin(t * 3) * 0.1);
    const pg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, PAL.pearl);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // lower shell
  drawShell(ctx, 1, 0);
  // upper shell (hinges open)
  drawShell(ctx, -1, ang);
  ctx.restore();

  function drawShell(ctx, dir, rot) {
    ctx.save();
    ctx.translate(0, 2 * dir);
    ctx.rotate(-rot * dir);
    const grad = ctx.createLinearGradient(0, -18 * dir, 0, 4 * dir);
    grad.addColorStop(0, PAL.clam); grad.addColorStop(1, PAL.clamDark);
    ctx.fillStyle = dir < 0 ? grad : PAL.clamDark;
    ctx.beginPath();
    ctx.moveTo(-28, 2 * dir);
    ctx.quadraticCurveTo(0, -20 * dir, 28, 2 * dir);
    ctx.quadraticCurveTo(0, 8 * dir, -28, 2 * dir);
    ctx.fill();
    // ribs
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 9, 2 * dir);
      ctx.quadraticCurveTo(i * 11, -12 * dir, i * 6, -16 * dir);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawOctopus(ctx, t, hurt) {
  ctx.save();
  ctx.fillStyle = hurt ? PAL.danger : PAL.octo;
  // tentacles
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const sway = Math.sin(t * 4 + i) * 6;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.quadraticCurveTo(Math.cos(a) * 16, 18 + sway, Math.cos(a) * 22, 26 + sway);
    ctx.lineWidth = 5; ctx.strokeStyle = hurt ? PAL.danger : PAL.octo; ctx.lineCap = 'round';
    ctx.stroke();
  }
  // head
  const g = ctx.createRadialGradient(-4, -6, 2, 0, 0, 20);
  g.addColorStop(0, '#e57fac'); g.addColorStop(1, PAL.octo);
  ctx.fillStyle = hurt ? PAL.danger : g;
  ctx.beginPath(); ctx.ellipse(0, -2, 17, 16, 0, 0, TAU); ctx.fill();
  // eyes
  eye(ctx, -6, -4); eye(ctx, 6, -4);
  ctx.restore();
}

export function drawShark(ctx, t, hurt) {
  ctx.save();
  const swim = Math.sin(t * 6) * 5;
  ctx.fillStyle = hurt ? PAL.danger : PAL.shark;
  // body
  ctx.beginPath();
  ctx.moveTo(-34, swim * 0.3);
  ctx.quadraticCurveTo(-6, -16, 30, 0);
  ctx.quadraticCurveTo(-6, 16, -34, swim * 0.3);
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(-30, 0); ctx.lineTo(-44, -12 + swim); ctx.lineTo(-40, 0);
  ctx.lineTo(-44, 12 + swim); ctx.closePath(); ctx.fill();
  // dorsal + pectoral fin
  ctx.beginPath(); ctx.moveTo(-2, -12); ctx.lineTo(6, -24); ctx.lineTo(12, -11); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 8); ctx.lineTo(8, 20); ctx.lineTo(16, 8); ctx.fill();
  // belly
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.moveTo(-20, 6); ctx.quadraticCurveTo(6, 15, 26, 3);
  ctx.quadraticCurveTo(4, 10, -20, 6); ctx.fill();
  // eye + gills
  ctx.fillStyle = '#0a0f16';
  ctx.beginPath(); ctx.arc(18, -3, 2.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(6 + i * 4, -7); ctx.lineTo(6 + i * 4, 6); ctx.stroke(); }
  ctx.restore();
}

export function drawJelly(ctx, t, hurt) {
  ctx.save();
  const pulse = 1 + Math.sin(t * 3) * 0.12;
  glow(ctx, 22, PAL.jelly, 0.25);
  ctx.fillStyle = hurt ? PAL.danger : 'rgba(185,140,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, -4, 14 * pulse, 12, 0, Math.PI, TAU);
  ctx.quadraticCurveTo(10, 2, 14 * pulse, -4);
  ctx.quadraticCurveTo(0, 8, -14 * pulse, -4);
  ctx.fill();
  // frilled bell edge
  ctx.beginPath(); ctx.moveTo(-14 * pulse, -4);
  for (let i = 0; i <= 6; i++) {
    const x = -14 * pulse + (i / 6) * 28 * pulse;
    ctx.quadraticCurveTo(x, 4, x + 2, -1);
  }
  ctx.fillStyle = 'rgba(210,180,255,0.6)'; ctx.fill();
  // tentacles
  ctx.strokeStyle = hurt ? PAL.danger : 'rgba(200,170,255,0.7)'; ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(i * 4, 0);
    ctx.quadraticCurveTo(i * 4 + Math.sin(t * 4 + i) * 5, 16, i * 4, 26); ctx.stroke();
  }
  ctx.restore();
}

export function drawPuffer(ctx, t, hurt) {
  ctx.save();
  const puff = 1 + Math.sin(t * 2) * 0.08;
  ctx.fillStyle = hurt ? PAL.danger : PAL.puffer;
  ctx.beginPath(); ctx.arc(0, 0, 15 * puff, 0, TAU); ctx.fill();
  // spikes
  ctx.strokeStyle = hurt ? PAL.danger : '#e07a2a'; ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14 * puff, Math.sin(a) * 14 * puff);
    ctx.lineTo(Math.cos(a) * 21 * puff, Math.sin(a) * 21 * puff);
    ctx.stroke();
  }
  // tail + eye
  ctx.fillStyle = hurt ? PAL.danger : '#e07a2a';
  ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-22, -7); ctx.lineTo(-22, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7, -3, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(8, -3, 1.7, 0, TAU); ctx.fill();
  ctx.restore();
}

// Treasure: chest or coin.
export function drawTreasure(ctx, kind, t) {
  ctx.save();
  glow(ctx, 16, PAL.gold, 0.28 + Math.sin(t * 4) * 0.08);
  if (kind === 'coin') {
    ctx.fillStyle = PAL.gold;
    ctx.beginPath(); ctx.ellipse(0, 0, 7 * Math.abs(Math.cos(t * 2)) + 2, 8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = PAL.goldDark; ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    ctx.fillStyle = '#7a4a23';
    ctx.beginPath(); ctx.roundRect(-12, -4, 24, 14, 2); ctx.fill();
    ctx.fillStyle = '#5c3417';
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.quadraticCurveTo(0, -16, 12, -4); ctx.lineTo(12, -1);
    ctx.quadraticCurveTo(0, -12, -12, -1); ctx.fill();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath(); ctx.roundRect(-2, -5, 4, 4, 1); ctx.fill();
    // spilling gold
    ctx.fillStyle = PAL.gold;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 4, -3, 2, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

function eye(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.arc(x + 0.5, y, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
}
