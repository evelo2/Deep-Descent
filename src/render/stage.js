// Renders a platformer Stage onto the fixed 900×600 canvas. Pure drawing from a
// Stage's public state — no game logic. Themed by stage.theme.palette.
import { STAGE, PAL } from '../config.js';
import { drawDiverFoot } from './sprites.js';

const T = STAGE.tile;
const { W, H } = { W: 900, H: 600 };

export function drawStageScene(ctx, stage, t) {
  const p = stage.theme.palette, room = stage.room;
  // themed background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // static tiles
  for (let r = 0; r < room.rows; r++) {
    for (let c = 0; c < room.cols; c++) {
      const gch = room.grid[r][c];
      const x = c * T, y = r * T;
      if (gch === '#') {
        ctx.fillStyle = p.solid; ctx.fillRect(x, y, T, T);
        ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
      } else if (gch === 'H') {
        ctx.strokeStyle = p.ladder; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + 7, y + T); ctx.moveTo(x + T - 7, y); ctx.lineTo(x + T - 7, y + T); ctx.stroke();
        for (let k = 6; k < T; k += 10) { ctx.beginPath(); ctx.moveTo(x + 7, y + k); ctx.lineTo(x + T - 7, y + k); ctx.stroke(); }
      } else if (gch === '^') {
        ctx.fillStyle = p.hazard;
        ctx.beginPath(); ctx.moveTo(x + 2, y + T); ctx.lineTo(x + T / 2, y + 6); ctx.lineTo(x + T - 2, y + T); ctx.closePath(); ctx.fill();
      } else if (gch === '<' || gch === '>') {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
        ctx.fillStyle = p.door; ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
        ctx.globalAlpha = 1; ctx.fillStyle = '#04121f';
        ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(gch === '>' ? '›' : '‹', x + T / 2, y + T / 2);
        ctx.restore();
      }
    }
  }
  // loot
  for (const l of room.loot) {
    if (l.taken) continue;
    ctx.fillStyle = p.loot;
    ctx.beginPath(); ctx.arc(l.x + T / 2, l.y + T / 2 + Math.sin(t * 3 + l.x) * 2, 6, 0, Math.PI * 2); ctx.fill();
  }
  // cache
  if (room.cache && !room.cache.taken) {
    const cxp = room.cache.x + T / 2, cyp = room.cache.y + T / 2;
    ctx.save(); ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 5);
    ctx.fillStyle = p.cache;
    ctx.beginPath(); ctx.roundRect(cxp - 11, cyp - 8, 22, 16, 3); ctx.fill();
    ctx.fillStyle = p.solidEdge; ctx.fillRect(cxp - 11, cyp - 2, 22, 3);
    ctx.restore();
  }
  // movers
  for (const m of room.movers) {
    ctx.fillStyle = p.hazard;
    if (stage.theme.hazardGlyph === 'arc') {
      ctx.save(); ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 20);
      ctx.beginPath(); ctx.arc(m.x + m.w / 2, m.y + m.h / 2, m.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(m.x + m.w / 2, m.y + m.h / 2, m.w / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  // diver on foot
  const b = stage.body;
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  if (b.facing < 0) ctx.scale(-1, 1);
  if (b.invuln > 0 && Math.floor(b.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.4;
  drawDiverFoot(ctx, b.pose, stage.animT);
  ctx.restore();
}

export function drawStageHud(ctx, stage, hud) {
  // Top strip.
  const g = ctx.createLinearGradient(0, 0, 0, 70);
  g.addColorStop(0, 'rgba(0,10,20,0.55)'); g.addColorStop(1, 'rgba(0,10,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);
  // Air bar — sealed/greyed.
  const bx = 20, by = 20, bw = 240, bh = 18;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
  ctx.fillStyle = 'rgba(150,170,185,0.5)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
  ctx.fillStyle = PAL.hudText; ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('AIR — SEALED', bx + 8, by + bh / 2);
  // Lives pips.
  const shown = Math.min(hud.lives, 6);
  for (let i = 0; i < shown; i++) {
    ctx.save(); ctx.translate(bx + 8 + i * 22, by + bh + 22); ctx.scale(0.7, 0.7);
    ctx.fillStyle = PAL.diver; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.diverGlass; ctx.beginPath(); ctx.arc(2, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Score / carried.
  ctx.textAlign = 'right'; ctx.fillStyle = PAL.hudText; ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(`SCORE ${hud.score}`, W - 20, 26);
  ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = hud.carried ? PAL.gold : PAL.hudText;
  ctx.fillText(`CARRYING ${hud.carried}`, W - 20, 48);
  // Theme + room label.
  ctx.textAlign = 'center'; ctx.fillStyle = stage.theme.palette.door; ctx.font = '800 13px system-ui, sans-serif';
  ctx.fillText(`${stage.theme.name}  ·  ROOM ${stage.roomIndex + 1}/${stage.rooms.length}`, W / 2, 24);
  // Banner on room entry.
  if (stage.bannerT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, stage.bannerT);
    ctx.textAlign = 'center'; ctx.fillStyle = stage.theme.palette.cache;
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillText(`ROOM ${stage.roomIndex + 1}/${stage.rooms.length}`, W / 2, H / 2 - 40);
    ctx.restore();
  }
  // Controls hint (bottom).
  ctx.textAlign = 'center'; ctx.fillStyle = '#9fc6e0'; ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('← / → walk   ·   ↑ / Space / A jump   ·   ↑ / ↓ climb ladders   ·   ‹ door retreats', W / 2, H - 24);
}
