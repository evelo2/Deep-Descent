// The reef's depth gauge: a vertical column down the right edge showing the
// whole water column, a marker at the diver's live depth, a ghost pip at the
// deepest point of the dive, an amber oxygen band and a red crush band (with
// its "⚠" line always drawn, flashing on approach), and a countdown while the
// crush alarm is running. The arithmetic is pure and asserted directly; the
// painting is proved against a recording 2D context.
// Run: node tests/render/depthgauge.test.mjs

import { WORLD, DEPTH, crushDepthM } from '../../src/config.js';
import { metresDown, floorDepthM, gaugeRect, depthToY, tickMarks, drawDepthGauge, gaugeTickStep } from '../../src/render/depthgauge.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// A fake CanvasRenderingContext2D that records paints (same shape as the one in
// tests/render/chrome.test.mjs, plus the path calls the marker triangle uses).
function recordingCtx() {
  return {
    _fills: [], _rects: [], _ops: [],
    font: '', textAlign: '', textBaseline: '',
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    shadowColor: '', shadowBlur: 0,
    save() { this._ops.push('save'); }, restore() { this._ops.push('restore'); },
    beginPath() { this._ops.push('beginPath'); }, closePath() { this._ops.push('closePath'); },
    moveTo() {}, lineTo() {}, arc() {},
    roundRect(x, y, w, h, r) { this._rects.push({ kind: 'round', x, y, w, h, r, fillStyle: this.fillStyle }); },
    fill() { this._ops.push('fill'); }, stroke() { this._ops.push('stroke'); },
    fillRect(x, y, w, h) { this._rects.push({ kind: 'fill', x, y, w, h, fillStyle: this.fillStyle }); },
    fillText(str, x, y) { this._fills.push({ str, x, y, fillStyle: this.fillStyle, font: this.font, align: this.textAlign }); },
    measureText(s) { return { width: s.length * 6 }; },
  };
}

// ---- metresDown: world y -> metres below the surface -----------------------
check('the surface is 0 m', metresDown(WORLD.SURFACE) === 0);
check('above the surface clamps to 0 m', metresDown(WORLD.SURFACE - 400) === 0);
check('10 world units = 1 m', metresDown(WORLD.SURFACE + 1000) === 100);
check('the world floor is the full depth', metresDown(WORLD.WH) === floorDepthM());
check('the floor is the world height minus the surface, in metres',
  floorDepthM() === (WORLD.WH - WORLD.SURFACE) / 10);

// ---- gaugeRect: placement, from the LIVE viewport --------------------------
{
  const R = gaugeRect(900, 600);
  check('the column clears the right-aligned HUD text block', R.top >= 120);
  check('the column stops short of the bottom edge', R.bottom < 600 && R.bottom > R.top);
  // The gauge lives on the LEFT. The right edge is not free for a full-height
  // strip: the reef's minimap panel occupies x >= W-136 (reef/index.js
  // _minimap: mx = W-132, panel mx-4) for y 124..309, and the touch controls
  // own the bottom-right (game.js: the `aim` pad from W-142, the
  // weapon/flare/torch column from W-66). Below the AIR/lives/battery block the
  // left edge is clear all the way down, so the column goes there.
  check('the column sits on the left, clear of the busy right edge', R.x + R.w < 900 / 2);
  check('the column is inset from the very edge', R.x > 8 && R.x < 60);
  const wide = gaugeRect(1400, 600);
  check('a left-anchored column does not drift with viewport width', wide.x === R.x);
  const tall = gaugeRect(900, 900);
  check('the column grows with a taller viewport', tall.bottom > R.bottom);
}

// ---- depthToY: the pure mapping -------------------------------------------
check('the surface maps to the top of the column', depthToY(0, 411, 100, 500) === 100);
check('the floor maps to the bottom of the column', depthToY(411, 411, 100, 500) === 500);
check('halfway down maps to the middle', Math.abs(depthToY(205.5, 411, 100, 500) - 300) < 1e-9);
check('above the surface clamps to the top', depthToY(-50, 411, 100, 500) === 100);
check('below the floor clamps to the bottom', depthToY(999, 411, 100, 500) === 500);

