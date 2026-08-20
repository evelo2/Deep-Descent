// Ocean backdrop: depth-graded water, drifting god-rays, caustic shimmer,
// parallax particulate, distant shoals + sunken-wreck silhouettes for depth,
// and the seabed with swaying weeds at the bottom.
import { WORLD, PAL } from '../config.js';

export class Background {
  constructor() {
    // Parallax motes seeded across the whole world. Each carries a depth d in
    // [0,1]: far motes (d→0) are tiny/faint and barely parallax; near motes
    // (d→1) are larger/brighter and slide faster — layering the water column.
    this.motes = Array.from({ length: 180 }, () => {
      const d = Math.random();
      return {
        wx: Math.random() * WORLD.WW,
        wy: Math.random() * WORLD.WH,
        r: 0.4 + d * 2.2,
        s: 0.16 + d * 0.6,          // parallax factor (far slow → near fast)
        a: 0.1 + d * 0.28,          // alpha
      };
    });

    // Distant shoals: loose schools of tiny fish that drift far behind the
    // action. Each school is a world anchor + members offset around it; the
    // anchor slides slowly over time so the school swims, wrapping the world.
    this.shoals = Array.from({ length: 5 }, () => {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const n = 8 + ((Math.random() * 7) | 0);
      return {
        wx: Math.random() * WORLD.WW,
        wy: WORLD.SURFACE + 260 + Math.random() * (WORLD.WH * 0.55),
        s: 0.28 + Math.random() * 0.14,     // far parallax band
        vx: dir * (10 + Math.random() * 14), // world px/s drift
        dir,
        sz: 2.2 + Math.random() * 1.8,       // per-fish size
        phase: Math.random() * Math.PI * 2,
        members: Array.from({ length: n }, () => ({
          ox: (Math.random() - 0.5) * 90,
          oy: (Math.random() - 0.5) * 44,
          wob: Math.random() * Math.PI * 2,
        })),
      };
    });

    // Sunken-wreck silhouettes in the deep — dim, distant landmarks on a slow
    // parallax band, no vertical wrap (anchored). Because a slow-parallax object
    // barely rises as the camera descends, each wreck is anchored to a TARGET
    // camera depth (spread across the dive) and its world-y is derived so it
    // sweeps through the lower screen right as you pass that depth — emerging
    // from the gloom one after another as you go deeper.
    const nWrecks = 4, sweepTop = 500, sweepBot = WORLD.WH - WORLD.H - 400;
    this.wrecks = Array.from({ length: nWrecks }, (_, i) => {
      const s = 0.22 + Math.random() * 0.12;
      const camYt = sweepTop + (i + Math.random() * 0.7) * ((sweepBot - sweepTop) / nWrecks);
      return {
        wx: Math.random() * WORLD.WW,
        wy: 380 + camYt * s,          // ~screen-y 380 (low, seabed-ish) at camYt
        s,
        w: 150 + Math.random() * 130,
        tilt: (Math.random() - 0.5) * 0.5,
        flip: Math.random() < 0.5 ? -1 : 1,
      };
    });
  }

