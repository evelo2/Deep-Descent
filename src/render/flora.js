// Sea flora rooted on cave floors: swaying kelp, coral fans, anemones and
// glowing polyps. Purely decorative; drawn behind the actors.
import { PAL, WORLD } from '../config.js';
const TAU = Math.PI * 2;

const TYPES = ['kelp', 'kelp', 'coral', 'anemone', 'polyp', 'bush'];

export class Flora {
  // spots: [{x,y}] floor anchor points (y already at the floor).
  constructor(spots) {
    this.plants = spots.map((s, i) => ({
      x: s.x, y: s.y,
      type: TYPES[(Math.random() * TYPES.length) | 0],
      h: 42 + Math.random() * 70,
      phase: Math.random() * TAU,
      lean: (Math.random() - 0.5) * 0.4,
      hue: Math.random(),
    }));
  }

  draw(ctx, camX, camY, t) {
    const { W, H } = WORLD;
    for (const p of this.plants) {
      const sx = p.x - camX, sy = p.y - camY;
      if (sx < -80 || sx > W + 80 || sy < -160 || sy > H + 80) continue;
      ctx.save(); ctx.translate(sx, sy);
      const sway = Math.sin(t * 1.3 + p.phase) * 0.12 + p.lean;
      if (p.type === 'kelp') this._kelp(ctx, p, t, sway);
      else if (p.type === 'coral') this._coral(ctx, p);
      else if (p.type === 'anemone') this._anemone(ctx, p, t);
      else if (p.type === 'polyp') this._polyp(ctx, p, t);
      else this._bush(ctx, p, t, sway);
      ctx.restore();
    }
  }

  _kelp(ctx, p, t, sway) {
    const seg = 6, len = p.h / seg;
    ctx.strokeStyle = p.hue > 0.5 ? PAL.kelp : PAL.kelpDark;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    let x = 0, y = 0, ang = -Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(0, 0);
    const pts = [[0, 0]];
    for (let i = 1; i <= seg; i++) {
      ang += Math.sin(t * 1.6 + p.phase + i * 0.6) * 0.16 + sway * 0.5;
      x += Math.cos(ang) * len; y += Math.sin(ang) * len;
      ctx.lineTo(x, y); pts.push([x, y]);
    }
    ctx.stroke();
    // blades
    ctx.fillStyle = p.hue > 0.5 ? PAL.kelp : PAL.kelpDark;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i];
      ctx.beginPath(); ctx.ellipse(px, py, 8, 3, Math.atan2(py - pts[i - 1][1], px - pts[i - 1][0]), 0, TAU);
      ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  _bush(ctx, p, t, sway) {
    ctx.strokeStyle = PAL.kelpDark; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * 3, 0);
      const bx = i * 8 + Math.sin(t * 1.5 + p.phase + i) * 5;
      ctx.quadraticCurveTo(i * 6, -p.h * 0.5, bx, -p.h * 0.7);
      ctx.stroke();
    }
  }

  _coral(ctx, p) {
    const col = p.hue > 0.6 ? PAL.coralPink : p.hue > 0.3 ? PAL.coral : PAL.coralGold;
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const branch = (x, y, ang, len, depth) => {
      if (depth === 0) return;
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      branch(x2, y2, ang - 0.5, len * 0.7, depth - 1);
      branch(x2, y2, ang + 0.5, len * 0.7, depth - 1);
    };
    ctx.lineWidth = 6; branch(0, 0, -Math.PI / 2, p.h * 0.42, 4);
    // polyp tips
    ctx.fillStyle = PAL.anemoneTip;
  }

  _anemone(ctx, p, t) {
    // squat body
    ctx.fillStyle = PAL.anemone;
    ctx.beginPath(); ctx.ellipse(0, -6, 16, 12, 0, 0, TAU); ctx.fill();
    // waving tentacles
    ctx.strokeStyle = PAL.anemone; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = -5; i <= 5; i++) {
      const bx = i * 2.6;
      ctx.beginPath(); ctx.moveTo(bx, -8);
      const tx = bx + Math.sin(t * 2.4 + i + p.phase) * 6;
      ctx.quadraticCurveTo(bx * 1.4, -26, tx, -34 - (5 - Math.abs(i)) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = PAL.anemoneTip;
    for (let i = -5; i <= 5; i++) {
      const tx = i * 2.6 + Math.sin(t * 2.4 + i + p.phase) * 6;
      ctx.beginPath(); ctx.arc(tx, -34 - (5 - Math.abs(i)) * 2, 2.2, 0, TAU); ctx.fill();
    }
  }

  _polyp(ctx, p, t) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + p.phase;
      const rr = 8 + (i % 3) * 6;
      const x = Math.cos(a) * rr, y = -6 - Math.abs(Math.sin(a)) * 14;
      const pulse = 0.6 + 0.4 * Math.sin(t * 3 + i);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, PAL.polyp); g.addColorStop(1, 'rgba(102,240,216,0)');
      ctx.globalAlpha = pulse; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}
