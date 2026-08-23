// DiverWorld engine — slice 1 (the kinematic/vital core the diver world shares).
// makeDiverWorld() OWNS diver/camera/air and offers placeDiver(); host.world is
// this object. Pure — no Game, no DOM. Run: node tests/core/world.test.mjs
//
// See docs/superpowers/specs/2026-08-22-diverworld-engine-slice1-design.md.

import { makeDiverWorld } from '../../src/core/world/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const near = (a, b) => Math.abs(a - b) < 1e-9;

// A fixed viewport stub matching the reference world (WORLD in config.js):
// live W/H (the visible viewport) + fixed WW/WH (the scrollable world extents).
const mkViewport = () => ({ W: 900, H: 600, WW: 2760, WH: 4200 });

// --- Owned surface: the engine exposes the slice-1 fields as read/write state. ---
{
  const world = makeDiverWorld({ viewport: mkViewport() });
  check('exposes a diver slot', 'diver' in world);
  check('exposes camX/camY', typeof world.camX === 'number' && typeof world.camY === 'number');
  check('exposes air/airMax', typeof world.air === 'number' && typeof world.airMax === 'number');
  check('exposes placeDiver()', typeof world.placeDiver === 'function');

  // The engine owns the slots; the consumer assigns the entity / values.
  world.diver = { x: 0, y: 0, vx: 0, vy: 0, invuln: 0 };
  world.air = 80; world.airMax = 100;
  check('air/airMax are writable state', world.air === 80 && world.airMax === 100);
}

// --- placeDiver: sets diver pose (x/y/vx, vy=0, invuln=1.6) and clamps the
// camera to [0, WW-W] × [0, WH-H] — the exact semantics of Game._placeDiver. ---
{
  const world = makeDiverWorld({ viewport: mkViewport() });
  world.diver = { x: 0, y: 0, vx: 0, vy: 9, invuln: 0, radius: 15 };
  world.placeDiver(1380, 300, 5);
  const d = world.diver;
  check('diver x/y/vx set', d.x === 1380 && d.y === 300 && d.vx === 5);
  check('diver vy zeroed', d.vy === 0);
  check('diver invuln armed (1.6)', near(d.invuln, 1.6));
  // camX = clamp(1380 - 900/2, 0, 2760-900) = clamp(930, 0, 1860) = 930
  check('camX centers on diver, clamped', world.camX === 930);
  // camY = clamp(300 - 600/2, 0, 4200-600) = clamp(0, 0, 3600) = 0
  check('camY clamps to 0 near the top', world.camY === 0);
}

// --- Camera clamp extremes. ---
{
  const world = makeDiverWorld({ viewport: mkViewport() });
  world.diver = { x: 0, y: 0, vx: 0, vy: 0, invuln: 0 };
  world.placeDiver(-5000, -5000, 0);
  check('camX floors at 0', world.camX === 0);
  check('camY floors at 0', world.camY === 0);
  world.placeDiver(1e9, 1e9, 0);
  check('camX caps at WW-W (1860)', world.camX === 1860);
  check('camY caps at WH-H (3600)', world.camY === 3600);
}

// --- Reads the viewport LIVE (never caches W/H) — the responsive-viewport
// constraint: after the visible viewport flexes, the camera clamp must follow. ---
{
  const vp = mkViewport();
  const world = makeDiverWorld({ viewport: vp });
  world.diver = { x: 0, y: 0, vx: 0, vy: 0, invuln: 0 };
  vp.W = 1200; vp.H = 700;                 // viewport flexed wider/taller
  world.placeDiver(1e9, 1e9, 0);
  check('camX cap follows live W (WW-1200=1560)', world.camX === 1560);
  check('camY cap follows live H (WH-700=3500)', world.camY === 3500);
}

console.log(`world: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
