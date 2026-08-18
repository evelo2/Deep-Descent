// Entry point: sizes a fixed logical canvas to the viewport (crisp on HiDPI),
// wires input/audio, and runs the fixed-timestep-ish RAF loop.
import { WORLD } from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Particles } from './systems/particles.js';
import { Background } from './render/background.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const input = new Input(canvas);
const audio = new Audio();
const particles = new Particles();
const background = new Background();
const game = new Game(ctx, input, audio, particles, background);

// Fit the logical 900×600 field into the viewport, preserving aspect ratio,
// and scale the backing store by devicePixelRatio for sharp rendering.
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / WORLD.W, vh / WORLD.H);
  const cssW = Math.round(WORLD.W * scale), cssH = Math.round(WORLD.H * scale);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(WORLD.W * scale * dpr);
  canvas.height = Math.round(WORLD.H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0); // draw in logical units
}
window.addEventListener('resize', resize);
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
canvas.addEventListener('mousedown', () => {
  audio.ensure(); audio.resume();
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

  game.update(dt);
  particles.update(dt);
  game.draw();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
