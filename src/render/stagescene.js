// Layered stage renderer: static room art (gradient + solid/ladder/spike tiles)
// bakes to an offscreen canvas once per room; animated layers (doors, loot,
// cache, movers, diver) are drawn live every frame on top of the baked image.
import { STAGE } from '../config.js';
import { drawDiverFoot } from './sprites.js';
import { neighborMask, drawStructureTile, drawLadderTile, drawBackdrop, drawFarWreck, drawShoal, drawForeground, drawHazard, drawCoin, drawGem, drawChest, drawHatch } from './stageart.js';

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
        drawHatch(ctx, x, y, gch, p, t);
      }
    }
    // loot
    for (const l of room.loot) {
      if (l.taken) continue;
      if (p.accent === 'gem') drawGem(ctx, l.x, l.y, p, t);
      else drawCoin(ctx, l.x, l.y, p, t);
    }
    // cache
    if (room.cache && !room.cache.taken) {
      drawChest(ctx, room.cache.x, room.cache.y, p, t);
    }
    // movers
    for (const m of room.movers) {
      drawHazard(ctx, m, stage.theme, p, t);
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
