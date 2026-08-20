// Tests for the deep-dive abyss (mini-sub Phase 1): the on-foot 150% air-drain
// multiplier applies only in the abyss zone, and a smoke test that
// _generateAbyss() produces a usable zone (exit portal + treasure, including
// extra Black Pearls). Run: node tests/game/abyss-air.test.mjs

// Cave's constructor touches the DOM canvas (offscreen rock layer + minimap
// buffer) for rendering, which world-gen doesn't otherwise need. No test in
// this suite exercises world-gen for that reason; stub just enough of
// `document` here so _generateAbyss (which builds a real Cave) can run under
// plain Node, without touching product code.
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

import { Game, oxygenMultiplier } from '../../src/game.js';
import { GAME, ABYSS } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Pure air-multiplier: abyss adds ABYSS.airMult on top of the reef's own
// depth penalty; every other zone is unaffected. ---
{
  const reef1Reef = oxygenMultiplier(1, 'reef');
  const reef1Abyss = oxygenMultiplier(1, 'abyss');
  check('reef 1, reef zone: no depth penalty yet (mult = 1)', Math.abs(reef1Reef - 1) < 1e-9);
  check('reef 1, abyss zone: exactly ABYSS.airMult on top', Math.abs(reef1Abyss - ABYSS.airMult) < 1e-9);

  const reef5Reef = oxygenMultiplier(5, 'reef');
  const reef5Abyss = oxygenMultiplier(5, 'abyss');
  const expectedReef5 = 1 + GAME.oxygenPenaltyPerReef * Math.min(4, GAME.oxygenPenaltyCap);
  check('deeper reefs still apply the normal depth penalty', Math.abs(reef5Reef - expectedReef5) < 1e-9);
  check('abyss multiplies the reef depth penalty, not replaces it', Math.abs(reef5Abyss - expectedReef5 * ABYSS.airMult) < 1e-9);

  check('temple/belly/stage zones are unaffected by ABYSS.airMult', oxygenMultiplier(3, 'temple') === oxygenMultiplier(3, 'reef') &&
    oxygenMultiplier(3, 'belly') === oxygenMultiplier(3, 'reef') && oxygenMultiplier(3, 'stage') === oxygenMultiplier(3, 'reef'));
}

// --- Smoke test: _generateAbyss() builds a usable zone off a stub Game. ---
{
  const s = {
    reef: 1, zone: 'abyss', cave: null,
    // _generateAbyss calls a few other Game.prototype methods on `this`
    // (currents, powerups, portal clearance) — bind the real ones so this
    // drives the actual generation logic, not a reimplementation of it.
    _makeCurrents: Game.prototype._makeCurrents,
    _makePowerups: Game.prototype._makePowerups,
    _clearCreaturesNearPortals: Game.prototype._clearCreaturesNearPortals,
  };
  Game.prototype._generateAbyss.call(s);
  check('an abyss exit portal is placed', !!s.abyssExit && typeof s.abyssExit.x === 'number' && typeof s.abyssExit.y === 'number');
  check('the abyss seeds treasure', Array.isArray(s.treasures) && s.treasures.length > 0);
  const pearlCount = s.treasures.filter((t) => t.kind === 'blackpearl').length;
  check('the abyss seeds 2-3 extra Black Pearls (denser than a normal reef)', pearlCount >= 2 && pearlCount <= 3);
  check('the abyss seeds chests on the cave floor', Array.isArray(s.shells) && s.shells.length > 0);
  check('reef-only fields are cleared while in the abyss', s.templeGate === null && s.abyssEntrance === null && s.door === null && s.key === null);
}

console.log(`abyss-air: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
