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

// Stone gateway to the sunken temple — two pillars around a glowing portal.
export function drawTempleGate(ctx, t, r = 46) {
  ctx.save();
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.5);
  glow.addColorStop(0, PAL.gateGlow); glow.addColorStop(0.5, 'rgba(90,160,200,0.4)'); glow.addColorStop(1, 'rgba(60,120,160,0)');
  ctx.globalAlpha = 0.55 + Math.sin(t * 2.5) * 0.15;
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // portal
  ctx.fillStyle = 'rgba(20,50,70,0.8)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r, 0, 0, TAU); ctx.fill();
  // pillars + lintel
  ctx.fillStyle = PAL.templeRock;
  ctx.fillRect(-r - 16, -r - 10, 16, r * 2 + 20);
  ctx.fillRect(r, -r - 10, 16, r * 2 + 20);
  ctx.fillRect(-r - 16, -r - 22, r * 2 + 32, 14);
  ctx.strokeStyle = PAL.templeDark; ctx.lineWidth = 2;
  ctx.strokeRect(-r - 16, -r - 10, 16, r * 2 + 20);
  ctx.strokeRect(r, -r - 10, 16, r * 2 + 20);
  // glyphs
  ctx.fillStyle = PAL.gateGlow;
  for (let i = -1; i <= 1; i++) { ctx.globalAlpha = 0.6; ctx.fillRect(i * 12 - 2, -r - 19, 4, 8); }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// The abyss maw — a jagged rock opening over a glowing violet trench. Used
