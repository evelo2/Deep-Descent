// The game-side Steam shim must be a pure no-op on the web (no window.steam) and
// must never throw, while correctly delegating under the desktop bridge.
// Run: node tests/desktop/steam-shim.test.mjs

import { unlockAchievement, steamAvailable } from '../../src/platform/steam.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Web build: no window at all (Node) ---
delete globalThis.window;
check('no window → steamAvailable is false', steamAvailable() === false);
check('no window → unlock returns false', unlockAchievement('firstblood') === false);
let threw = false;
try { unlockAchievement('firstblood'); } catch { threw = true; }
check('no window → unlock never throws', threw === false);

// --- Browser with a page but no Steam bridge ---
globalThis.window = {};
check('window but no steam → available false', steamAvailable() === false);
check('window but no steam → unlock false', unlockAchievement('firstblood') === false);

// --- Desktop bridge present and Steam running ---
const unlocked = [];
globalThis.window = { steam: { unlock: (id) => unlocked.push(id), isRunning: () => true } };
check('live bridge → steamAvailable true', steamAvailable() === true);
check('live bridge → unlock returns true', unlockAchievement('krakenslayer') === true);
check('live bridge → id was delegated', unlocked.length === 1 && unlocked[0] === 'krakenslayer');

// --- Bad ids are rejected without touching the bridge ---
unlocked.length = 0;
check('empty id → false', unlockAchievement('') === false);
check('null id → false', unlockAchievement(null) === false);
check('bad id never reached the bridge', unlocked.length === 0);

// --- Bridge present but Steam not running ---
globalThis.window = { steam: { unlock: () => {}, isRunning: () => false } };
check('bridge, Steam off → available false', steamAvailable() === false);

// --- A throwing bridge must be swallowed ---
globalThis.window = { steam: { unlock: () => { throw new Error('boom'); }, isRunning: () => { throw new Error('boom'); } } };
check('throwing isRunning → available false, no throw', steamAvailable() === false);
let threw2 = false;
try { check('throwing unlock → returns false', unlockAchievement('pacifist') === false); }
catch { threw2 = true; }
check('throwing unlock never propagates', threw2 === false);

delete globalThis.window;
console.log(`steam-shim: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
