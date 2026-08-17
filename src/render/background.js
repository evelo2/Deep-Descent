// Ocean backdrop: depth-graded water, drifting god-rays, caustic shimmer,
// parallax particulate, and the seabed with swaying weeds at the bottom.
import { WORLD, PAL } from '../config.js';

export class Background {
  constructor() {
    // Static-ish parallax motes, seeded once.
    this.motes = Array.from({ length: 90 }, () => ({
      x: Math.random() * WORLD.W,
      wy: Math.random() * WORLD.DEPTH_MAX,
      r: 0.6 + Math.random() * 1.8,
      s: 0.2 + Math.random() * 0.6, // parallax factor
    }));
    this.weeds = Array.from({ length: 14 }, (_, i) => ({
      x: (i / 14) * WORLD.W + Math.random() * 30,
      h: 60 + Math.random() * 90,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  // depthT: 0 (surface) .. 1 (max depth), based on camera.
  draw(ctx, camY, t, depthT) {
    const { W, H } = WORLD;
    // Water gradient interpolated by depth.
    const top = lerpColor(PAL.waterTop, PAL.waterDeep, depthT);
    const bot = lerpColor(PAL.waterMid, PAL.abyss, depthT);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Water surface (only when near the top).
    if (camY < 200) {
      const sy = WORLD.SURFACE - camY;
      const sg = ctx.createLinearGradient(0, sy - 40, 0, sy + 20);
      sg.addColorStop(0, 'rgba(120,220,255,0)');
      sg.addColorStop(1, PAL.surfaceLight);
      ctx.fillStyle = sg; ctx.fillRect(0, sy - 40, W, 60);
      ctx.strokeStyle = 'rgba(220,250,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const yy = sy + Math.sin(x * 0.04 + t * 1.5) * 3;
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

    // Parallax motes.
    ctx.fillStyle = 'rgba(200,235,255,0.35)';
    for (const m of this.motes) {
      const sy = ((m.wy - camY * m.s) % (H + 40) + H + 40) % (H + 40) - 20;
      ctx.beginPath(); ctx.arc(m.x, sy, m.r, 0, Math.PI * 2); ctx.fill();
    }

    // Seabed + weeds, drawn when the floor is on-screen.
    const bedY = WORLD.DEPTH_MAX + WORLD.SEABED - camY;
    if (bedY < H + 120) this._seabed(ctx, bedY, t);
  }

  _seabed(ctx, bedY, t) {
    const { W, H } = WORLD;
    const g = ctx.createLinearGradient(0, bedY - 30, 0, H);
    g.addColorStop(0, PAL.seabedLight); g.addColorStop(1, PAL.seabed);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, bedY + 20);
    for (let x = 0; x <= W; x += 40) {
      ctx.lineTo(x, bedY + Math.sin(x * 0.03) * 10);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    for (const wd of this.weeds) {
      ctx.strokeStyle = wd.x % 2 < 1 ? PAL.weed : PAL.weedDark;
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(wd.x, bedY);
      const seg = 4;
      for (let s = 1; s <= seg; s++) {
        const yy = bedY - (wd.h / seg) * s;
        const xx = wd.x + Math.sin(t * 1.5 + wd.phase + s * 0.7) * (4 + s * 3);
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
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
