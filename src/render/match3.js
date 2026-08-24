// @ts-check
// Canvas renderer for Salvage Match (Platform Phase 9). A pure draw from the
// module state — browser-tuned, not unit-tested. The committed engine resolves
// each swap synchronously (mod.board is already settled while mod.anim plays),
// so v1 draws the settled board; mod.anim only gates input, not the picture.
import { PAL } from '../config.js';
import { text, panel } from './chrome.js';
import { TILE_NAMES } from '../minigames/match3/levels.js';

// Board geometry: a centered square grid sized to the live viewport.
function geom(mod, host) {
  const { W, H } = host.viewport;
  const n = mod.board ? mod.board.cols : 8;
  const size = Math.min(W, H) * 0.72;
  const cell = Math.floor(size / n);
  const x0 = Math.round((W - cell * n) / 2);
  const y0 = Math.round((H - cell * n) / 2) + 20;
  return { cell, x0, y0, n };
}

// pearl · gem · coin · shell · starfish · coral
const TILE_COLORS = ['#eaf6ff', '#61dcff', '#ffcf5c', '#ff8f6b', '#ffe08a', '#b98cff'];

/**
 * Map a logical playfield point to a board cell, or null if outside the grid.
 * @returns {{r:number,c:number}|null}
 */
export function boardHitTest(mod, host, x, y) {
  if (!mod.board) return null;
  const { cell, x0, y0, n } = geom(mod, host);
  const c = Math.floor((x - x0) / cell), r = Math.floor((y - y0) / cell);
  if (r < 0 || c < 0 || r >= n || c >= n) return null;
  return { r, c };
}

function drawTile(ctx, cx, cy, cell, tile) {
  if (!tile) return;
  const r = cell * 0.36;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = TILE_COLORS[tile.type] || '#fff'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
  // specials: line = horizontal bar, bomb = inner ring
  if (tile.special === 'line') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }
  else if (tile.special === 'bomb') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke(); }
}

// Rounded board backdrop (chrome.panel is a full-screen wash, so draw our own box).
function boardPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,36,56,0.85)';
  ctx.strokeStyle = 'rgba(150,200,240,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.restore();
}

export function drawMatch3(ctx, mod, host) {
  const { W, H } = host.viewport;
  const { cell, x0, y0, n } = geom(mod, host);

  // dim underwater backdrop
  ctx.fillStyle = 'rgba(4,16,30,0.94)'; ctx.fillRect(0, 0, W, H);
  boardPanel(ctx, x0 - 12, y0 - 12, cell * n + 24, cell * n + 24);

  // grid + tiles
  if (mod.board) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cx = x0 + c * cell + cell / 2, cy = y0 + r * cell + cell / 2;
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
      drawTile(ctx, cx, cy, cell, mod.board.tiles[r][c]);
    }
    // cursor + selection (keyboard/gamepad)
    const box = (cc, rr, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x0 + cc * cell + 2, y0 + rr * cell + 2, cell - 4, cell - 4); };
    box(mod.cursor.c, mod.cursor.r, PAL.gold);
    if (mod.sel) box(mod.sel.c, mod.sel.r, PAL.glow);
  }

  // HUD: title + objective + moves + score + hint
  const lv = mod.level;
  if (lv) {
    text(ctx, `SALVAGE MATCH — Level ${lv.id}`, W / 2, 40, 22, PAL.glow, 'center', 'middle', true);
    text(ctx, `Collect ${TILE_NAMES[lv.targetTile]}: ${Math.min(mod.progress, lv.targetCount)}/${lv.targetCount}`, W / 2, y0 - 34, 18, PAL.gold, 'center', 'middle');
    text(ctx, `Moves ${mod.movesLeft}`, x0, y0 + cell * n + 30, 16, PAL.hudText, 'left', 'middle');
    text(ctx, `Score ${mod.score}`, x0 + cell * n, y0 + cell * n + 30, 16, PAL.hudText, 'right', 'middle');
    text(ctx, host.input.isTouch ? 'Tap two tiles to swap · Esc/back to quit' : 'Arrows + Space to swap · Esc to quit', W / 2, H - 24, 12, '#9fc6e0', 'center', 'middle');
  }

  // phase overlays (manual — chrome.overlay is a fixed 2-line banner)
  if (mod.phase === 'intro' && lv) {
    panel(ctx, 0.55);
    text(ctx, `Level ${lv.id}`, W / 2, H / 2 - 30, 40, PAL.glow, 'center', 'middle', true);
    text(ctx, `Collect ${lv.targetCount} ${TILE_NAMES[lv.targetTile]} in ${lv.moves} moves`, W / 2, H / 2 + 16, 18, PAL.hudText, 'center', 'middle');
    text(ctx, 'Space to begin', W / 2, H / 2 + 52, 14, '#9fc6e0', 'center', 'middle');
  } else if (mod.phase === 'won' && lv) {
    panel(ctx, 0.6);
    text(ctx, 'LEVEL CLEARED', W / 2, H / 2 - 20, 40, PAL.gold, 'center', 'middle', true);
    text(ctx, `⚙ SALVAGE +${lv.reward}  ·  ${host.economy.state.salvage} banked`, W / 2, H / 2 + 24, 18, PAL.gold, 'center', 'middle');
    text(ctx, 'Space: next level', W / 2, H / 2 + 56, 14, '#9fc6e0', 'center', 'middle');
  } else if (mod.phase === 'lost') {
    panel(ctx, 0.6);
    text(ctx, 'OUT OF MOVES', W / 2, H / 2 - 20, 40, PAL.danger, 'center', 'middle', true);
    text(ctx, 'Space: retry  ·  Esc: quit', W / 2, H / 2 + 24, 14, '#9fc6e0', 'center', 'middle');
  }
}
