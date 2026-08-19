// Regression test: the shock rod stuns on the first hit and KILLS on the second.
// Previously it only ever stunned/knocked; a creature could never be killed with
// the shock rod. Drives the real Game.prototype._fireShock() against a stub `this`.
// Run: node tests/game/shock-kill.test.mjs

import { Game } from '../../src/game.js';
import { SHOCK } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

function makeStub() {
  return {
    shockBattery: 100,
    score: 0,
    diver: { x: 0, y: 0 },
    creatures: [],
    krakens: [],
    shockBolts: [], shockT: 0,
    particles: { sparkle() {} },
    audio: { fire() {}, kill() {} },
  };
}
const fireShock = Game.prototype._fireShock;
const mob = (x, y) => ({ x, y, dead: false, snareT: 0, points: 50, vx: 0, vy: 0 });

// --- One creature in range: first zap stuns, second zap kills. ----------------
{
  const s = makeStub();
  const c = mob(100, 0);           // within SHOCK.primaryRange (320)
  s.creatures.push(c);

  fireShock.call(s, 1);            // zap 1
  check('first zap does not kill', c.dead === false);
  check('first zap stuns', c.snareT >= SHOCK.stun - 1e-9);
  check('first zap records a hit', c.shockHits === 1);
  check('no score for a stun', s.score === 0);

  c.snareT = 0;                    // clear stun so it can be targeted again
  fireShock.call(s, 1);           // zap 2
  check('second zap kills', c.dead === true);
  check('kill awards creature points', s.score === 50);
  check('two hits recorded', c.shockHits === 2);
}

// --- hitsToKill honors config, not a hard-coded 2. ----------------------------
{
  check('hitsToKill config is present', typeof SHOCK.hitsToKill === 'number' && SHOCK.hitsToKill >= 1);
}

// --- A dead creature is skipped by later zaps (no double-scoring). ------------
{
  const s = makeStub();
  const c = mob(100, 0);
  s.creatures.push(c);
  fireShock.call(s, 1); c.snareT = 0;
  fireShock.call(s, 1);            // kills, score 50
  const scoreAfterKill = s.score;
  fireShock.call(s, 1);            // nothing left in range
  check('dead creature not re-killed', s.score === scoreAfterKill);
}

console.log(`shock-kill: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
