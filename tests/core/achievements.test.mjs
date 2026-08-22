// Achievements service — the Core-owned bridge to Steam, promoted from the
// platform/steam.js seam. Run: node tests/core/achievements.test.mjs
// A THIN forwarder: unlock(id) → the injected unlock fn (defaults to
// platform/steam.js#unlockAchievement, a no-op on the web build). Injectable so
// tests can spy without a Steam runtime.
import { makeAchievements } from '../../src/core/achievements.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- 1. forwards unlock(id) to the injected fn ---
{
  const seen = [];
  const ach = makeAchievements({ unlock: (id) => seen.push(id) });
  ach.unlock('firstblood');
  ach.unlock('shark_1');
  check('forwards each id in order', JSON.stringify(seen) === JSON.stringify(['firstblood', 'shark_1']));
}

// --- 2. default wiring exists and does not throw (web no-op) ---
{
  let threw = false;
  try { makeAchievements().unlock('deepdiver'); } catch (e) { threw = true; }
  check('default unlock is callable and never throws on web', !threw);
}

console.log(`achievements: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
