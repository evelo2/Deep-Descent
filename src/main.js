// Entry point: sizes a fixed logical canvas to the viewport (crisp on HiDPI),
// wires input/audio, and runs the fixed-timestep-ish RAF loop.
import { WORLD, computeViewport } from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Particles } from './systems/particles.js';
import { Background } from './render/background.js';
import { setViewport } from './game.js';
import { Core } from './core/core.js';
import { makeHost, restrictHost } from './core/host.js';
import { makeEconomy } from './core/economy.js';
import { makeProgression } from './core/progression.js';
import { makeAchievements } from './core/achievements.js';
import { makeDiverWorld } from './core/world/index.js';
import { createLegacyMiniGame } from './minigames/legacy/index.js';
import { makeMatch3 } from './minigames/match3/index.js';
import { manifestById } from './minigames/catalogue.js';
import { boardHitTest, backHitTest } from './render/match3.js';
import { VERSION, BUILD, ENGINE_VERSION } from './version.js';

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
// Phase 3: the DiverWorld engine owns the diver/camera/air. It's exposed as
// host.world AND handed to the legacy game so the game's diver IS the engine's —
// one diver world, reachable by every future diver-world minigame.
const world = makeDiverWorld({ viewport: WORLD });
const host = makeHost({
  audio, input, particles,
  viewport: WORLD, rng: Math.random,
  economy, progression, achievements, world,
});
const core = new Core({ host });
// Phase 11.1: each minigame is constructed with its OWN capability-restricted
// Host, built from its manifest — not the raw `host` above. Enforcement has to
// happen HERE, at construction, not merely inside Core.register/_hostFor: both
// minigames close over the host they're built with and ignore whatever enter()
// hands them later (legacy hands it straight to `new Game(...)`; match3 closes
// over `host` in makeMatch3's params and its enter(_host, ctx) discards the
// argument). `open`/`close` are copied by reference by restrictHost, so
// binding the core via the original `host` below still wires them on these
// restricted copies too (see host.js restrictHost doc). `_bindCore` itself is
// NOT copied onto restricted hosts — only the original, unrestricted `host`
// below gets to rebind Core; a minigame holding a restricted host must not be
// able to reach it (see host.js restrictHost doc for why).
//
// Manifests are sourced THROUGH the catalogue (manifestById), not imported
// directly — the catalogue is the single source of truth for "which
// minigames exist"; main.js registering something the catalogue doesn't
// list (or vice versa) would desync the Library/Trophy Wall from the shell
// (see tests/minigames/catalogue.test.mjs's registration-parity check).
const legacyManifest = manifestById('legacy');
const match3Manifest = manifestById('match3');
const legacyHost = restrictHost(host, legacyManifest.capabilities);
const legacy = createLegacyMiniGame({ ctx, input, audio, particles, background, economy, progression, achievements, world, host: legacyHost });
core.register(legacy, legacyManifest);
// Phase 9: resolve the Core↔Host chain so minigames can host.open/close, then
// register the first NEW minigame (Salvage Match). It's menu-launched over the
// reef and credits the ONE shared economy per level cleared.
host._bindCore(core);
const match3Host = restrictHost(host, match3Manifest.capabilities);
const match3 = makeMatch3({ host: match3Host });
core.register(match3, match3Manifest);
core.boot('legacy');

// The live Game instance, for the input-event wiring below (input plumbing is
// formalized in a later phase; the frame loop already runs through the Core).
const game = legacy.game;

// About-screen data: engine + app identity from version.js, minigame versions
// enumerated from the Core registry (single source; auto-covers future games).
game.aboutInfo = { engine: ENGINE_VERSION, app: VERSION, build: BUILD, games: core.versions() };

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
// The input events below drive the LEGACY game directly (dive/menus). When a
// session minigame (match3) is on top of the Core stack, the legacy is paused
// underneath — so gate these on the legacy being top-of-stack, and route the
// pointer to the match-3 board instead when it is active.
const isLegacyTop = () => core.activeId() === 'legacy';

