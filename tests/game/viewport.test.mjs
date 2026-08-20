// Responsive-viewport sizing gate. Run: node tests/game/viewport.test.mjs
// The canvas must FILL the screen (no letterbox) for landscape + desktop, with
// the 900x600 core always fully visible and the long axis extended to the edges.
import { computeViewport, VIEWPORT } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const { coreW, coreH, maxW, maxH } = VIEWPORT;

// Given a viewport, does the fitted canvas fill each axis? (mirrors main.js:
// scale = min(vw/w, vh/h); fill = w*scale/vw and h*scale/vh)
function fill(vw, vh) {
  const { w, h } = computeViewport(vw, vh);
  const scale = Math.min(vw / w, vh / h);
  return { w, h, fillW: w * scale / vw, fillH: h * scale / vh };
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// --- 1. the core is always fully visible (never smaller than 900x600) ---
for (const [vw, vh] of [[844, 390], [915, 412], [1440, 900], [1024, 768], [390, 844], [768, 1024], [900, 600]]) {
  const { w, h } = computeViewport(vw, vh);
  check(`${vw}x${vh}: logical W >= core`, w >= coreW - 0.5);
  check(`${vw}x${vh}: logical H >= core`, h >= coreH - 0.5);
  check(`${vw}x${vh}: within clamps`, w <= maxW + 0.5 && h <= maxH + 0.5);
}

// --- 2. LANDSCAPE phones + desktop fill BOTH axes completely (the bug) ---
for (const [vw, vh, label] of [
  [844, 390, 'iPhone 14 landscape'],
  [915, 412, 'Pixel landscape'],
  [1024, 768, 'iPad landscape'],
  [1440, 900, 'laptop 16:10'],
  [1280, 720, '16:9 desktop'],
  [900, 600, 'exact 3:2 core'],
]) {
  const f = fill(vw, vh);
  check(`${label} (${vw}x${vh}): fills width`, approx(f.fillW, 1));
  check(`${label} (${vw}x${vh}): fills height`, approx(f.fillH, 1));
}

// --- 3. the extended axis matches the screen aspect within the clamp range ---
{
  const f = fill(844, 390);            // aspect 2.16, inside maxW=2.5x
  check('landscape logical aspect matches screen', approx(f.w / f.h, 844 / 390, 0.02));
  check('landscape height stays at the core', f.h === coreH);
}
{
  const f = fill(768, 1024);           // portrait 0.75, inside maxH
  check('portrait width stays at the core', f.w === coreW);
  check('portrait height extends past core', f.h > coreH);
}

// --- 4. extreme aspects clamp (never absurd), still core-visible ---
{
  const wide = computeViewport(3000, 600);   // 5:1 ultrawide
  check('ultrawide clamps width to maxW', wide.w === maxW);
  const tall = computeViewport(390, 844);    // 0.46 tall phone
  check('tall phone clamps height to maxH', tall.h === maxH);
  check('tall phone fills width', approx(390 / tall.w * tall.h, 844, 1) || (tall.w === coreW));
}

// --- 5. determinism ---
{
  const a = computeViewport(844, 390), b = computeViewport(844, 390);
  check('deterministic', a.w === b.w && a.h === b.h);
}

console.log(`viewport: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
