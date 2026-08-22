// Whirlpool now grants WHIRL.lives hull hits before the sweep ends: each hit
// drops the struck rock, spends a life, starts i-frames, and only the last hit
// ends the run. Also covers the reef-intro toast queue. Stub-driven.
// Run: node tests/game/whirlpool-lives.test.mjs

globalThis.document = {
  createElement: () => {
    const ctx = {
      fillRect() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      translate() {}, scale() {}, rotate() {}, drawImage() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {}, quadraticCurveTo() {}, strokeRect() {}, roundRect() {},
    };
    return { width: 0, height: 0, getContext: () => ctx };
  },
};

import { Game } from '../../src/game.js';
import { WHIRL } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const mkStub = () => ({
  whirlObstacles: [{ x: 0, y: 0, r: 20 }, { x: 50, y: 0, r: 20 }, { x: 100, y: 0, r: 20 }, { x: 150, y: 0, r: 20 }],
  whirlLives: WHIRL.lives, whirlHitT: 0, shake: 0, flash: 0,
  puName: '', puCol: '', puT: 0, audio: { hit() {} },
});

// --- First WHIRL.lives-1 hits survive; the last ends the run ---
{
  const s = mkStub();
  let ended = false;
  for (let n = 0; n < WHIRL.lives - 1; n++) {
    const last = Game.prototype._whirlpoolHit.call(s, 0);
    if (last) ended = true;
  }
  check(`survives the first ${WHIRL.lives - 1} hits`, ended === false);
  check('lives decremented to 1', s.whirlLives === 1);
  check('i-frames set after a hit', s.whirlHitT === WHIRL.hitInvuln);
  check('each hit removed one obstacle', s.whirlObstacles.length === 4 - (WHIRL.lives - 1));
  check('a surviving hit flashes the HULL HIT toast', /HULL HIT/.test(s.puName));

  const fatal = Game.prototype._whirlpoolHit.call(s, 0);
  check('the final hit returns true (run ends)', fatal === true);
  check('lives now zero', s.whirlLives === 0);
}

// --- The struck obstacle is the one removed ---
{
  const s = mkStub();
  const target = s.whirlObstacles[2];
  Game.prototype._whirlpoolHit.call(s, 2);
  check('the hit obstacle is spliced out', !s.whirlObstacles.includes(target));
  check('other obstacles remain', s.whirlObstacles.length === 3);
}

// --- Toast queue drains one at a time ---
{
  const s = { toastQueue: [] };
  Game.prototype._enqueueToast.call(s, '🐟 NEW THREAT: Piranha', '#f00', 2.2);
  Game.prototype._enqueueToast.call(s, '⚓ RELIC: Anchor', '#0f0', 2.0);
  check('two toasts queued', s.toastQueue.length === 2);
  check('queued in order', s.toastQueue[0].name.includes('Piranha') && s.toastQueue[1].name.includes('RELIC'));
  check('toast carries its duration', s.toastQueue[0].dur === 2.2);
}

console.log(`whirlpool-lives: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
