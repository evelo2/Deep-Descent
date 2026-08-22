// Host facade contract. Run: node tests/core/host.test.mjs
// makeHost bundles the Core's shared services into the single object each
// MiniGame receives. It must expose every always-on service by reference and
// include the optional `world` (diver-world engine) ONLY when it is provided.
import { makeHost } from '../../src/core/host.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// Distinct stub objects so identity checks prove pass-through (no copying/wrapping).
const stubs = {
  audio: { _k: 'audio' },
  input: { _k: 'input' },
  particles: { _k: 'particles' },
  viewport: { _k: 'viewport' },
  rng: () => 0.42,
  economy: { _k: 'economy' },
  progression: { _k: 'progression' },
  achievements: { _k: 'achievements' },
};

// --- 1. always-on services are exposed by reference ---
{
  const host = makeHost(stubs);
  check('audio passed through', host.audio === stubs.audio);
  check('input passed through', host.input === stubs.input);
  check('particles passed through', host.particles === stubs.particles);
  check('viewport passed through', host.viewport === stubs.viewport);
  check('rng passed through', host.rng === stubs.rng);
  check('economy passed through', host.economy === stubs.economy);
  check('progression passed through', host.progression === stubs.progression);
  check('achievements passed through', host.achievements === stubs.achievements);
}

// --- 2. world is present only when passed ---
{
  const host = makeHost(stubs);
  check('world absent when not provided', host.world === undefined);

  const world = { _k: 'world' };
  const host2 = makeHost({ ...stubs, world });
  check('world present when provided', host2.world === world);
}

console.log(`host: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