// Pointer swaps + ✕ quit for match-3 (it hit-tests its own board rather than
// registering touch buttons). Supports BOTH gestures a player expects: a
// Candy-Crush drag (press a tile, release on an adjacent one) and two taps
// (tap a tile, then tap its neighbour). A tap on ✕ bails out.
let m3sel = null;    // currently-selected tile (two-tap first pick / drag origin)
let m3down = null;   // cell where the active press began (drag origin)
const m3adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

function m3PointerDown(clientX, clientY) {
  const p = input.toLogical(clientX, clientY);
  if (backHitTest(match3, host, p.x, p.y)) { host.close(match3.exit()); m3sel = null; m3down = null; match3.sel = null; return; }
  if (match3.phase !== 'play') { match3._pointerAdvance(); m3sel = null; m3down = null; match3.sel = null; return; }
  const cell = boardHitTest(match3, host, p.x, p.y);
  m3down = cell;
  if (!cell) { m3sel = null; match3.sel = null; return; }
  // Two-tap: a prior selection + an adjacent tap resolves the swap immediately.
  if (m3sel && m3adjacent(m3sel, cell)) { match3.trySwap(m3sel.r, m3sel.c, cell.r, cell.c); m3sel = null; m3down = null; match3.sel = null; return; }
  // Tapping the selected tile again clears it; otherwise (re)select this tile.
  if (m3sel && m3sel.r === cell.r && m3sel.c === cell.c) { m3sel = null; match3.sel = null; }
  else { m3sel = cell; match3.sel = cell; }
}

function m3PointerUp(clientX, clientY) {
  const origin = m3down; m3down = null;
  if (!origin || match3.phase !== 'play') return;
  const p = input.toLogical(clientX, clientY);
  const cell = boardHitTest(match3, host, p.x, p.y);
  // Drag: released on a DIFFERENT adjacent cell → swap now. A release on the
  // same cell is a plain tap — leave it selected for the two-tap path.
  if (cell && (cell.r !== origin.r || cell.c !== origin.c) && m3adjacent(origin, cell)) {
    match3.trySwap(origin.r, origin.c, cell.r, cell.c);
    m3sel = null; match3.sel = null;
  }
}

function action() { if (!isLegacyTop()) return; audio.ensure(); audio.resume(); game.onAction(); }
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
  // Match-3 on top of the stack owns the pointer (it hit-tests its own board),
  // so route to it FIRST — before the legacy button gate, whose paused-game
  // buttons must not swallow board clicks.
  if (core.activeId() === 'match3') { m3PointerDown(e.clientX, e.clientY); return; }
  // Click an on-screen UI button (menu/help/shop/dry-dock/scheme) — the game
  // consumes it next frame. Only fall back to the start/confirm action when the
  // click missed every button, so clicking HELP no longer just starts the game.
  const hit = input.hitButtonAt(e.clientX, e.clientY);
  if (hit) { input.pressButton(hit); return; }
  if (isLegacyTop() && game.state !== 'playing') game.onAction();
});
// Match-3 drag release (mouse): completes a press-and-drag swap.
canvas.addEventListener('mouseup', (e) => { if (core.activeId() === 'match3') m3PointerUp(e.clientX, e.clientY); });
// Touch: tap-to-fire is detected inside Input; a tap on the menus starts the game.
// (Paused is resumed via the on-screen ▶ button, so tap-anywhere is limited to
// the menu/gameover screens — otherwise a tap on a HUD button would also resume.)
canvas.addEventListener('touchstart', (e) => {
  audio.ensure(); audio.resume();
  if (core.activeId() === 'match3') {
    if (input._btnTouch) return;   // a HUD/quit touch button was already tapped
    const t = e.changedTouches && e.changedTouches[0];
    if (t) m3PointerDown(t.clientX, t.clientY);
    return;
  }
  if (isLegacyTop() && (game.state === 'menu' || game.state === 'gameover') && !input._btnTouch) game.onAction();
}, { passive: true });
// Match-3 drag release (touch): completes a press-and-drag swap.
canvas.addEventListener('touchend', (e) => {
  if (core.activeId() !== 'match3') return;
  const t = e.changedTouches && e.changedTouches[0];
  if (t) m3PointerUp(t.clientX, t.clientY);
}, { passive: true });

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
