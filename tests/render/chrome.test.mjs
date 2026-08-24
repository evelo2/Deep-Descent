// Shared canvas-chrome helpers (Phase 7 dedup): the pure drawing primitives that
// used to be duplicated byte-for-byte between the game.js shell and the reef
// MiniGame. Proves each helper against a recording 2D context.
// Run: node tests/render/chrome.test.mjs

import { WORLD, PAL } from '../../src/config.js';
import { text, panel, overlay, keycap, mmss } from '../../src/render/chrome.js';

let passed = 0, failed = 0;
const check = (n, c) => c ? passed++ : (failed++, console.error(`  FAIL: ${n}`));

// A fake CanvasRenderingContext2D that records the calls + a snapshot of the
// relevant mutable state at the moment of each paint.
function recordingCtx() {
  const ctx = {
    _fills: [], _rects: [], _ops: [],
    font: '', textAlign: '', textBaseline: '',
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    shadowColor: '', shadowBlur: 0,
    save() { this._ops.push('save'); },
    restore() { this._ops.push('restore'); },
    beginPath() { this._ops.push('beginPath'); },
    roundRect(x, y, w, h, r) { this._ops.push('roundRect'); this._rects.push({ kind: 'round', x, y, w, h, r }); },
    fill() { this._ops.push('fill'); },
    stroke() { this._ops.push('stroke'); },
    fillRect(x, y, w, h) { this._rects.push({ kind: 'fill', x, y, w, h, fillStyle: this.fillStyle }); },
    fillText(str, x, y) {
      this._fills.push({ str, x, y, fillStyle: this.fillStyle, font: this.font, align: this.textAlign, base: this.textBaseline, shadowBlur: this.shadowBlur });
    },
    measureText(s) { return { width: s.length * 6 }; },
  };
  return ctx;
}

// Give the shared module a known viewport (it reads WORLD.W/H live).
WORLD.W = 900; WORLD.H = 600;

// ---- mmss (pure) ----------------------------------------------------------
check('mmss 0', mmss(0) === '0:00');
check('mmss 9', mmss(9) === '0:09');
check('mmss 65', mmss(65) === '1:05');
check('mmss clamps negatives', mmss(-5) === '0:00');
check('mmss ceils partial', mmss(3.2) === '0:04');

// ---- text -----------------------------------------------------------------
{
  const ctx = recordingCtx();
  text(ctx, 'Hi', 10, 20, 16, '#abc', 'center', 'middle', true);
  const t = ctx._fills[0];
  check('text draws the string at x,y', t && t.str === 'Hi' && t.x === 10 && t.y === 20);
  check('text uses the color', t.fillStyle === '#abc');
  check('text bold => weight 800 + size px', t.font.includes('800') && t.font.includes('16px'));
  check('text honors align/baseline', t.align === 'center' && t.base === 'middle');
  check('text resets shadowBlur to 0 after', ctx.shadowBlur === 0);
}
{
  const ctx = recordingCtx();
  text(ctx, 'x', 0, 0, 12, '#fff'); // defaults: left / alphabetic / not bold
  const t = ctx._fills[0];
  check('text default weight 600', t.font.includes('600'));
  check('text default align left', t.align === 'left' && t.base === 'alphabetic');
}

// ---- panel ----------------------------------------------------------------
{
  const ctx = recordingCtx();
  panel(ctx, 0.4);
  const r = ctx._rects[0];
  check('panel fills full viewport', r && r.kind === 'fill' && r.x === 0 && r.y === 0 && r.w === 900 && r.h === 600);
  check('panel uses alpha in fillStyle', r.fillStyle === 'rgba(3,15,30,0.4)');
}
{
  const ctx = recordingCtx();
  panel(ctx); // default alpha 0.55
  check('panel default alpha 0.55', ctx._rects[0].fillStyle === 'rgba(3,15,30,0.55)');
}

// ---- overlay --------------------------------------------------------------
{
  const ctx = recordingCtx();
  overlay(ctx, 'PAUSED', 'tap to resume');
  check('overlay paints a panel first', ctx._rects.some((r) => r.kind === 'fill' && r.w === 900));
  check('overlay draws title + sub', ctx._fills.length === 2 && ctx._fills[0].str === 'PAUSED' && ctx._fills[1].str === 'tap to resume');
  check('overlay centers horizontally', ctx._fills[0].x === 450 && ctx._fills[1].x === 450);
}

// ---- keycap ---------------------------------------------------------------
{
  const ctx = recordingCtx();
  keycap(ctx, 'Q', 30, 40);
  check('keycap boxes with save/restore', ctx._ops.includes('save') && ctx._ops.includes('restore'));
  check('keycap draws a rounded box', ctx._rects.some((r) => r.kind === 'round' && r.x === 30 && r.w === 15 && r.h === 15));
  check('keycap labels the key', ctx._fills.some((f) => f.str === 'Q'));
}

// PAL is imported to prove the module resolves the palette the same way.
check('PAL available (import sanity)', typeof PAL.hudText === 'string');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
