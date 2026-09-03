// "A Moray Eel got you" — the death screen names what killed you. Creatures
// carry no intrinsic type id (the class IS the type), so spawnCreature tags
// every instance with its fauna `kind`; _hit(killer) remembers the blow's
// source and _loseLife promotes it to `killedBy` only when the run actually
// ends AND the cause is a creature. Drowning and crushing have no attributable
// killer and must stay null. Run: node tests/game/killed-by.test.mjs

// Importing the reef touches the DOM (Cave's constructor builds canvases), so
// stub it before the import — same shape the other reef-side tests use.
globalThis.document = {
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

import { Reef } from '../../src/minigames/reef/index.js';
import { spawnCreature, faunaInfo, FAUNA_INFO } from '../../src/entities/spawn.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// ---- spawnCreature tags every instance ------------------------------------
{
  const moray = spawnCreature({ k: 'moray' }, 100, 200, 1);
  check('a spawned creature carries its kind', moray.kind === 'moray');
  check('the kind resolves to a display name', faunaInfo(moray.kind).name === 'Moray Eel');

  const shoal = spawnCreature({ k: 'piranha' }, 100, 200, 1);
  check('a shoal spawns as an array', Array.isArray(shoal) && shoal.length > 1);
  check('every shoal member is tagged, so any one can be credited',
    shoal.every((u) => u.kind === 'piranha'));

  // Every kind the spawn table can produce must survive the round trip, or a
  // death screen falls back to generic wording for that creature alone.
  const kinds = Object.keys(FAUNA_INFO);
  const spawnable = kinds.filter((k) => spawnCreature({ k }, 0, 0, 1));
  check('every FAUNA_INFO kind is spawnable', spawnable.length === kinds.length);
  check('every spawned kind round-trips to a name', spawnable.every((k) => {
    const c = spawnCreature({ k }, 0, 0, 1);
    const one = Array.isArray(c) ? c[0] : c;
    return one.kind === k && !!faunaInfo(one.kind);
  }));
  check('no display name is blank', kinds.every((k) => faunaInfo(k).name.length > 0));
}

// ---- _hit / _loseLife attribution -----------------------------------------
// Driven against the real prototype methods with a plain stub, the same way
// tests/game/bank-station.test.mjs exercises _bankLoot.
const stub = (over = {}) => ({
  lives: 1, deathCause: null, killedBy: null, _lastKiller: null,
  _platingReady: false, inSub: false, subArmor: 0, diver: { invuln: 0, x: 0, y: 0 },
  carried: 0, carriedPearls: 0, tookDamage: false, hitFlash: 0, shake: 0,
  particles: { burst() {}, sparkle() {} }, audio: { hit() {}, gasp() {}, select() {} },
  puName: '', puCol: '', puT: 0, _shell: { state: 'playing' }, invulnAfterHit: 0,
  ...over,
});

{
  // A killing blow from a named creature.
  const g = stub({ lives: 1 });
  g._gameOver = () => { g._shell.state = 'gameover'; };
  Reef.prototype._loseLife.call(Object.assign(g, { _lastKiller: 'Moray Eel' }), 'killed');
  check('a fatal creature kill records the killer', g.killedBy === 'Moray Eel');
  check('and sets the killed cause', g.deathCause === 'killed');
}
{
  // Drowning has no killer, even if a creature hit earlier in the run.
  const g = stub({ lives: 1, _lastKiller: 'Shark' });
  g._gameOver = () => {};
  Reef.prototype._loseLife.call(g, 'air');
  check('drowning records no killer', g.killedBy === null);
  check('drowning keeps its own cause', g.deathCause === 'air');
}
{
  // Being crushed has no killer either.
  const g = stub({ lives: 1, _lastKiller: 'Kraken' });
  g._gameOver = () => {};
  Reef.prototype._loseLife.call(g, 'crushed');
  check('being crushed records no killer', g.killedBy === null);
  check('crushing keeps its own cause', g.deathCause === 'crushed');
}
{
  // A non-fatal hit must not record anything — you only die once.
  const g = stub({ lives: 3, _lastKiller: 'Barracuda' });
  g._gameOver = () => { throw new Error('should not end the run'); };
  Reef.prototype._loseLife.call(g, 'killed');
  check('surviving a hit costs a life', g.lives === 2);
  check('surviving a hit records no killer yet', g.killedBy === null);
}
{
  // An unattributed kill falls back to generic wording rather than guessing.
  const g = stub({ lives: 1, _lastKiller: null });
  g._gameOver = () => {};
  Reef.prototype._loseLife.call(g, 'killed');
  check('an unattributed kill leaves killedBy null for the generic wording',
    g.killedBy === null && g.deathCause === 'killed');
}

console.log(`ok killed-by.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
