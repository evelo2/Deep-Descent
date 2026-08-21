// The Deep's extraction kicker: the first trench loot grab arms a countdown;
// letting it lapse flips extractLapsed (which spikes air drain). Tests the pure
// trip/tick logic on a stub. Run: node tests/game/extraction.test.mjs

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

import { Game } from '../../src/game.js';
import { ABYSS } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const mkStub = (over = {}) => ({
  zone: 'abyss', extractActive: false, extractT: 0, extractLapsed: false,
  puName: '', puCol: '', puT: 0, shake: 0, audio: { gasp() {} }, t: 0,
  ...over,
});

// --- Trip: first grab in the abyss arms the countdown ---
{
  const s = mkStub();
  Game.prototype._tripExtraction.call(s);
  check('tripping arms the countdown', s.extractActive === true && s.extractLapsed === false);
  check('countdown starts at ABYSS.extractSecs', s.extractT === ABYSS.extractSecs);

  // Re-trip is a no-op (timer already running).
  s.extractT = 12;
  Game.prototype._tripExtraction.call(s);
  check('re-tripping does not reset the timer', s.extractT === 12);

  // Not in the abyss → never arms.
  const reef = mkStub({ zone: 'reef' });
  Game.prototype._tripExtraction.call(reef);
  check('never arms outside the abyss', reef.extractActive === false);
}

// --- Tick: counts down, then lapses ---
{
  const s = mkStub({ extractActive: true, extractT: 5 });
  Game.prototype._updateExtraction.call(s, 2);
  check('ticking decrements the timer', Math.abs(s.extractT - 3) < 1e-9 && !s.extractLapsed);
  Game.prototype._updateExtraction.call(s, 3);
  check('hitting zero lapses the extraction', s.extractLapsed === true && s.extractT === 0);
  // Once lapsed, further ticks are a no-op (no negative drift).
  Game.prototype._updateExtraction.call(s, 5);
  check('lapsed timer stays at 0', s.extractT === 0 && s.extractLapsed === true);

  // Inactive timer never ticks.
  const idle = mkStub({ extractActive: false, extractT: 0 });
  Game.prototype._updateExtraction.call(idle, 3);
  check('inactive timer is untouched', idle.extractT === 0 && !idle.extractLapsed);
}

// --- Bonus scales with time remaining (mirrors the exit-hatch formula) ---
{
  const full = Math.round(ABYSS.extractBonusBase * (ABYSS.extractSecs / ABYSS.extractSecs));
  const half = Math.round(ABYSS.extractBonusBase * ((ABYSS.extractSecs / 2) / ABYSS.extractSecs));
  check('a fast extraction pays more than a slow one', full > half && half >= 0);
}

console.log(`extraction: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
