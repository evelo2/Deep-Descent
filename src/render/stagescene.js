// Layered stage renderer: static room art (gradient + solid/ladder/spike tiles)
// bakes to an offscreen canvas once per room; animated layers (doors, loot,
// cache, movers, diver) are drawn live every frame on top of the baked image.
import { STAGE } from '../config.js';
import { drawDiverFoot } from './sprites.js';
import { neighborMask, drawStructureTile, drawLadderTile, drawBackdrop, drawFarWreck, drawShoal, drawForeground } from './stageart.js';

const T = STAGE.tile;
const { W, H } = { W: 900, H: 600 };

export class StageScene {
  constructor() {
    this._canvas = null;
    this._ctx = null;
    this.bakedKey = null;
  }

  _bake(stage) {
    if (!this._canvas) {
      if (typeof document === 'undefined') return;
      this._canvas = document.createElement('canvas');
      this._canvas.width = W;
      this._canvas.height = H;
      this._ctx = this._canvas.getContext('2d');
    }
    const ctx = this._ctx;
    const p = stage.theme.palette, room = stage.room;

    // themed deep backdrop (depth gradient + godrays + caustics), then dim
    // parallax wreck silhouettes — both baked BEHIND the structure below.
    drawBackdrop(ctx, p, stage.roomIndex);
    drawFarWreck(ctx, p, stage.roomIndex);

    // static tiles
    for (let r = 0; r < room.rows; r++) {
      for (let c = 0; c < room.cols; c++) {
        const gch = room.grid[r][c];
        const x = c * T, y = r * T;
        if (gch === '#') {
          drawStructureTile(ctx, x, y, neighborMask(room, c, r), p, stage.theme);
        } else if (gch === 'H') {
          drawLadderTile(ctx, x, y, room.grid[r - 1]?.[c] !== 'H', p, stage.theme);
        } else if (gch === '^') {
          ctx.fillStyle = p.hazard;
          ctx.beginPath(); ctx.moveTo(x + 2, y + T); ctx.lineTo(x + T / 2, y + 6); ctx.lineTo(x + T - 2, y + T); ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  composite(ctx, stage, t) {
    const key = stage.theme.key + ':' + stage.roomIndex;
    if (key !== this.bakedKey) {
      this._bake(stage);
      this.bakedKey = key;
    }
    if (this._canvas) {
      ctx.drawImage(this._canvas, 0, 0);
    }

    const p = stage.theme.palette, room = stage.room;

    // dim background fish shoal — mid layer, reads as behind the actors
    drawShoal(ctx, p, t, stage.roomIndex);

    // doors (live — pulse with t)
    for (let r = 0; r < room.rows; r++) {
      for (let c = 0; c < room.cols; c++) {
        const gch = room.grid[r][c];
        if (gch !== '<' && gch !== '>') continue;
        const x = c * T, y = r * T;
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
        ctx.fillStyle = p.door; ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
        ctx.globalAlpha = 1; ctx.fillStyle = '#04121f';
        ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(gch === '>' ? '›' : '‹', x + T / 2, y + T / 2);
        ctx.restore();
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

    // frontmost live ambient: silt, bubbles, edge kelp, vignette
    drawForeground(ctx, p, t, stage.roomIndex);
  }
}
