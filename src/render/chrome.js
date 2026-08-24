// Shared canvas-chrome primitives for the diver-world minigames + shell.
//
// Phase 7 (consolidate): these six helpers were duplicated byte-for-byte between
// the game.js Core shell and the reef MiniGame (and would have been re-copied by
// every future minigame that paints a HUD/menu over the ocean). They are pure
// functions of `(ctx, …)` — the only shared state they touch is the LIVE viewport
// `WORLD.W/H` (kept current by setViewport) and the `PAL` palette. Each class
// keeps a one-line forwarder (`_text(...) { text(this.ctx, ...) }`) so every
// existing `this._text(...)` call-site stays byte-identical.

import { WORLD, PAL } from '../config.js';

// mm:ss for buff/extraction timers. Pure — no context needed.
export function mmss(secs) {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Crisp HUD/menu text with an optional bold weight + drop shadow.
export function text(ctx, str, x, y, size, color, align = 'left', base = 'alphabetic', bold = false) {
  ctx.font = `${bold ? '800' : '600'} ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = base;
  if (bold) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
}

// Full-screen dimming wash behind a menu/overlay.
export function panel(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(3,15,30,${alpha})`;
  ctx.fillRect(0, 0, WORLD.W, WORLD.H);
}

// Centered title + subtitle over a light wash (PAUSED / GAME OVER banners).
export function overlay(ctx, title, sub) {
  const cx = WORLD.W / 2;
  panel(ctx, 0.4);
  text(ctx, title, cx, WORLD.H / 2 - 10, 44, PAL.hudText, 'center', 'middle', true);
  text(ctx, sub, cx, WORLD.H / 2 + 34, 16, '#bfe6ff', 'center', 'middle');
}

// Small keycap box with a letter, for control hints.
export function keycap(ctx, label, x, y) {
  const w = 15, h = 15;
  ctx.save();
  ctx.fillStyle = 'rgba(20,44,66,0.9)'; ctx.strokeStyle = 'rgba(150,200,240,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, 3); ctx.fill(); ctx.stroke();
  ctx.restore();
  text(ctx, label, x + w / 2, y + 0.5, 9, PAL.hudText, 'center', 'middle', true);
}
