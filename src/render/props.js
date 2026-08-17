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

// A treasure chest that opens and closes. `open` 0..1 lifts the lid — hinged at
// its LEFT edge, so it swings up like a real lid, not spinning about its middle.
// `shake` (0..1) rattles the whole chest and lid while a bubble forms beneath
// the lid, just before it opens. Authored ~64px wide (radius ~36).
export function drawChestShell(ctx, open, hasLoot, t, shake = 0) {
  ctx.save();
  // Whole-chest rattle while the bubble builds.
  if (shake > 0.02) ctx.translate(Math.sin(t * 37) * 1.6 * shake, Math.sin(t * 53) * 0.8 * shake);

  // silt shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 22, 42, 9, 0, 0, TAU); ctx.fill();

  // glowing treasure inside, revealed as it opens
  if (hasLoot && open > 0.12) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, open * 1.4);
    const g = ctx.createRadialGradient(0, 2, 2, 0, 2, 30);
    g.addColorStop(0, PAL.coralGold); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 2, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = PAL.gold;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 11, 0 - Math.abs(i) * 1.5, 5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = PAL.gem;
    ctx.beginPath(); ctx.arc(6, -2, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // base box
  const wood = ctx.createLinearGradient(0, -2, 0, 24);
  wood.addColorStop(0, '#7a4a24'); wood.addColorStop(1, '#452811');
  ctx.fillStyle = wood;
  ctx.beginPath(); ctx.roundRect(-32, -2, 64, 26, 4); ctx.fill();
  // iron bands
  ctx.fillStyle = '#3a2917';
  for (const bx of [-20, 0, 20]) { ctx.fillRect(bx - 3, -2, 6, 26); }
  ctx.fillStyle = PAL.gold;
  for (const bx of [-20, 0, 20]) { ctx.fillRect(bx - 1, -2, 2, 26); }
  ctx.strokeStyle = '#2c1a0c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-32, -2, 64, 26, 4); ctx.stroke();

  // A bubble forming at the lid seam as the chest rattles.
  if (shake > 0.05) {
    const br = 3 + shake * 8;
    const bx = 6 + Math.sin(t * 41) * 1.5 * shake;
    ctx.strokeStyle = 'rgba(190,235,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(160,220,255,0.16)';
    ctx.beginPath(); ctx.arc(bx, -4, br, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(bx - br * 0.3, -4 - br * 0.3, br * 0.28, 0, TAU); ctx.fill();
  }

  // lid — hinged at the LEFT edge (pivot at the top-left corner), swinging up.
  ctx.save();
  const jA = shake > 0.02 ? Math.sin(t * 44) * 0.05 * shake : 0;
  ctx.translate(-32, -2);
  ctx.rotate(-open * 1.15 - jA);
  const lw = ctx.createLinearGradient(0, -18, 0, 0);
  lw.addColorStop(0, '#8a5528'); lw.addColorStop(1, '#5c3719');
  ctx.fillStyle = lw;
  // lid drawn in local coords 0..64 from the hinge
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, -9);
  ctx.quadraticCurveTo(32, -24, 64, -9); ctx.lineTo(64, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2c1a0c'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(32, -20, 64, -6); ctx.stroke();
  ctx.fillStyle = PAL.gold;
  for (const bx of [12, 32, 52]) { ctx.beginPath(); ctx.arc(bx, -10, 2, 0, TAU); ctx.fill(); }
  // hinge knob at the pivot
  ctx.fillStyle = '#2c1a0c'; ctx.beginPath(); ctx.arc(0, -1, 3, 0, TAU); ctx.fill();
  ctx.restore();

  // front lock plate
  ctx.fillStyle = PAL.gold;
  ctx.beginPath(); ctx.roundRect(-6, 3, 12, 10, 2); ctx.fill();
  ctx.fillStyle = '#5c3719'; ctx.beginPath(); ctx.arc(0, 8, 2, 0, TAU); ctx.fill();
  ctx.restore();
}

// A whale skeleton resting on the deep sea floor. Spine + ribcage + skull, drawn
// centred on the spine; the shadow sits at the floor. ~300px long.
export function drawWhaleSkeleton(ctx, t) {
  const bone = '#e7e2d2';
  const spineY = (x) => -Math.max(0, x + 40) * 0.05;  // slight rise toward the tail
  ctx.save();
  // silt shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(-10, 10, 155, 15, 0, 0, TAU); ctx.fill();

  // ribs arcing up from the spine
  ctx.strokeStyle = bone; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let x = -95; x <= 60; x += 20) {
    const y = spineY(x);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 16, y - 34, x - 4, y - 58); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 16, y - 34, x + 4, y - 58); ctx.stroke();
  }

  // spine
  ctx.strokeStyle = bone; ctx.lineWidth = 7;
  ctx.beginPath();
  for (let x = -150; x <= 130; x += 10) { const y = spineY(x); x === -150 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.fillStyle = bone;
  for (let x = -120; x <= 110; x += 18) { ctx.beginPath(); ctx.arc(x, spineY(x), 5, 0, TAU); ctx.fill(); }

  // skull at the left
  ctx.save(); ctx.translate(-150, 0);
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.moveTo(2, -9); ctx.quadraticCurveTo(-48, -11, -66, 2);
  ctx.quadraticCurveTo(-48, 13, 2, 9); ctx.quadraticCurveTo(12, 0, 2, -9); ctx.fill();
  ctx.strokeStyle = bone; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-2, 9); ctx.quadraticCurveTo(-44, 22, -62, 7); ctx.stroke();  // lower jaw
  ctx.fillStyle = '#2f2f28'; ctx.beginPath(); ctx.arc(-12, -1, 4, 0, TAU); ctx.fill();      // eye socket
  ctx.restore();

  // tail flukes
  ctx.save(); ctx.translate(122, spineY(122));
  ctx.strokeStyle = bone; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, -15); ctx.moveTo(0, 0); ctx.lineTo(20, 9); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// A single curved rib bone lining the belly. `dir` +1 curves right, -1 left.
export function drawRib(ctx, t, dir = 1) {
  ctx.save();
  ctx.scale(dir, 1);
  ctx.strokeStyle = PAL.rib; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -120);
  ctx.quadraticCurveTo(70, -10, 30, 120);
  ctx.stroke();
  // subtle shading
  ctx.strokeStyle = 'rgba(120,90,90,0.25)'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, -115); ctx.quadraticCurveTo(66, -10, 28, 112); ctx.stroke();
  ctx.restore();
}

// The throat exit inside the whale — a glowing swirl you swim into to leave.
export function drawThroat(ctx, t, r = 44) {
  ctx.save();
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.6);
  glow.addColorStop(0, PAL.throat); glow.addColorStop(0.5, '#c96a3a'); glow.addColorStop(1, 'rgba(120,40,30,0)');
  ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.15;
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // rings
  for (let i = 3; i >= 1; i--) {
    ctx.strokeStyle = `rgba(255,210,122,${0.25 * i})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * (i / 3) * (0.9 + Math.sin(t * 2 + i) * 0.06), 0, TAU); ctx.stroke();
  }
  // dark centre
  ctx.fillStyle = '#2a0e0c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
  // "EXIT" arrow up
  ctx.fillStyle = PAL.throat;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-6, 4); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
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
