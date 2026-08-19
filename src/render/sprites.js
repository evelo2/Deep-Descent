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
export function drawDiver(ctx, t, kick, hurt, aimA = null) {
  ctx.save();
  // fins — held steadier while bracing to aim
  const fin = Math.sin(kick) * (aimA === null ? 0.5 : 0.15);
  ctx.fillStyle = PAL.diverSuit;
  ctx.save(); ctx.translate(-16, 0); ctx.rotate(fin);
  ctx.beginPath(); ctx.ellipse(-6, 0, 10, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
  // body
  ctx.fillStyle = hurt ? PAL.danger : PAL.diverSuit;
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, TAU); ctx.fill();
  // tank
  ctx.fillStyle = '#4a5c78';
  ctx.beginPath(); ctx.roundRect(-12, -9, 7, 12, 3); ctx.fill();
  if (aimA === null) {
    // arm — relaxed
    ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(15, 6 + Math.sin(kick) * 2); ctx.stroke();
  } else {
    // aiming — extend both arms and level the harpoon along the aim direction
    const ax = Math.cos(aimA), ay = Math.sin(aimA);
    const sx = 4, sy = 0;                        // shoulder
    ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ax * 13, sy + ay * 13); ctx.stroke();
    // harpoon held out along the aim
    const hx = sx + ax * 9, hy = sy + ay * 9;
    ctx.strokeStyle = PAL.harpoon; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(hx - ax * 7, hy - ay * 7); ctx.lineTo(hx + ax * 17, hy + ay * 17); ctx.stroke();
    // barbed tip
    const tx = hx + ax * 17, ty = hy + ay * 17, px = -ay, py = ax;
    ctx.fillStyle = PAL.harpoonTip;
    ctx.beginPath();
    ctx.moveTo(tx + ax * 4, ty + ay * 4);
    ctx.lineTo(tx + px * 3, ty + py * 3);
    ctx.lineTo(tx - px * 3, ty - py * 3);
    ctx.closePath(); ctx.fill();
  }
  // helmet + glass
  ctx.fillStyle = PAL.diver;
  ctx.beginPath(); ctx.arc(11, -2, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = PAL.diverGlass;
  ctx.beginPath(); ctx.arc(13, -2, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(14.5, -3.5, 1.5, 0, TAU); ctx.fill();
  ctx.restore();
}

// Giant clam — a scallop whose two shells HINGE at the back-left edge and open
// like a mouth (not a middle pivot). `open` 0..1; `shake` rattles it while a
// bubble forms just before it opens. Pearl sits inside, revealed when open.
export function drawClam(ctx, open, hasPearl, t, shake = 0) {
  ctx.save();
  if (shake > 0.02) ctx.translate(Math.sin(t * 38) * 1.4 * shake, Math.sin(t * 51) * 0.7 * shake);
  const hinge = -26;              // hinge at the back-left corner
  const gape = open * 1.0;        // opening angle of each half

  // pearl inside, revealed as it opens
  if (hasPearl && open > 0.12) {
    ctx.save(); ctx.translate(hinge + 20, -1);
    glow(ctx, 15, PAL.glow, (0.3 + Math.sin(t * 3) * 0.1) * Math.min(1, open * 1.6));
    const pg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, PAL.pearl);
    ctx.globalAlpha = Math.min(1, open * 1.6);
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // forming bubble at the mouth while rattling
  if (shake > 0.05) {
    const br = 3 + shake * 7, bx = hinge + 34, by = -2 + Math.sin(t * 43) * 1.2 * shake;
    ctx.strokeStyle = 'rgba(190,235,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(160,220,255,0.16)';
    ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); ctx.stroke();
  }

  const jitter = shake > 0.02 ? Math.sin(t * 45) * 0.04 * shake : 0;
  drawShell(ctx, 1, gape * 0.4 + jitter);   // lower shell opens down a little
  drawShell(ctx, -1, gape + jitter);        // upper shell opens up

  ctx.restore();

  // A scallop half, hinged at (hinge,0), fanning out to the right (+x).
  function drawShell(ctx, dir, rot) {
    ctx.save();
    ctx.translate(hinge, 0);
    ctx.rotate(-rot * dir);
    const grad = ctx.createLinearGradient(0, -20 * dir, 0, 2 * dir);
    grad.addColorStop(0, PAL.clam); grad.addColorStop(1, PAL.clamDark);
    ctx.fillStyle = dir < 0 ? grad : PAL.clamDark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(26, -24 * dir, 52, -3 * dir);
    ctx.quadraticCurveTo(26, -6 * dir, 0, 0);
    ctx.fill();
    // radiating ribs
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1.5;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(2, -1 * dir);
      ctx.quadraticCurveTo(i * 11, -18 * dir, i * 12 + 2, -3 * dir);
      ctx.stroke();
    }
    // hinge knob
    ctx.fillStyle = PAL.clamDark; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
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

// Anglerfish — deep-sea hunter with a bioluminescent lure on a stalk.
export function drawAngler(ctx, t, hurt) {
  ctx.save();
  const lx = 12 + Math.sin(t * 2) * 3, ly = -24 + Math.cos(t * 1.5) * 2;
  // lure stalk + glowing bulb
  ctx.strokeStyle = '#2b3f4a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(4, -14); ctx.quadraticCurveTo(10, -24, lx, ly); ctx.stroke();
  const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 15);
  lg.addColorStop(0, '#d9fff2'); lg.addColorStop(0.4, '#7dffcf'); lg.addColorStop(1, 'rgba(120,255,220,0)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#eafff6'; ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, TAU); ctx.fill();
  // body
  ctx.fillStyle = hurt ? PAL.danger : '#254550';
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, TAU); ctx.fill();
  // tail
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-30, -10); ctx.lineTo(-27, 0); ctx.lineTo(-30, 10); ctx.closePath(); ctx.fill();
  // gaping lower jaw
  ctx.fillStyle = hurt ? PAL.danger : '#152a31';
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(20, 3, 21, 11); ctx.quadraticCurveTo(13, 18, 0, 14); ctx.fill();
  // teeth
  ctx.fillStyle = '#eef';
  for (let i = 0; i < 5; i++) { const tx = 5 + i * 3.2; ctx.beginPath(); ctx.moveTo(tx, 6); ctx.lineTo(tx + 1.5, 10); ctx.lineTo(tx + 3, 6); ctx.fill(); }
  // eye
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -4, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(7, -4, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
}

