// Tests for the "Tightening Pass v1" balance changes: the gold/goal/air knobs,
// the escalating+capped extra-life thresholds, and the on-hit loot penalty.
// Run: node tests/game/economy.test.mjs

import { Game } from '../../src/game.js';
import { GAME, GOLD, RELIC, BELL } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Config knobs moved in the intended direction. ---------------------------
check('gold rate tightened to 0.2', Math.abs(GOLD.rate - 0.2) < 1e-9);
check('reef goal raised (12000 base / 2500 per reef)', RELIC.goalBase === 12000 && RELIC.goalPerReef === 2500);
check('dive bells scarcer (1 per reef)', BELL.count === 1);
check('air penalty steeper (0.15/reef)', Math.abs(GAME.oxygenPenaltyPerReef - 0.15) < 1e-9);
check('lives are capped', GAME.maxLives === 5);
check('first extra life costs more (8000) and escalates (+6000)', GAME.firstLifeScore === 8000 && GAME.lifeScoreStep === 6000);
check('a hit spills carried loot', GAME.hitLootPenalty > 0 && GAME.hitLootPenalty <= 0.5);

// --- Extra-life thresholds: escalate and cap (models update()'s award loop). ---
function livesAfter(score, startLives) {
  let lives = startLives, next = GAME.firstLifeScore;
  while (lives < GAME.maxLives && score >= next) { lives += 1; next += GAME.lifeScoreStep; }
  return lives;
}
check('no bonus life below the first threshold', livesAfter(7999, 3) === 3);
check('first bonus life at 8000', livesAfter(8000, 3) === 4);
check('second bonus life at 14000 (8000+6000)', livesAfter(14000, 3) === 5);
check('lives cap at maxLives — no snowball', livesAfter(1_000_000, 3) === GAME.maxLives);
check('cap holds even from a high start', livesAfter(1_000_000, 5) === 5);

// --- On-hit loot penalty: driving the real Game.prototype._hit(). -------------
function hitStub(carried, lives) {
  return {
    carried, lives, air: 100, state: 'playing', deathCause: null,
    flash: 0, shake: 0, puName: '', puCol: '', puT: 0,
    diver: { hit() {}, invuln: 0, y: 500 },
    audio: { hit() {}, bank() {}, gasp() {} },
    _loseLife: Game.prototype._loseLife,
    _gameOver: Game.prototype._gameOver,
  };
}
{
  const s = hitStub(1000, 3);
  Game.prototype._hit.call(s);
  check('a hit drops ~30% of carried loot', s.carried === 700);
  check('a hit still costs a life', s.lives === 2);
  check('the loss is surfaced to the player', s.puName.includes('LOOT'));
}
{
  const s = hitStub(0, 3);
  Game.prototype._hit.call(s);
  check('no penalty text when carrying nothing', s.carried === 0 && !s.puName.includes('LOOT'));
}

console.log(`economy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
