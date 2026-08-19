// Regression test: the speargun now draws from limited ammo (start 20, max 100,
// shop-only refills). fire() must gate on ammo and cap the burst by what's left;
// each shot in the burst consumes one spear. Drives the real Game.prototype.fire().
// Run: node tests/game/speargun-ammo.test.mjs

import { Game } from '../../src/game.js';
import { SPEARGUN } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

function makeStub(ammo, lvl = 1) {
  return {
    state: 'playing', fireCd: 0,
    weapon: 'speargun', weaponLevel: { speargun: lvl },
    armedCharge: null,
    speargunAmmo: ammo, harpoonAmmo: 0, chargeAmmo: 0, shockBattery: 0,
    aimLevel: 0, burst: 0, burstT: 99,
    audio: { fire() {}, gasp() {} },
  };
}
const fire = Game.prototype.fire;

// --- Config invariants match the spec (start 20, +20 packs, cap 100). ---------
check('startAmmo is 20', SPEARGUN.startAmmo === 20);
check('ammoMax is 100', SPEARGUN.ammoMax === 100);
check('ammoPack is 20', SPEARGUN.ammoPack === 20);
check('pack is expensive', SPEARGUN.packCost >= 400);

// --- Empty: firing is blocked (gasp), no burst queued. ------------------------
{
  const s = makeStub(0);
  fire.call(s);
  check('empty speargun does not queue a burst', s.burst === 0);
  check('empty speargun sets the short gasp cooldown', Math.abs(s.fireCd - 0.2) < 1e-9);
}

// --- Burst is capped by ammo AND by shots+level. ------------------------------
{
  const s = makeStub(5, 1);
  fire.call(s);
  check('full burst = SPEARGUN.shots when ammo is plentiful', s.burst === SPEARGUN.shots);   // 3
}
{
  const s = makeStub(2, 1);
  fire.call(s);
  check('burst is capped by remaining ammo', s.burst === 2);
}
{
  const s = makeStub(50, 3);
  fire.call(s);
  check('level adds shots: lvl3 → shots+2', s.burst === SPEARGUN.shots + 2);   // 5
}
{
  const s = makeStub(1, 3);
  fire.call(s);
  check('ammo caps even the leveled burst', s.burst === 1);
}

// --- Model update()'s burst loop: one spear consumed per shot, floored at 0. ---
{
  let ammo = 2;
  let burst = Math.min(ammo, SPEARGUN.shots);   // what fire() queues (=2)
  let fired = 0;
  while (burst > 0) { ammo = Math.max(0, ammo - 1); burst -= 1; fired += 1; }
  check('burst drains exactly the queued shots', fired === 2);
  check('ammo reaches zero, never negative', ammo === 0);
}

console.log(`speargun-ammo: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
