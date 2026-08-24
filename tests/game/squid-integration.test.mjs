// Regression test: the Giant Squid mini-boss (has takeDamage/hp, unlike every
// other creature which just dies in one hit) must be CHIPPED, not insta-killed,
// at all three weapon-hit sites in game.js — harpoon/spear (_collisions),
// depth-charge blast (_explode), and the shock rod (_fireShock). It should die
// (and award its 900 points) only on the hp-th (4th) hit at each site, and an
// ORDINARY creature at each site must keep its existing one-hit-kill (or, for
// the shock rod, its existing 2-cumulative-hit-kill) behavior unchanged.
//
// Drives the real Reef.prototype._collisions() / _explode() / _fireShock()
// against minimal stub `this` objects, mirroring the patterns in
// tests/game/shock-kill.test.mjs and tests/game/charge-detonate.test.mjs.
// Run: node tests/game/squid-integration.test.mjs

import { Reef } from '../../src/minigames/reef/index.js';
import { GiantSquid } from '../../src/entities/creatures.js';
import { CREATURES, SHOCK } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const collisions = Reef.prototype._collisions;
const explode = Reef.prototype._explode;
const fireShock = Reef.prototype._fireShock;
const damageCreature = Reef.prototype._damageCreature;

const mob = (x, y) => ({ x, y, dead: false, snareT: 0, points: 50, radius: 14, vx: 0, vy: 0 });

// Minimal stub covering every field _collisions() touches (treasures/shells/
// bigBubbles empty so those branches no-op; diver kept far away so contact
// damage/_hit() never fires — this test is only about the weapon-hit sites).
function makeCollisionStub(creature) {
  return {
    score: 0,
    creatures: [creature],
    krakens: [],
    treasures: [], shells: [], bigBubbles: [], nets: [],
    harpoons: [{ dead: false, hits: (cr) => cr === creature }],
    diver: { x: 9999, y: 9999, radius: 15, invuln: 0 },
    hasKey: false, carried: 0,
    particles: { sparkle() {} },
    audio: { gem() {}, pickup() {}, pearl() {}, refill() {}, kill() {}, hit() {} },
    _hit() {},
    _damageCreature: damageCreature,
  };
}

function makeExplodeStub(creature) {
  return {
    score: 0,
    creatures: [creature],
    krakens: [],
    armedCharge: null, shake: 0, flash: 0, explosions: [],
    air: 100, airMax: 100,
    diver: { x: 9999, y: 9999, radius: 15, hurtT: 0 },
    particles: { sparkle() {} },
    audio: { kill() {} },
    _damageCreature: damageCreature,
  };
}

function makeShockStub(creature) {
  return {
    shockBattery: 100, score: 0,
    diver: { x: 0, y: 0 },
    creatures: [creature],
    krakens: [],
    shockBolts: [], shockT: 0,
    particles: { sparkle() {} },
    audio: { fire() {}, kill() {}, hit() {} },
  };
}

// --- 1. Harpoon/spear vs squid, via the real _collisions(). ------------------
{
  const squid = new GiantSquid(0, 0);
  const hp = CREATURES.squid.hp;
  const s = makeCollisionStub(squid);

  for (let i = 1; i < hp; i++) {
    s.harpoons = [{ dead: false, hits: (cr) => cr === squid }];
    collisions.call(s);
    check(`harpoon hit ${i}/${hp} chips, does not kill`, !squid.dead && squid.hp === hp - i);
    check(`harpoon hit ${i}/${hp} consumes the harpoon`, s.harpoons[0].dead === true);
    check(`harpoon hit ${i}/${hp} awards no score yet`, s.score === 0);
  }
  s.harpoons = [{ dead: false, hits: (cr) => cr === squid }];
  collisions.call(s);
  check(`harpoon hit ${hp}/${hp} kills the squid`, squid.dead === true);
  check('killing hit awards the squid\'s points (900)', s.score === squid.points && squid.points === 900);
}

// --- 2. Charge blast vs squid, via the real _explode() — chipped 1/blast. ----
{
  const squid = new GiantSquid(0, 0);
  const hp = CREATURES.squid.hp;
  const s = makeExplodeStub(squid);
  const ch = { x: 0, y: 0, size: 10, blast: 100 };

  for (let i = 1; i < hp; i++) {
    explode.call(s, ch);
    check(`blast ${i}/${hp} chips, does not kill`, !squid.dead && squid.hp === hp - i);
    check(`blast ${i}/${hp} awards no score yet`, s.score === 0);
  }
  explode.call(s, ch);
  check(`blast ${hp}/${hp} kills the squid`, squid.dead === true);
  check('killing blast awards the squid\'s points', s.score === squid.points);
}

// --- 2b. Charge blast vs an ORDINARY creature — still a one-blast kill. ------
{
  const c = mob(0, 0);
  const s = makeExplodeStub(c);
  const ch = { x: 0, y: 0, size: 10, blast: 100 };
  explode.call(s, ch);
  check('ordinary creature dies in one blast', c.dead === true);
  check('ordinary creature awards its points in one blast', s.score === c.points);
}

// --- 3. Shock rod vs squid — chipped 1 hp/zap, never stun-locked, dies on the
// hp-th zap. This is the key regression guard: the squid must NOT be
// insta-killed by SHOCK.hitsToKill (2) the way an ordinary creature is. -------
{
  const squid = new GiantSquid(100, 0);   // within SHOCK.primaryRange (320)
  const hp = CREATURES.squid.hp;
  const s = makeShockStub(squid);

  for (let i = 1; i < hp; i++) {
    fireShock.call(s, 1);
    check(`shock zap ${i}/${hp} chips, does not kill`, !squid.dead && squid.hp === hp - i);
    check(`shock zap ${i}/${hp} does not stun (no shockHits/snareT insta-kill path)`, squid.snareT === 0);
    check(`shock zap ${i}/${hp} awards no score yet`, s.score === 0);
  }
  fireShock.call(s, 1);
  check(`shock zap ${hp}/${hp} kills the squid`, squid.dead === true);
  check('killing zap awards the squid\'s points', s.score === squid.points);
}

// --- 3b. Shock rod vs an ORDINARY creature — existing 2-hit-kill unchanged. --
{
  const c = mob(100, 0);
  const s = makeShockStub(c);

  fireShock.call(s, 1);
  check('ordinary creature: 1st zap stuns, does not kill', c.dead === false && c.snareT >= SHOCK.stun - 1e-9);
  check('ordinary creature: 1st zap awards no score', s.score === 0);

  c.snareT = 0;   // clear stun so it can be retargeted, as in shock-kill.test.mjs
  fireShock.call(s, 1);
  check('ordinary creature: 2nd (cumulative) zap kills', c.dead === true);
  check('ordinary creature: kill awards its points', s.score === c.points);
}

console.log(`squid-integration: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
