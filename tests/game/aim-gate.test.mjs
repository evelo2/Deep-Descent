// Regression test: auto-aim (the hold-to-lock-onto-nearest-threat assist) is a
// PAID perk gated behind the Targeting upgrade. It must NOT engage at aimLevel 0
// (manual fire only), and must engage from aimLevel >= AIM.unlockLevel. Drives
// the real Reef.prototype._acquireAimTarget() (the gate) + _nearestThreat().
// Run: node tests/game/aim-gate.test.mjs

import { Reef } from '../../src/minigames/reef/index.js';
import { AIM } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const acquire = Reef.prototype._acquireAimTarget;
const nearest = Reef.prototype._nearestThreat;

// A threat 100px from the diver — well within AIM.range (720).
const mob = (x, y) => ({ x, y, dead: false, snareT: 0 });
function stub(aimLevel, creatures) {
  return {
    aimLevel,
    diver: { x: 0, y: 0 },
    creatures,
    krakens: [],
    _acquireAimTarget: acquire,
    _nearestThreat: nearest,
  };
}

const near = mob(100, 0);

// --- Gate closed at level 0: engaged hold does NOT lock a target. ------------
{
  const s = stub(0, [near]);
  check('Lv0 + engaged: no auto-lock (gated) even with a threat in range', s._acquireAimTarget(true) === null);
  check('Lv0 + not engaged: no target', s._acquireAimTarget(false) === null);
}

// --- Gate opens at the unlock level: engaged hold locks the nearest threat. --
{
  const s = stub(AIM.unlockLevel, [near]);
  check('Lv1 (unlock) + engaged: acquires the nearest threat', s._acquireAimTarget(true) === near);
  check('Lv1 + not engaged: still no target (must be holding)', s._acquireAimTarget(false) === null);
}

// --- Higher levels keep auto-aim; nearest of several is chosen. --------------
{
  const far = mob(300, 0), close = mob(50, 0);
  const s = stub(AIM.maxLevel, [far, close]);
  check('Lv max + engaged: locks the CLOSEST threat', s._acquireAimTarget(true) === close);
}

// --- Dead / snared threats are ignored even when unlocked. -------------------
{
  const dead = mob(30, 0); dead.dead = true;
  const snared = mob(40, 0); snared.snareT = 1;
  const live = mob(120, 0);
  const s = stub(AIM.unlockLevel, [dead, snared, live]);
  check('Lv1 + engaged: skips dead/snared, locks the live one', s._acquireAimTarget(true) === live);
}

// --- Sanity: the unlock level is a positive gate (auto-aim isn't free). ------
check('AIM.unlockLevel gates above 0 (auto-aim is paid)', AIM.unlockLevel >= 1);

console.log(`aim-gate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
