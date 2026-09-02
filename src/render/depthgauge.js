// Depth gauge for the diver world: a vertical column down the right edge of the
// HUD showing the WHOLE water column, so you can see at a glance how deep you
// are and how much reef is still below you. A bright marker rides your live
// depth; a faint pip stays at the deepest point of the dive. Below the oxygen
// line the column tints amber; below crush depth it tints red, with a "⚠"
// line always drawn at that depth (crush depth applies whether or not a Valve
// was ever bought — see DEPTH + crushDepthM() in config.js). The crush band
// flashes as the diver approaches it while still safe, and once the crush
// alarm is running the whole column washes red with the countdown printed
// beside the marker.
//
// The arithmetic is split out from the painting so it can be asserted directly
// (tests/render/depthgauge.test.mjs). Geometry is computed from the LIVE
// viewport passed in per frame — never cache W/H, setViewport reassigns them.
import { WORLD, DEPTH } from '../config.js';
import { text } from './chrome.js';

const UNITS_PER_M = 10;     // world units per metre, matching the HUD's old readout

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

// Tick spacing scales with the column's depth. The gauge shows the WHOLE water
// column in a fixed on-screen height, so a tier-4 world compresses 1800 m into
// the space that shows 411 m in tier 1 — at a fixed 50/100 m spacing that is an
// unreadable stripe of labels. Pure, so it is asserted directly.
export function gaugeTickStep(maxM) {
  if (maxM <= 500)  return { tick: 50,  label: 100 };
  if (maxM <= 900)  return { tick: 100, label: 200 };
  if (maxM <= 1400) return { tick: 100, label: 500 };
  return { tick: 200, label: 600 };
}

export function drawDepthGauge(ctx, {
  W, H, depth, deepest = 0,
  crushDepth, oxygenLine, crushPhase = 'safe', crushT = 0, t = 0,
}) {
  const maxM = floorDepthM();
  const R = gaugeRect(W, H);
  const y = (m) => depthToY(m, maxM, R.top, R.bottom);
  const { tick, label } = gaugeTickStep(maxM);
  ctx.save();

  // The amber oxygen band, then the red crush band, go down first, under the
  // column itself. The crush band (and its line, below) flash faster as the
  // diver nears crush depth while still safe — the danger reads before the
  // alarm ever sounds.
  if (oxygenLine != null) {
    const oy = y(oxygenLine);
    ctx.fillStyle = 'rgba(255,176,64,0.10)';
    ctx.fillRect(R.x - 4, oy, R.w + 12, R.bottom - oy);
  }

  const approaching = crushPhase === 'safe' && depth > crushDepth - DEPTH.approachWarnM;
  const flashK = approaching ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
  let cdY = null;
  if (crushDepth != null) {
    cdY = y(crushDepth);
    ctx.fillStyle = `rgba(255,64,64,${(0.16 * flashK).toFixed(4)})`;
    ctx.fillRect(R.x - 4, cdY, R.w + 12, R.bottom - cdY);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(R.x, R.top, R.w, R.bottom - R.top);

  const cy = y(depth);   // the live marker's row — tick labels give way to it

  // Ticks (spacing scales with the tier), numbers on the majors — all to the
  // LEFT of the column so nothing runs off the right edge of the screen.
  for (const m of tickMarks(maxM, tick)) {
    const ty = y(m);
    const major = m % label === 0;
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

  // The crush line, over the bands — always drawn, since crush depth applies
  // whether or not the diver has ever bought a Valve.
  if (crushDepth != null) {
    const crushColor = `rgba(255,90,90,${(0.85 * flashK).toFixed(4)})`;
    ctx.fillStyle = crushColor;
    ctx.fillRect(R.x - 6, cdY, R.w + 14, 2);
    text(ctx, `⚠ ${Math.round(crushDepth)}m`, R.x + R.w + 11, cdY - 9, 10, crushColor, 'left', 'middle');
  }

  // Alarm: the crush timer is counting down — wash the whole column red and
  // print the seconds left beside the marker.
  if (crushPhase === 'alarmed') {
    ctx.fillStyle = 'rgba(255,64,64,0.35)';
    ctx.fillRect(R.x - 6, R.top, R.w + 14, R.bottom - R.top);
    text(ctx, `${crushT.toFixed(1)}s`, R.x + R.w + 13, cy + 16, 12, '#ff6a6a', 'left', 'middle', true);
  }

  // Live depth: a marker riding the column plus the reading beside it.
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath();
  ctx.moveTo(R.x + R.w + 1, cy); ctx.lineTo(R.x + R.w + 9, cy - 5); ctx.lineTo(R.x + R.w + 9, cy + 5);
  ctx.closePath(); ctx.fill();
  text(ctx, `${Math.round(depth)} m`, R.x + R.w + 13, cy, 13, '#bfe6ff', 'left', 'middle', true);

  ctx.restore();
}