// for both the reef-side entrance and the abyss's own ascent exit, mirroring
// how drawTempleGate serves the temple's gate and exit alike.
export function drawAbyssMaw(ctx, t, r = 46) {
  ctx.save();
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.6);
  glow.addColorStop(0, PAL.abyssRim); glow.addColorStop(0.5, 'rgba(92,63,174,0.35)'); glow.addColorStop(1, 'rgba(20,10,40,0)');
  ctx.globalAlpha = 0.55 + Math.sin(t * 2.2) * 0.15;
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // dark maw
  ctx.fillStyle = 'rgba(8,6,18,0.85)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r, 0, 0, TAU); ctx.fill();
  // jagged rock rim
  ctx.fillStyle = PAL.abyssRock; ctx.strokeStyle = PAL.abyssDark; ctx.lineWidth = 2;
  ctx.beginPath();
  const teeth = 10;
  for (let i = 0; i <= teeth; i++) {
    const a = (i / teeth) * TAU;
    const jag = i % 2 === 0 ? 1.14 : 0.98;
    const rx = r * 0.75 * jag, ry = r * jag;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  // swirl rings hinting at the drop
  for (let i = 3; i >= 1; i--) {
    ctx.strokeStyle = `rgba(185,140,255,${0.2 * i})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * (i / 3.6) * (0.9 + Math.sin(t * 1.8 + i) * 0.05), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// The whirlpool maw — a swirling teal vortex over jagged rock, distinct from
// the abyss's violet trench. Used for both the reef-side entrance and the
// whirlpool's own ascent (bail-out) exit, mirroring drawAbyssMaw.
export function drawWhirlMaw(ctx, t, r = 46) {
  ctx.save();
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.6);
  glow.addColorStop(0, PAL.whirlRim); glow.addColorStop(0.5, 'rgba(46,230,200,0.35)'); glow.addColorStop(1, 'rgba(10,40,40,0)');
  ctx.globalAlpha = 0.55 + Math.sin(t * 2.6) * 0.15;
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // dark swirling throat
  ctx.fillStyle = 'rgba(6,18,18,0.85)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r, 0, 0, TAU); ctx.fill();
  // jagged rock rim
  ctx.fillStyle = PAL.whirlRock; ctx.strokeStyle = PAL.whirlDark; ctx.lineWidth = 2;
  ctx.beginPath();
  const teeth = 10;
  for (let i = 0; i <= teeth; i++) {
    const a = (i / teeth) * TAU;
    const jag = i % 2 === 0 ? 1.14 : 0.98;
    const rx = r * 0.75 * jag, ry = r * jag;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  // spinning swirl arms — rotate opposite the abyss's static rings, so it
  // reads as actively churning rather than just glowing.
  for (let i = 3; i >= 1; i--) {
    ctx.strokeStyle = `rgba(95,224,200,${0.22 * i})`; ctx.lineWidth = 2;
    const spin = t * (1.4 + i * 0.4);
    ctx.beginPath();
    for (let a = 0; a < TAU; a += TAU / 24) {
      const rr = r * (i / 3.6) * (0.9 + Math.sin(a * 3 + spin) * 0.12);
      const x = Math.cos(a + spin) * rr, y = Math.sin(a + spin) * rr;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

// The mini-sub hull — drawn around/behind the diver while piloting it (the
// abyss's buyable vehicle). A stubby rounded pod ~1.6x the diver's radius
// (15px), with a porthole and a small tail prop. `facing` mirrors it to match
// the diver sprite's own left/right flip.
export function drawSub(ctx, x, y, facing = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  const w = 24, h = 15;   // ~1.6x the 15px diver radius
  // hull
  const hull = ctx.createLinearGradient(0, -h, 0, h);
  hull.addColorStop(0, '#a9bfce'); hull.addColorStop(1, '#4c5f6c');
  ctx.fillStyle = hull;
  ctx.beginPath(); ctx.roundRect(-w, -h, w * 2, h * 2, h); ctx.fill();
  ctx.strokeStyle = '#232d34'; ctx.lineWidth = 2; ctx.stroke();
  // porthole
  ctx.fillStyle = 'rgba(150,225,255,0.85)';
  ctx.beginPath(); ctx.arc(6, 0, 6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a2126'; ctx.lineWidth = 1.5; ctx.stroke();
  // tail prop
  ctx.strokeStyle = '#232d34'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w, 0); ctx.lineTo(-w - 8, -5);
  ctx.moveTo(-w, 0); ctx.lineTo(-w - 8, 5);
  ctx.stroke();
  ctx.restore();
}

// A golden key.
export function drawKey(ctx, t) {
  ctx.save();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
  g.addColorStop(0, PAL.key); g.addColorStop(1, 'rgba(255,210,90,0)');
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = PAL.key; ctx.fillStyle = PAL.key; ctx.lineWidth = 4;
  // bow (ring)
  ctx.beginPath(); ctx.arc(-8, 0, 7, 0, TAU); ctx.stroke();
  // shaft
  ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(16, 0); ctx.stroke();
  // teeth
  ctx.fillRect(11, 0, 3, 6); ctx.fillRect(15, 0, 3, 8);
  ctx.restore();
}

// The temple door — a stone slab that lifts as `open` 0..1, with a keyhole.
export function drawDoor(ctx, open, w, h) {
  ctx.save();
  // jambs
  ctx.fillStyle = PAL.templeDark;
  ctx.fillRect(-w / 2 - 6, -h / 2 - 6, 6, h + 12);
  ctx.fillRect(w / 2, -h / 2 - 6, 6, h + 12);
  // sliding slab
  ctx.save();
  ctx.beginPath(); ctx.rect(-w / 2 - 8, -h / 2 - 6, w + 16, h + 12); ctx.clip();
  ctx.translate(0, -open * (h + 12));
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, PAL.doorDark); g.addColorStop(0.5, PAL.door); g.addColorStop(1, PAL.doorDark);
  ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
  // block courses
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
  for (let y = -h / 2 + 20; y < h / 2; y += 24) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke(); }
  // keyhole
  ctx.fillStyle = PAL.keyDark;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
  ctx.fillRect(-3, 0, 6, 16);
  ctx.restore();
  ctx.restore();
}

// A fluted stone column for temple decoration.
export function drawColumn(ctx, t, h = 180) {
  ctx.save();
  ctx.fillStyle = PAL.templeRock;
  ctx.fillRect(-14, -h, 28, h);
  ctx.fillStyle = PAL.templeRim; ctx.fillRect(-20, -h - 10, 40, 12); ctx.fillRect(-20, -2, 40, 12);   // capital + base
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2;
  for (const fx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(fx, -h + 4); ctx.lineTo(fx, -4); ctx.stroke(); }
  ctx.restore();
}

// The reef's relic objective — anchor / statue / map / idol. Glowing, ~40px.
export function drawRelic(ctx, type, t) {
  ctx.save();
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
  g.addColorStop(0, PAL.key); g.addColorStop(0.5, 'rgba(255,210,90,0.4)'); g.addColorStop(1, 'rgba(255,210,90,0)');
  ctx.globalAlpha = 0.55 + Math.sin(t * 2.5) * 0.18; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ({ anchor, statue, map: scroll, idol })[type](ctx);
  ctx.restore();
}

function anchor(ctx) {
  ctx.strokeStyle = PAL.key; ctx.fillStyle = PAL.key; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -16, 5, 0, TAU); ctx.stroke();          // ring
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 14); ctx.stroke(); // shank
  ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(9, -4); ctx.stroke(); // stock
  ctx.beginPath();                                                      // flukes
  ctx.moveTo(0, 14); ctx.quadraticCurveTo(-16, 10, -13, -2);
  ctx.moveTo(0, 14); ctx.quadraticCurveTo(16, 10, 13, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(-18, -6); ctx.moveTo(13, -2); ctx.lineTo(18, -6); ctx.stroke();
}
function statue(ctx) {
  // moai-like idol head on a plinth
  ctx.fillStyle = '#9a8f7a';
  ctx.beginPath(); ctx.moveTo(-10, -18); ctx.quadraticCurveTo(-12, 6, -8, 10); ctx.lineTo(8, 10);
  ctx.quadraticCurveTo(12, 6, 10, -18); ctx.quadraticCurveTo(0, -24, -10, -18); ctx.fill();
  ctx.fillStyle = '#6f6656'; ctx.fillRect(-13, 10, 26, 8);            // plinth
  ctx.fillStyle = '#3a352c';
  ctx.beginPath(); ctx.ellipse(-4, -6, 2.5, 3, 0, 0, TAU); ctx.fill(); // eyes
  ctx.beginPath(); ctx.ellipse(4, -6, 2.5, 3, 0, 0, TAU); ctx.fill();
  ctx.fillRect(-6, 2, 12, 2);                                          // mouth
}
function scroll(ctx) {
  ctx.fillStyle = '#e8dcae';
  ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 3); ctx.fill();
  ctx.fillStyle = '#c9b984'; ctx.fillRect(-18, -13, 5, 26); ctx.fillRect(13, -13, 5, 26); // rolls
  ctx.strokeStyle = '#a8925a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-10, -5); ctx.quadraticCurveTo(0, 0, 8, -3); ctx.stroke();  // route
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(11, 8); ctx.moveTo(11, 2); ctx.lineTo(4, 8); ctx.stroke(); // X
}
function idol(ctx) {
  ctx.fillStyle = PAL.key;
  ctx.beginPath(); ctx.moveTo(-11, -14); ctx.lineTo(11, -14); ctx.lineTo(9, 14); ctx.lineTo(-9, 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAL.keyDark;
  ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(7, 2); ctx.lineTo(-7, 2); ctx.closePath(); ctx.fill(); // face plate
  ctx.fillStyle = '#3a2a0c';
  ctx.beginPath(); ctx.arc(-4, -3, 2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(4, -3, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(4, 5); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill(); // mouth
  ctx.fillStyle = PAL.gem; ctx.beginPath(); ctx.arc(0, -11, 2.5, 0, TAU); ctx.fill(); // gem on brow
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
