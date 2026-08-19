// Regression test: a piranha SHOAL shares one HP pool and dies as a GROUP — a
// single weapon hit on any member clears the whole swarm (with the default
// shoalHp of 1), removing the old "kill 6-9 fish one slow shot at a time" slog.
// The clearing hit awards the WHOLE shoal's combined points (so the mercy
// mechanic isn't also a stealth score nerf). The shared HP is a scalable knob:
// with shoalHp > 1 it takes that many hits ANYWHERE on the shoal to clear it.
//
// Drives the real Game.prototype._collisions() / _explode() / _fireShock()
// against minimal stubs, mirroring tests/game/squid-integration.test.mjs.
// Run: node tests/game/shoal-death.test.mjs

import { Game } from '../../src/game.js';
import { Piranha } from '../../src/entities/creatures.js';
import { spawnCreature } from '../../src/entities/spawn.js';
import { CREATURES, KILL_POINTS } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const collisions = Game.prototype._collisions;
const explode = Game.prototype._explode;
const fireShock = Game.prototype._fireShock;
const damageCreature = Game.prototype._damageCreature;

const PVAL = KILL_POINTS.Piranha ?? 100;

// Build a linked shoal of `n` piranhas with a shared HP pool, exactly as
// spawn.js links them. Units are clustered near (x0,0) so a single blast/zap
// reaches at least one member.
function makeShoal(n, hp = 1, x0 = 0) {
  const units = [];
  for (let i = 0; i < n; i++) units.push(new Piranha(x0 + i * 3, 0));
  const shoal = { hp, units };
  for (const u of units) u.shoal = shoal;
  return units;
}

function makeCollisionStub(creatures, target) {
  return {
    score: 0,
    creatures: creatures.slice(),
    krakens: [],
    treasures: [], shells: [], bigBubbles: [], nets: [],
    harpoons: [{ dead: false, hits: (cr) => cr === target }],
    diver: { x: 9999, y: 9999, radius: 15, invuln: 0 },
    hasKey: false, carried: 0,
    particles: { sparkle() {} },
    audio: { gem() {}, pickup() {}, pearl() {}, refill() {}, kill() {}, hit() {} },
    _hit() {},
    _damageCreature: damageCreature,
  };
}

function makeExplodeStub(creatures) {
  return {
    score: 0,
    creatures: creatures.slice(),
    krakens: [],
    armedCharge: null, shake: 0, flash: 0, explosions: [],
    air: 100, airMax: 100,
    diver: { x: 9999, y: 9999, radius: 15, hurtT: 0 },
    particles: { sparkle() {} },
    audio: { kill() {} },
    _damageCreature: damageCreature,
  };
}

function makeShockStub(creatures) {
  return {
    shockBattery: 100, score: 0,
    diver: { x: 0, y: 0 },
    creatures: creatures.slice(),
    krakens: [],
    shockBolts: [], shockT: 0,
    particles: { sparkle() {} },
    audio: { fire() {}, kill() {}, hit() {} },
  };
}

// --- 1. Harpoon vs a shoal (default shoalHp 1): one hit clears it all. --------
{
  const units = makeShoal(7, 1);
  const target = units[3];
  const s = makeCollisionStub(units, target);
  collisions.call(s);
  check('harpoon: one hit clears the entire shoal', units.every((u) => u.dead));
  check('harpoon: consumes the harpoon', s.harpoons[0].dead === true);
  check('harpoon: awards the full shoal points once', s.score === 7 * PVAL);
}

// --- 2. Depth-charge blast vs a shoal: one blast clears it, scored once. ------
{
  const units = makeShoal(6, 1);
  const s = makeExplodeStub(units);
  const ch = { x: 0, y: 0, size: 10, blast: 100 };
  explode.call(s, ch);
  check('blast: one blast clears the entire shoal', units.every((u) => u.dead));
  check('blast: awards full shoal points once (no per-fish double count)', s.score === 6 * PVAL);
}

// --- 3. Shock rod vs a shoal: one zap clears it. -----------------------------
{
  const units = makeShoal(5, 1, 60);   // within SHOCK.primaryRange (320) of diver (0,0)
  const s = makeShockStub(units);
  fireShock.call(s, 1);
  check('shock: one zap clears the entire shoal', units.every((u) => u.dead));
  check('shock: awards full shoal points once', s.score === 5 * PVAL);
}

// --- 4. Scalable HP: shoalHp = 3 takes 3 hits ANYWHERE to clear. --------------
{
  const units = makeShoal(4, 3);
  const target = units[0];
  const s = makeCollisionStub(units, target);

  s.harpoons = [{ dead: false, hits: (cr) => cr === target }];
  collisions.call(s);
  check('shoalHp=3: hit 1 chips, nothing dies', units.every((u) => !u.dead) && target.shoal.hp === 2);
  check('shoalHp=3: hit 1 awards no score', s.score === 0);

  s.harpoons = [{ dead: false, hits: (cr) => cr === target }];
  collisions.call(s);
  check('shoalHp=3: hit 2 chips, nothing dies', units.every((u) => !u.dead) && target.shoal.hp === 1);
  check('shoalHp=3: hit 2 awards no score', s.score === 0);

  s.harpoons = [{ dead: false, hits: (cr) => cr === target }];
  collisions.call(s);
  check('shoalHp=3: hit 3 clears the whole shoal', units.every((u) => u.dead));
  check('shoalHp=3: clearing hit awards full shoal points', s.score === 4 * PVAL);
}

// --- 5. A lone piranha with no shoal still dies in one hit (defensive). -------
{
  const lone = new Piranha(0, 0);   // no .shoal linkage
  const s = makeCollisionStub([lone], lone);
  collisions.call(s);
  check('lone piranha (no shoal) dies in one hit', lone.dead === true);
  check('lone piranha awards its own points', s.score === PVAL);
}

// --- 6. spawnCreature('piranha') links every unit into one shared shoal. ------
{
  let k = 0;
  const rng = () => { k = (k * 1103515245 + 12345) & 0x7fffffff; return k / 0x7fffffff; };
  const units = spawnCreature({ k: 'piranha' }, 100, 100, null, { rng });
  const [lo, hi] = CREATURES.piranha.count;
  check('spawn: returns a cluster array', Array.isArray(units) && units.length >= lo && units.length <= hi);
  check('spawn: every unit shares ONE shoal object', units.every((u) => u.shoal && u.shoal === units[0].shoal));
  check('spawn: shoal hp seeded from config shoalHp', units[0].shoal.hp === (CREATURES.piranha.shoalHp ?? 1));
  check('spawn: shoal.units references the members', units[0].shoal.units.length === units.length);
}

console.log(`shoal-death: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
