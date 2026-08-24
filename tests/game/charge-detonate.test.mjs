// Regression test for the depth-charge "second click never detonates" bug.
//
// The bug: throwing a charge sets fireCd = charge.cd (~1.15s), and fire() used to
// bail whenever fireCd > 0 — so the player's second click (well inside 1.15s) was
// swallowed and the charge only ever blew on its safety fuse. The fix routes
// detonation ahead of the cooldown guard, gated by `_chargeLock` so a *held* fire
// control can't throw-then-instantly-detonate at the diver's feet.
//
// We exercise the real Reef.prototype.fire() against a minimal stub `this`, and
// model the per-frame lock-clear that game.update() performs (drop the lock when
// the fire control is not held). Run: node tests/game/charge-detonate.test.mjs

import { Reef } from '../../src/minigames/reef/index.js';

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`  FAIL: ${name}`); }
}

// A fresh charge-armed diver stub with just the fields fire()/_fireCharge touch.
function makeStub() {
  return {
    _shell: { state: 'playing' },   // fire() reads this._shell.state (post-P6)
    fireCd: 0,
    weapon: 'charge',
    weaponLevel: { charge: 1 },
    armedCharge: null,
    _chargeLock: false,
    chargeAmmo: 5,
    harpoonAmmo: 0,
    shockBattery: 0,
    aimLevel: 0,
    charges: [],
    diver: { x: 100, y: 100, aimX: 1, aimY: 0 },
    audio: { fire() {}, gasp() {} },
    // fire() delegates the throw to _fireCharge — bind the real one.
    _fireCharge: Reef.prototype._fireCharge,
  };
}
const fire = Reef.prototype.fire;
// Model the frame-loop lock release: the lock drops whenever fire isn't held.
const releaseFire = (s) => { s._chargeLock = false; };

// --- Scenario 1: the reported bug — throw, then detonate on the next discrete
// trigger while the throw cooldown is still counting down. ---------------------
{
  const s = makeStub();
  fire.call(s);                                   // click 1: throw
  check('throw spawns a charge', s.charges.length === 1);
  check('throw arms the charge', s.armedCharge === s.charges[0]);
  check('throw consumes ammo', s.chargeAmmo === 4);
  check('throw sets a cooldown', s.fireCd > 1);   // charge.cd = 1.15
  check('throw sets the detonate lock', s._chargeLock === true);

  // Player releases the button, then clicks again ~0.3s later — still inside the
  // 1.15s throw cooldown, which is exactly what used to swallow the click.
  releaseFire(s);                                 // button up between clicks
  fire.call(s);                                   // click 2: detonate
  check('2nd click detonates despite fireCd > 0', s.charges[0].exploded === true);
  check('detonation clears the armed charge', s.armedCharge === null);
}

// --- Scenario 2: a continuous HOLD must NOT auto-detonate. fire() is polled every
// frame while held; without the lock the frame after the throw would detonate at
// the diver's feet. Here we never release, so the lock stays set. ---------------
{
  const s = makeStub();
  fire.call(s);                                   // throw (lock set)
  fire.call(s);                                   // same hold, next poll
  fire.call(s);                                   // ...and again
  check('held fire does not auto-detonate', s.charges[0].exploded === false);
  check('held fire keeps the charge armed', s.armedCharge === s.charges[0]);
}

// --- Scenario 3: after detonating, a fresh throw is still gated by the throw
// cooldown (detonation must not have reset or bypassed it into free throws). ----
{
  const s = makeStub();
  fire.call(s);                                   // throw, fireCd ~1.15
  releaseFire(s); fire.call(s);                   // detonate
  const ammoAfterDet = s.chargeAmmo;              // 4
  releaseFire(s); fire.call(s);                   // try to throw again immediately
  check('cannot throw again while cooldown active', s.chargeAmmo === ammoAfterDet);
  check('no extra charge thrown during cooldown', s.charges.length === 1);
}

console.log(`charge-detonate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