// ---- tickMarks -------------------------------------------------------------
{
  const t = tickMarks(411, 50);
  check('ticks start at the surface', t[0] === 0);
  check('ticks step by the given interval', t[1] === 50 && t[2] === 100);
  check('ticks never run past the floor', t[t.length - 1] <= 411);
  check('ticks cover the column', t.length === 9);
}

// ---- drawing: baseline (safe, well clear of the crush line) ---------------
{
  const ctx = recordingCtx();
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 118, deepest: 162,
    crushDepth: 400, oxygenLine: 250, crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
  });
  const texts = ctx._fills.map((f) => f.str);
  const R = gaugeRect(900, 600);

  check('the live depth is printed beside the marker', texts.some((s) => s.includes('118')));
  check('depth labels are printed every 100 m',
    texts.includes('100') && texts.includes('200') && texts.includes('300'));
  check('the 50 m ticks are drawn but not labelled', !texts.includes('50') && !texts.includes('150'));
  check('the labels sit to the RIGHT of the column, out over the water',
    ctx._fills.every((f) => f.x >= R.x));
  // There is no valve-ownership gate any more: the crush line is ALWAYS drawn,
  // since crush depth applies whether or not a Valve was ever bought.
  check('the crush line is always drawn, with its depth',
    texts.some((s) => s.includes('⚠') && s.includes('400')));

  const yNow = depthToY(118, floorDepthM(), R.top, R.bottom);
  const yDeep = depthToY(162, floorDepthM(), R.top, R.bottom);
  check('the deepest point sits below the current marker', yDeep > yNow);
  check('a thin ghost pip is drawn at the deepest depth',
    ctx._rects.some((r) => Math.abs(r.y - yDeep) < 2 && r.h <= 3));
  check('the gauge saves and restores the context', ctx._ops[0] === 'save' && ctx._ops[ctx._ops.length - 1] === 'restore');
}

// ---- drawing: the ghost pip is pointless when you are at your deepest ------
{
  const ctx = recordingCtx();
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 118, deepest: 118,
    crushDepth: 400, oxygenLine: 250, crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
  });
  const R = gaugeRect(900, 600);
  const y = depthToY(118, floorDepthM(), R.top, R.bottom);
  check('no ghost pip when the deepest point IS the current depth',
    !ctx._rects.some((r) => Math.abs(r.y - y) < 2 && r.h <= 3));
}

// ---- drawing: the oxygen and crush bands are tinted ------------------------
{
  const ctx = recordingCtx();
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 118, deepest: 118,
    crushDepth: 400, oxygenLine: 250, crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
  });
  const texts = ctx._fills.map((f) => f.str);
  const rectFills = ctx._rects.map((r) => r.fillStyle);
  const R = gaugeRect(900, 600);
  const cdY = depthToY(400, floorDepthM(), R.top, R.bottom);
  const oyY = depthToY(250, floorDepthM(), R.top, R.bottom);

  check('the crush line is labelled at its depth', texts.some((s) => s.includes('400')));
  check('the crush label carries the crush glyph', texts.some((s) => s.includes('⚠')));
  check('an amber oxygen band is painted', rectFills.some((f) => f.includes('255,176,64')));
  check('a red crush band is painted', rectFills.some((f) => f.includes('255,64,64')));
  check('the crush band runs from the crush line down to the floor',
    ctx._rects.some((r) => r.fillStyle.includes('255,64,64') && Math.abs(r.y - cdY) < 2 && Math.abs((r.y + r.h) - R.bottom) < 2 && r.h > 10));
  check('the oxygen band runs from the oxygen line down to the floor',
    ctx._rects.some((r) => r.fillStyle.includes('255,176,64') && Math.abs(r.y - oyY) < 2 && Math.abs((r.y + r.h) - R.bottom) < 2 && r.h > 10));
}

// ---- drawing: the reading must not print on top of a tick label -----------
{
  const ctx = recordingCtx();
  // Parked exactly on the 200 m tick. The bold live reading and that tick's
  // label are both right-aligned to nearly the same x, so the label gives way.
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 200, deepest: 200,
    crushDepth: 400, oxygenLine: 250, crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
  });
  const texts = ctx._fills.map((f) => f.str);
  check('the tick label under the marker is suppressed', !texts.includes('200'));
  check('the live reading is still printed', texts.some((s) => s.includes('200 m')));
  check('tick labels clear of the marker are untouched', texts.includes('100') && texts.includes('300'));
}

