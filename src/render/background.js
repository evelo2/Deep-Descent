// Ocean backdrop: depth-graded water, drifting god-rays, caustic shimmer,
// parallax particulate, and the seabed with swaying weeds at the bottom.
import { WORLD, PAL } from '../config.js';

export class Background {
  constructor() {
    // Parallax motes seeded across the whole world.
    this.motes = Array.from({ length: 140 }, () => ({
      wx: Math.random() * WORLD.WW,
      wy: Math.random() * WORLD.WH,
      r: 0.6 + Math.random() * 1.8,
      s: 0.3 + Math.random() * 0.5, // parallax factor
    }));
  }

  // depthT: 0 (surface) .. 1 (max depth), based on camera.
  draw(ctx, camX, camY, t, depthT) {
    const { W, H } = WORLD;
    // Water gradient interpolated by depth.
    const top = lerpColor(PAL.waterTop, PAL.waterDeep, depthT);
    const bot = lerpColor(PAL.waterMid, PAL.abyss, depthT);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

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

    // Parallax motes drifting through the water column.
    ctx.fillStyle = 'rgba(200,235,255,0.32)';
    for (const m of this.motes) {
      const sx = ((m.wx - camX * m.s) % (W + 40) + W + 40) % (W + 40) - 20;
      const sy = ((m.wy - camY * m.s) % (H + 40) + H + 40) % (H + 40) - 20;
      ctx.beginPath(); ctx.arc(sx, sy, m.r, 0, Math.PI * 2); ctx.fill();
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
