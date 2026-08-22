// Entry point: sizes a fixed logical canvas to the viewport (crisp on HiDPI),
// wires input/audio, and runs the fixed-timestep-ish RAF loop.
import { WORLD, computeViewport } from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Particles } from './systems/particles.js';
import { Background } from './render/background.js';
import { setViewport } from './game.js';
import { Core } from './core/core.js';
import { makeHost } from './core/host.js';
import { makeEconomy } from './core/economy.js';
import { makeProgression } from './core/progression.js';
import { makeAchievements } from './core/achievements.js';
import { createLegacyMiniGame } from './minigames/legacy/index.js';
import { VERSION, BUILD } from './version.js';

// Boot banner — self-identifies the running build (also confirms which version
// the browser actually loaded, e.g. after a deploy or a cache purge).
console.log(`Deep Descent v${VERSION} (${BUILD})`);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const input = new Input(canvas);
const audio = new Audio();
const particles = new Particles();
const background = new Background();

// Platform boot: the game runs *through* the Core. The Core holds a Host of
// shared services and drives the active MiniGame's update/render each frame. The
// whole current game is registered as one "legacy" MiniGame — zero behavior
// change; later phases carve zones out into their own MiniGames.
//
// Phase 2: the meta-progression spine is now Core-owned — economy (wallet),
// progression (badges/stats/tiers), achievements (Steam bridge) are real
// services on the Host. They're also handed to the legacy game so its state IS
// the Core's: one shared economy, reachable by every future minigame.
const economy = makeEconomy();
const progression = makeProgression();
const achievements = makeAchievements();
const host = makeHost({
  audio, input, particles,
  viewport: WORLD, rng: Math.random,
  economy, progression, achievements,
});
const core = new Core({ host });
const legacy = createLegacyMiniGame({ ctx, input, audio, particles, background, economy, progression, achievements });
core.register(legacy);
core.boot('legacy');

// The live Game instance, for the input-event wiring below (input plumbing is
// formalized in a later phase; the frame loop already runs through the Core).
const game = legacy.game;

// The visible logical viewport flexes to the screen aspect so the canvas FILLS
// it (no letterbox bars) instead of sitting centred in a fixed 3:2 box — the
// core is always visible, the long axis extends to the edges (see a little more
// ocean, HUD & controls reach the real corners). Sizing math lives in
// computeViewport (config.js, unit-tested); here we just apply it + scale the
// backing store by devicePixelRatio for sharp rendering.
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth, vh = window.innerHeight;
  const { w: lw, h: lh } = computeViewport(vw, vh);
  setViewport(lw, lh);   // updates WORLD.W/H + the game's live viewport

  // scale fills the viewport; equal on both axes when within the clamp, so no
  // bars appear until the screen is more extreme than the clamp allows.
  const scale = Math.min(vw / lw, vh / lh);
  const cssW = Math.round(lw * scale), cssH = Math.round(lh * scale);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(lw * scale * dpr);
  canvas.height = Math.round(lh * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0); // draw in logical units
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// Menus/pause vs. firing. During play, Space/F/click fire the harpoon; on the
// menus they start/resume. (Pause is P/Esc, handled inside the game.)
function action() { audio.ensure(); audio.resume(); game.onAction(); }
// Space/Enter/F: start/confirm on the menus. During play, firing is driven by
// the held-fire state the game polls each frame (hold to aim), so we don't fire
// here. e.repeat is ignored so autorepeat can't spam confirms.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') {
    e.preventDefault();
    if (e.repeat) return;
    audio.ensure(); audio.resume();
    if (game.state !== 'playing') action();
  }
});
canvas.addEventListener('mousedown', (e) => {
  audio.ensure(); audio.resume();
  // Click an on-screen UI button (menu/help/shop/dry-dock/scheme) — the game
  // consumes it next frame. Only fall back to the start/confirm action when the
  // click missed every button, so clicking HELP no longer just starts the game.
  const hit = input.hitButtonAt(e.clientX, e.clientY);
  if (hit) { input.pressButton(hit); return; }
  if (game.state !== 'playing') game.onAction();
});
// Touch: tap-to-fire is detected inside Input; a tap on the menus starts the game.
// (Paused is resumed via the on-screen ▶ button, so tap-anywhere is limited to
// the menu/gameover screens — otherwise a tap on a HUD button would also resume.)
canvas.addEventListener('touchstart', () => { audio.ensure(); audio.resume(); if ((game.state === 'menu' || game.state === 'gameover') && !input._btnTouch) game.onAction(); }, { passive: true });

// Ambient bubbles drifting up on the menu, for atmosphere.
let ambientT = 0;

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;          // clamp big gaps (tab switches)

  if (game.state === 'menu') {
    ambientT += dt;
    if (ambientT > 0.15) { ambientT = 0; particles.bubble(game.camX + Math.random() * WORLD.W, game.camY + WORLD.H + 10); }
  }

  core.update(dt);
  particles.update(dt);
  core.render(ctx);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
