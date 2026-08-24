// The reef MiniGame module (Phase 6). Module-logic proof against a stub host +
// shell facade — the reef OWNS the run-state and implements the MiniGame shape.
// The seam proof (a REAL Game driven through the reef) lives in reef-seam.test.mjs.
// Run: node tests/minigames/reef.test.mjs

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null };

import { makeReef } from '../../src/minigames/reef/index.js';

let passed = 0, failed = 0;
const check = (n, c) => c ? passed++ : (failed++, console.error(`  FAIL: ${n}`));

const noop = new Proxy({}, { get: () => () => {} });
const host = {
  audio: noop, input: noop, particles: noop, viewport: { W: 900, H: 600 },
  world: { diver: {}, camX: 0, camY: 0, air: 100, airMax: 100, placeDiver() {} },
  economy: { earn() {}, state: {} },
  progression: { recordRun: () => ({ newBadges: [], freshTiers: [] }) },
  achievements: { unlock() {} },
};
const shell = { state: 'menu', controlScheme: 'keyboard', hi: 0, hiReef: 1, saveHi() {} };

const reef = makeReef({ host, shell, ctx: noop, bg: noop });
check('id is reef', reef.id === 'reef');
check('has MiniGame shape', ['enter', 'update', 'render', 'exit'].every((m) => typeof reef[m] === 'function'));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