// Moray eel — long serpentine body that undulates as it swims (+x = forward).
export function drawEel(ctx, t, hurt) {
  ctx.save();
  const wave = (i) => Math.sin(t * 6 - i * 0.7) * 7;
  ctx.strokeStyle = hurt ? PAL.danger : '#4a7a52'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const x = -46 + i * 9.2, y = wave(i); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.strokeStyle = hurt ? PAL.danger : '#6fae78'; ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const x = -46 + i * 9.2, y = wave(i) + 3; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  const hx = 46, hy = wave(10);
  ctx.fillStyle = hurt ? PAL.danger : '#4a7a52';
  ctx.beginPath(); ctx.ellipse(hx, hy, 9, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#20301f'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx + 3, hy + 2); ctx.lineTo(hx + 9, hy + 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + 1, hy - 2, 2.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(hx + 2, hy - 2, 1.1, 0, TAU); ctx.fill();
  ctx.restore();
}

// Piranha — small, fast swarm fish: sharp triangular body, forked tail, tiny
// teeth, reddish-silver. Drawn small (~9px) — economy over detail.
export function drawPiranha(ctx, t, hurt) {
  ctx.save();
  const swim = Math.sin(t * 10) * 2;
  // forked tail
  ctx.fillStyle = hurt ? PAL.danger : '#c23b3b';
  ctx.beginPath();
  ctx.moveTo(-6, swim * 0.4); ctx.lineTo(-13, -5 + swim); ctx.lineTo(-9, 0); ctx.lineTo(-13, 5 + swim);
  ctx.closePath(); ctx.fill();
  // sharp triangular body
  const g = ctx.createLinearGradient(-8, 0, 9, 0);
  g.addColorStop(0, '#c23b3b'); g.addColorStop(1, '#d8d8e0');
  ctx.fillStyle = hurt ? PAL.danger : g;
  ctx.beginPath();
  ctx.moveTo(-8, swim * 0.4);
  ctx.quadraticCurveTo(-2, -6, 9, 0);
  ctx.quadraticCurveTo(-2, 6, -8, swim * 0.4);
  ctx.fill();
  // dorsal fin
  ctx.fillStyle = hurt ? PAL.danger : '#a52d2d';
  ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(1, -8); ctx.lineTo(3, -4); ctx.fill();
  // tiny teeth
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(6, -1); ctx.lineTo(7, 1); ctx.lineTo(8, -1); ctx.fill();
  // eye
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(4, -1.5, 1, 0, TAU); ctx.fill();
  ctx.restore();
}

// Stonefish — lumpy, rock-mottled bottom-dweller with venomous dorsal spines.
// Drab greens/browns so it reads as camouflage against the seabed; the caller
// (Stonefish.draw) sets globalAlpha to fade it in/out of hiding.
export function drawStonefish(ctx, t, hurt) {
  ctx.save();
  // lumpy, warty body — an irregular blob rather than a clean ellipse
  ctx.fillStyle = hurt ? PAL.danger : '#5a5238';
  ctx.beginPath();
  ctx.moveTo(-17, 2);
  ctx.quadraticCurveTo(-14, -10, -2, -11);
  ctx.quadraticCurveTo(8, -13, 15, -4);
  ctx.quadraticCurveTo(19, 2, 13, 7);
  ctx.quadraticCurveTo(6, 12, -4, 10);
  ctx.quadraticCurveTo(-14, 10, -17, 2);
  ctx.closePath(); ctx.fill();
  // mottled rock-like patches
  ctx.fillStyle = hurt ? PAL.danger : '#3f4a30';
  ctx.beginPath(); ctx.ellipse(-8, -3, 4.5, 3, 0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2, 4, 4, 2.6, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(9, -5, 3.5, 2.4, 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = hurt ? PAL.danger : '#7a7050';
  ctx.beginPath(); ctx.ellipse(-3, -6, 3, 2, -0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, 2, 2.6, 1.8, 0.1, 0, TAU); ctx.fill();
  // venomous dorsal spines
  ctx.strokeStyle = hurt ? PAL.danger : '#8a7f5a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const bx = -10 + i * 4.6, by = -10 - Math.abs(Math.sin(i * 1.3)) * 1.5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 1, by - 7); ctx.stroke();
  }
  // small, well-camouflaged eye
  ctx.fillStyle = '#c9c19a'; ctx.beginPath(); ctx.arc(12, -3, 2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#141208'; ctx.beginPath(); ctx.arc(12.4, -3, 1, 0, TAU); ctx.fill();
  // frilly, ragged pectoral fin
  ctx.strokeStyle = hurt ? PAL.danger : '#4a4630'; ctx.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(-2, 8); ctx.lineTo(-2 + i * 3, 14 + Math.sin(t * 1.5 + i) * 1); ctx.stroke();
  }
  ctx.restore();
}

function eye(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.arc(x + 0.5, y, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
}

// The diver on foot, for platformer stages. Drawn upright around the origin:
// helmet at top, boots at bottom, inside a ~20×28 box. `pose` picks the stance;
// `animT` swings the limbs. Facing/flip + world translate are the caller's job.
export function drawDiverFoot(ctx, pose, animT) {
  const swing = Math.sin(animT * 10);
  ctx.save();
  // legs
  ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 4; ctx.lineCap = 'round';
  if (pose === 'climb') {
    // legs together on the rung, slight alternating bend
    const c = Math.sin(animT * 8) * 3;
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3 - 2, 14 + c); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(3 + 2, 14 - c); ctx.stroke();
  } else if (pose === 'jump') {
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-6, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(6, 12); ctx.stroke();
  } else if (pose === 'walk') {
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3 + swing * 5, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(3 - swing * 5, 14); ctx.stroke();
  } else { // stand
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(4, 14); ctx.stroke();
  }
  // body
  ctx.fillStyle = PAL.diverSuit;
  ctx.beginPath(); ctx.roundRect(-6, -6, 12, 13, 4); ctx.fill();
  // tank
  ctx.fillStyle = '#4a5c78';
  ctx.beginPath(); ctx.roundRect(-8, -5, 4, 9, 2); ctx.fill();
  // arm(s)
  ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 3.5;
  if (pose === 'climb') {
    const a = Math.sin(animT * 8) * 3;
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(6, -8 + a); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(6, -2 - a); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(2, -1); ctx.lineTo(7, 3 + (pose === 'walk' ? -swing * 3 : 0)); ctx.stroke();
  }
  // helmet + glass
  ctx.fillStyle = PAL.diver;
  ctx.beginPath(); ctx.arc(0, -11, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = PAL.diverGlass;
  ctx.beginPath(); ctx.arc(2, -11, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(3.4, -12.4, 1.3, 0, TAU); ctx.fill();
  ctx.restore();
}