  // depthT: 0 (surface) .. 1 (max depth), based on camera.
  // opts.reef enables the reef-only depth layers (distant wrecks + shoals);
  // shared zones (e.g. whirlpool) pass nothing and get just water + motes.
  draw(ctx, camX, camY, t, depthT, opts = {}) {
    const { W, H } = WORLD;
    // Water gradient interpolated by depth.
    const top = lerpColor(PAL.waterTop, PAL.waterDeep, depthT);
    const bot = lerpColor(PAL.waterMid, PAL.abyss, depthT);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Distant sunken wrecks sit farthest back, just over the water — god-rays
    // and caustics below then fall in front of them, deepening the layering.
    if (opts.reef) this._drawWrecks(ctx, camX, camY, depthT);

    // Water surface (only when near the top).
    if (camY < 240) {
      const sy = WORLD.SURFACE - camY;
      const sg = ctx.createLinearGradient(0, sy - 40, 0, sy + 20);
      sg.addColorStop(0, 'rgba(120,220,255,0)');
      sg.addColorStop(1, PAL.surfaceLight);
      ctx.fillStyle = sg; ctx.fillRect(0, sy - 40, W, 60);
      ctx.strokeStyle = 'rgba(220,250,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const yy = sy + Math.sin((x + camX) * 0.04 + t * 1.5) * 3;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // God-rays fanning from the surface (fade with depth).
    const rayA = Math.max(0, 0.22 * (1 - depthT * 0.9));
    if (rayA > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const bx = (i * 197 % W);
        const drift = Math.sin(t * 0.3 + i) * 30;
        ctx.beginPath();
        ctx.moveTo(bx + drift, -20);
        ctx.lineTo(bx + 70 + drift, -20);
        ctx.lineTo(bx + 220 + drift, H);
        ctx.lineTo(bx + 40 + drift, H);
        ctx.closePath();
        const rg = ctx.createLinearGradient(0, 0, 0, H);
        rg.addColorStop(0, `rgba(150,235,255,${rayA})`);
        rg.addColorStop(1, 'rgba(150,235,255,0)');
        ctx.fillStyle = rg; ctx.fill();
      }
      ctx.restore();
    }

    // Caustic shimmer near surface.
    if (depthT < 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.06 * (1 - depthT * 2);
      ctx.strokeStyle = PAL.surfaceLight; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 20) {
          const yy = 60 + i * 40 + Math.sin(x * 0.05 + t * 2 + i) * 12;
          x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Distant shoals drift between the light and the near particulate.
    if (opts.reef) this._drawShoals(ctx, camX, camY, t, depthT);

    // Parallax motes drifting through the water column, layered by depth (each
    // mote carries its own alpha and parallax band — far ones barely move).
    for (const m of this.motes) {
      const sx = ((m.wx - camX * m.s) % (W + 40) + W + 40) % (W + 40) - 20;
      const sy = ((m.wy - camY * m.s) % (H + 40) + H + 40) % (H + 40) - 20;
      ctx.fillStyle = `rgba(200,235,255,${m.a})`;
      ctx.beginPath(); ctx.arc(sx, sy, m.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Distant fish schools: dim chevrons clustered around a slowly-swimming
  // world anchor, on a far parallax band, fading into the deep with depthT.
  _drawShoals(ctx, camX, camY, t, depthT) {
    const { W, H } = WORLD;
    const fade = 0.34 * (1 - depthT * 0.7);   // subtle, and melts into the gloom
    if (fade <= 0.01) return;
    ctx.save();
    for (const sc of this.shoals) {
      // school anchor drifts over time in its swim direction, wrapping world-x
      const ax = sc.wx + sc.vx * t;
      let sx = ((ax - camX * sc.s) % (W + 120) + W + 120) % (W + 120) - 60;
      const sy = ((sc.wy - camY * sc.s) % (H + 80) + H + 80) % (H + 80) - 40;
      if (sy < -30 || sy > H + 30) continue;
      ctx.fillStyle = `rgba(150,205,225,${fade})`;
      for (const m of sc.members) {
        const wob = Math.sin(t * 1.6 + m.wob) * 3;
        const fx = sx + m.ox, fy = sy + m.oy + wob;
        // a tiny chevron pointing along the swim direction
        const d = sc.dir, s = sc.sz;
        ctx.beginPath();
        ctx.moveTo(fx + d * s, fy);
        ctx.lineTo(fx - d * s, fy - s * 0.7);
        ctx.lineTo(fx - d * s * 0.4, fy);
        ctx.lineTo(fx - d * s, fy + s * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Dim wreck silhouettes in the deep — a hull hump + a leaning broken mast,
  // heavily parallaxed and low-contrast so they read as far-off landmarks.
  _drawWrecks(ctx, camX, camY, depthT) {
    const { W, H } = WORLD;
    const alpha = 0.18 + 0.16 * depthT;       // firmer as you descend into them
    ctx.save();
    ctx.fillStyle = `rgba(4,16,30,${alpha})`;
    ctx.strokeStyle = `rgba(4,16,30,${alpha})`;
    for (const wr of this.wrecks) {
      let sx = ((wr.wx - camX * wr.s) % (W + 400) + W + 400) % (W + 400) - 200;
      const sy = wr.wy - camY * wr.s;          // no vertical wrap — anchored
      if (sy < -80 || sy > H + 80) continue;
      const hw = wr.w / 2;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(wr.tilt);
      ctx.scale(wr.flip, 1);
      // hull: a long keeled hump
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.quadraticCurveTo(-hw * 0.5, -wr.w * 0.22, 0, -wr.w * 0.2);
      ctx.quadraticCurveTo(hw * 0.7, -wr.w * 0.16, hw, 4);
      ctx.quadraticCurveTo(hw * 0.6, wr.w * 0.16, 0, wr.w * 0.14);
      ctx.quadraticCurveTo(-hw * 0.6, wr.w * 0.13, -hw, 0);
      ctx.closePath();
      ctx.fill();
      // broken mast leaning off the deck
      ctx.lineWidth = Math.max(3, wr.w * 0.03);
      ctx.beginPath();
      ctx.moveTo(-hw * 0.15, -wr.w * 0.16);
      ctx.lineTo(hw * 0.2, -wr.w * 0.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function lerpColor(a, b, t) {
  const ca = hex(a), cb = hex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
