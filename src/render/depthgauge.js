// Depth gauge for the diver world: a vertical column down the right edge of the
// HUD showing the WHOLE water column, so you can see at a glance how deep you
// are and how much reef is still below you. A bright marker rides your live
// depth; a faint pip stays at the deepest point of the dive; and once the Depth
// Valve is bought, its line is drawn with the "held pressure" zone tinted
// beneath it (see VALVE + pressureDepth() in the reef).
//
// The arithmetic is split out from the painting so it can be asserted directly
// (tests/render/depthgauge.test.mjs). Geometry is computed from the LIVE
// viewport passed in per frame — never cache W/H, setViewport reassigns them.
import { WORLD } from '../config.js';
import { text } from './chrome.js';

const UNITS_PER_M = 10;     // world units per metre, matching the HUD's old readout
const TICK_STEP_M = 50;     // a tick every 50 m...
const LABEL_STEP_M = 100;   // ...labelled every 100 m

// World y -> metres below the surface. Above the surface reads 0, not negative.
export function metresDown(worldY) {
  return Math.max(0, (worldY - WORLD.SURFACE) / UNITS_PER_M);
}

// The deepest the world goes, in metres — the gauge's fixed bottom of scale.
export function floorDepthM() {
  return (WORLD.WH - WORLD.SURFACE) / UNITS_PER_M;
}

// Where the column sits for a given live viewport. It runs nearly the full
// height of the screen, so it needs a clear lane — and the RIGHT edge has none:
// the reef's minimap panel sits there (reef/index.js _minimap: x >= W-136 for
// y 124..309) and the touch controls own the bottom-right (game.js: the `aim`
// pad from W-142, the weapon/flare/torch column from W-66). The LEFT edge is
// clear below the AIR bar / lives / battery block, so the gauge lives there,
// anchored to the left and independent of viewport width. Pure, so placement is
// testable without a canvas.
export function gaugeRect(W, H) {
  return { x: 24, w: 3, top: 120, bottom: H - 28 };
}

// Depth (m) -> a y inside the column, clamped at both ends.
export function depthToY(m, maxM, top, bottom) {
  const f = Math.max(0, Math.min(1, m / maxM));
  return top + (bottom - top) * f;
}

// Every tick depth from the surface down to (at most) the floor.
export function tickMarks(maxM, step) {
  const out = [];
  for (let m = 0; m <= maxM; m += step) out.push(m);
  return out;
}

export function drawDepthGauge(ctx, { W, H, depth, deepest = 0, valveDepth = null }) {
  const maxM = floorDepthM();
  const R = gaugeRect(W, H);
  const y = (m) => depthToY(m, maxM, R.top, R.bottom);
  ctx.save();

  // The valve's held-pressure zone goes down first, under the column itself.
  if (valveDepth != null) {
    const vy = y(valveDepth);
    ctx.fillStyle = 'rgba(120,220,255,0.10)';
    ctx.fillRect(R.x - 4, vy, R.w + 12, R.bottom - vy);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(R.x, R.top, R.w, R.bottom - R.top);

  const cy = y(depth);   // the live marker's row — tick labels give way to it

  // Ticks every 50 m, numbers every 100 m — all to the LEFT of the column so
  // nothing runs off the right edge of the screen.
  for (const m of tickMarks(maxM, TICK_STEP_M)) {
    const ty = y(m);
    const major = m % LABEL_STEP_M === 0;
    ctx.fillStyle = major ? 'rgba(190,225,250,0.55)' : 'rgba(190,225,250,0.28)';
    ctx.fillRect(R.x + R.w, ty, major ? 7 : 4, 1);
    // A tick label gives way to anything it would print on top of: the live
    // marker's reading, or the floor cap at the bottom of the column.
    const clear = Math.abs(ty - cy) >= 12 && Math.abs(ty - R.bottom) >= 14;
    if (major && m > 0 && clear) text(ctx, `${m}`, R.x + R.w + 11, ty, 10, 'rgba(160,195,225,0.7)', 'left', 'middle');
  }
  text(ctx, `${Math.round(maxM)} m`, R.x + R.w + 11, R.bottom, 10, 'rgba(160,195,225,0.55)', 'left', 'bottom');

  // The dive's high-water mark — only worth drawing once you've come back up.
  if (deepest > depth) {
    const dy = y(deepest);
    ctx.fillStyle = 'rgba(191,230,255,0.35)';
    ctx.fillRect(R.x - 5, dy, R.w + 12, 1);
  }

  // The valve's line, over the tint.
  if (valveDepth != null) {
    const vy = y(valveDepth);
    ctx.fillStyle = 'rgba(120,220,255,0.75)';
    ctx.fillRect(R.x - 6, vy, R.w + 14, 2);
    text(ctx, `⚲ ${Math.round(valveDepth)}m`, R.x + R.w + 11, vy - 9, 10, 'rgba(150,230,255,0.9)', 'left', 'middle');
  }

  // Live depth: a marker riding the column plus the reading beside it.
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath();
  ctx.moveTo(R.x + R.w + 1, cy); ctx.lineTo(R.x + R.w + 9, cy - 5); ctx.lineTo(R.x + R.w + 9, cy + 5);
  ctx.closePath(); ctx.fill();
  text(ctx, `${Math.round(depth)} m`, R.x + R.w + 13, cy, 13, '#bfe6ff', 'left', 'middle', true);

  ctx.restore();
}
