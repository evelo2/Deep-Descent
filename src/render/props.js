// Larger scenery props: sunken shipwreck and gemstones. Drawn centred at (0,0).
import { PAL } from '../config.js';
const TAU = Math.PI * 2;

// A broken galleon resting on the seabed/ledge, listing to one side.
export function drawWreck(ctx, t) {
  ctx.save();
  ctx.rotate(-0.12); // list
  // shadow / silt mound
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 44, 120, 20, 0, 0, TAU); ctx.fill();

  // hull
  const hull = ctx.createLinearGradient(0, -20, 0, 50);
  hull.addColorStop(0, '#5a3a22'); hull.addColorStop(1, '#31200f');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-130, -6);
  ctx.quadraticCurveTo(-150, 34, -96, 40);
  ctx.lineTo(96, 40);
  ctx.quadraticCurveTo(150, 30, 120, -12);
  ctx.lineTo(96, -6);
  ctx.quadraticCurveTo(0, 6, -110, -8);
  ctx.closePath(); ctx.fill();

  // hull planks
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-118, 2 + i * 11);
    ctx.quadraticCurveTo(0, 12 + i * 11, 116, -2 + i * 11);
    ctx.stroke();
  }
  // gaping hole in the hull (cave-like opening)
  ctx.fillStyle = '#0a1520';
  ctx.beginPath(); ctx.ellipse(-30, 16, 26, 18, 0.1, 0, TAU); ctx.fill();

  // deck rail + stump masts
  ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-70, -8); ctx.lineTo(-64, -70); ctx.stroke(); // broken mast
  ctx.beginPath(); ctx.moveTo(40, -6); ctx.lineTo(48, -44); ctx.stroke();
  // tattered sail / spar
  ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-92, -52); ctx.lineTo(-36, -60); ctx.stroke();
  ctx.fillStyle = 'rgba(180,170,140,0.18)';
  ctx.beginPath(); ctx.moveTo(-86, -50);
  ctx.quadraticCurveTo(-64, -30 + Math.sin(t) * 4, -44, -58); ctx.lineTo(-86, -50); ctx.fill();

  // portholes glinting
  ctx.fillStyle = PAL.diverGlass;
  for (let i = -2; i <= 2; i++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(i * 34 + 20, 6, 4, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;

  // clinging weeds
  ctx.strokeStyle = PAL.weed; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    const x = i * 30 + 6;
    ctx.beginPath(); ctx.moveTo(x, 38);
    ctx.quadraticCurveTo(x + Math.sin(t * 1.3 + i) * 8, 8, x + Math.sin(t + i) * 10, -18);
    ctx.stroke();
  }
  ctx.restore();
}

// A faceted gemstone — the richest cave/wreck loot.
export function drawGem(ctx, t) {
  ctx.save();
  const s = 1 + Math.sin(t * 3) * 0.06;
  ctx.scale(s, s);
  // glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
  g.addColorStop(0, PAL.gem); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  // facets
  ctx.fillStyle = PAL.gem;
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(9, -3); ctx.lineTo(6, 10); ctx.lineTo(-6, 10); ctx.lineTo(-9, -3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAL.gemCore;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(4, -2); ctx.lineTo(0, 3); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(9, -3); ctx.moveTo(0, 3); ctx.lineTo(0, 10); ctx.stroke();
  ctx.restore();
}
