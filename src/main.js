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

// Space / click / tap advances menus and toggles pause.
function action() { audio.ensure(); audio.resume(); game.onAction(); }
window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); action(); } });
canvas.addEventListener('mousedown', action);
canvas.addEventListener('touchstart', () => { audio.ensure(); audio.resume(); if (game.state !== 'playing') game.onAction(); }, { passive: true });

// Ambient bubbles drifting up on the menu, for atmosphere.
let ambientT = 0;

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;          // clamp big gaps (tab switches)

  if (game.state === 'menu') {
    ambientT += dt;
    if (ambientT > 0.15) { ambientT = 0; particles.bubble(Math.random() * WORLD.W, WORLD.H + 10); }
  }

  game.update(dt);
  particles.update(dt);
  game.draw();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
