// The reef's OBJECTIVE relic must never spawn below the diver's crush depth —
// otherwise a player who skipped the shop (valveLevel 0) can generate an
// unwinnable reef. This is a STATISTICAL check against REAL world generation
// (not the pure config functions): fix round 1 found that an unfiltered
// fallback in the relic-placement code let violations through ~15% of the
// time at reef 21/valveLevel 0, because C.randomOpen() samples uniformly
// across the whole water column and an unvalved crush depth is a small slice
// of a tier-4 world. Run: node tests/game/relic-crush-depth.test.mjs

// Cave's constructor touches the DOM; mirror the stub the other reef-side
// tests use (valve-air.test.mjs / abyss-air.test.mjs).
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  getElementById: () => null,
  createElement: () => {
    const ctx = {
      fillRect() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      translate() {}, scale() {}, rotate() {}, drawImage() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {}, quadraticCurveTo() {}, strokeRect() {},
    };
    return { width: 0, height: 0, getContext: () => ctx };
  },
};

import { makeReef } from '../../src/minigames/reef/index.js';
import { WORLD, crushDepthM } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const noop = new Proxy({}, { get: () => () => {} });
function makeHostShell() {
  const host = {
    audio: noop, input: noop, particles: noop, viewport: { W: 900, H: 600 },
    world: { diver: {}, camX: 0, camY: 0, air: 100, airMax: 100, placeDiver() {} },
    economy: { earn() {}, state: { salvage: 0, loadout: [] } },
    progression: { badges: {}, stats: {}, progress: {} },
    achievements: { unlock() {} },
  };
  const shell = { state: 'menu', controlScheme: 'keyboard', hi: 0, hiReef: 1, saveHi() {}, pendingStartReef: 1 };
  return { host, shell };
}

// Worst case: reef 21 (tier 4, the biggest world) with valveLevel 0 (the
// smallest crush depth, so the survivable band is the smallest fraction of
// the water column and a uniform fallback is most likely to overshoot it).
const { host, shell } = makeHostShell();
const reef = makeReef({ host, shell, ctx: noop, bg: noop });
reef.start(1);
reef.reef = 21;
reef.valveLevel = 0;

const TRIALS = 250;
const limit = WORLD.SURFACE + crushDepthM(0) * 10;
let violations = 0, maxOvershootM = 0;
for (let i = 0; i < TRIALS; i++) {
  reef._generateWorld();
  if (reef.relic.y > limit) {
    violations++;
    maxOvershootM = Math.max(maxOvershootM, (reef.relic.y - limit) / 10);
  }
}

check(`the relic never spawns below crush depth over ${TRIALS} reef-21/valveLevel-0 generations`,
  violations === 0);
if (violations > 0) {
  console.error(`  (${violations}/${TRIALS} violations, worst overshoot ${maxOvershootM.toFixed(1)} m below crush depth)`);
}

console.log(`ok relic-crush-depth.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
