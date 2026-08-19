// Renders a platformer Stage onto the fixed 900×600 canvas. Pure drawing from a
// Stage's public state — no game logic. Themed by stage.theme.palette.
import { PAL } from '../config.js';
import { StageScene } from './stagescene.js';

const { W, H } = { W: 900, H: 600 };

let _scene;
export function drawStageScene(ctx, stage, t) {
  (_scene ??= new StageScene()).composite(ctx, stage, t);
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
  // Controls hint (bottom) — scheme-aware string supplied by the game.
  ctx.textAlign = 'center'; ctx.fillStyle = '#9fc6e0'; ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(hud.hint || '← / → walk   ·   Space jump   ·   ↑ / ↓ climb ladders   ·   ‹ door retreats', W / 2, H - 24);
}