// ---- drawing: the last tick label must not collide with the floor cap ------
{
  // The floor cap ("411 m") sits ~12px under the 400 m tick. Same rule as the
  // marker: the tick label gives way rather than printing on top of it.
  const ctx = recordingCtx();
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 10, deepest: 10,
    crushDepth: 400, oxygenLine: 250, crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
  });
  const texts = ctx._fills.map((f) => f.str);
  check('the last tick label gives way to the floor cap', !texts.includes('400'));
  check('the floor cap itself is printed', texts.some((s) => s.includes('411')));
  check('tick labels clear of the cap are unaffected', texts.includes('200') && texts.includes('300'));
}

// ---- gaugeTickStep: tick spacing must scale with the tier ------------------
{
  const t1 = gaugeTickStep(411);
  check('tier 1 keeps the 50/100 m spacing it always had', t1.tick === 50 && t1.label === 100);
  const t4 = gaugeTickStep(1800);
  check('an 1800 m column uses coarser ticks', t4.tick > 50);
  check('an 1800 m column labels no more than 10 times', 1800 / t4.label <= 10);
  check('labels are always a whole multiple of ticks', t4.label % t4.tick === 0);
  check('tick spacing never shrinks as the world deepens', gaugeTickStep(1150).tick >= t1.tick);
}

// ---- drawing at tier-4 scale: bands, approach flash, alarm countdown -------
{
  WORLD.WH = 18090;   // tier 4 (1800 m), so a Lv1 crush depth (720 m) is on-scale

  // The danger bands are painted, with the crush line labelled at its depth.
  {
    const ctx = recordingCtx();
    drawDepthGauge(ctx, {
      W: 900, H: 600, depth: 100, deepest: 100,
      crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
      crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
    });
    const rectFills = ctx._rects.map((r) => r.fillStyle);
    const texts = ctx._fills.map((f) => f.str);
    check('an amber oxygen band is painted at tier-4 scale', rectFills.some((f) => f.includes('255,176,64')));
    check('a red crush band is painted at tier-4 scale', rectFills.some((f) => f.includes('255,64,64')));
    check('the crush line is labelled with its depth', texts.some((s) => s.includes('720')));
  }

  // Approaching the crush line while still safe flashes the band + line.
  {
    const near = DEPTH.approachWarnM - 5;   // just inside the warning band
    const a = recordingCtx(), b = recordingCtx();
    const args = (t) => ({
      W: 900, H: 600, depth: crushDepthM(1) - near, deepest: 0,
      crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
      crushPhase: 'safe', crushT: DEPTH.crushTimer, t,
    });
    drawDepthGauge(a, args(0));
    drawDepthGauge(b, args(0.5));   // half a flash period later
    check('the gauge paints differently as it flashes on approach',
      JSON.stringify(a._rects) !== JSON.stringify(b._rects));
  }

  // Not approaching (well clear of the line, still safe) does not flash.
  {
    const a = recordingCtx(), b = recordingCtx();
    const args = (t) => ({
      W: 900, H: 600, depth: 100, deepest: 0,
      crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
      crushPhase: 'safe', crushT: DEPTH.crushTimer, t,
    });
    drawDepthGauge(a, args(0));
    drawDepthGauge(b, args(0.5));
    check('well clear of the crush line, the bands do not flash',
      JSON.stringify(a._rects) === JSON.stringify(b._rects));
  }

  // Alarm: the countdown prints the seconds remaining.
  {
    const ctx = recordingCtx();
    drawDepthGauge(ctx, {
      W: 900, H: 600, depth: 900, deepest: 900,
      crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
      crushPhase: 'alarmed', crushT: 7.4, t: 0,
    });
    const texts = ctx._fills.map((f) => f.str);
    check('the alarm prints the seconds remaining', texts.some((s) => s.includes('7.4')));
  }

  WORLD.WH = 4200;   // restore the tier-1 world for anything importing later
}

console.log(`ok depthgauge.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
