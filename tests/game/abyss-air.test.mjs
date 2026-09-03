// Tests for the deep-dive abyss (mini-sub Phase 1+2): the on-foot 150%
// air-drain multiplier applies only in the abyss zone and only without the
// mini-sub (the `inSub` arg negates it), and a smoke test that
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

import { Reef, oxygenMultiplier } from '../../src/minigames/reef/index.js';
import { ABYSS } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Pure air-multiplier: the reef number no longer touches air drain (depth
// is the sole difficulty axis now); only the abyss zone's ABYSS.airMult
// remains, and every other zone is unaffected. ---
{
  check('the reef number no longer touches air drain', oxygenMultiplier('reef') === 1);
  check('reef is not a parameter — a stray arg changes nothing',
    oxygenMultiplier('reef') === oxygenMultiplier('reef', false));
  check('the abyss still costs its 150% outside the sub',
    Math.abs(oxygenMultiplier('abyss') - ABYSS.airMult) < 1e-9);
  check('the sub still shelters you from the abyss cost', oxygenMultiplier('abyss', true) === 1);

  check('temple/belly/stage zones are unaffected by ABYSS.airMult', oxygenMultiplier('temple') === oxygenMultiplier('reef') &&
    oxygenMultiplier('belly') === oxygenMultiplier('reef') && oxygenMultiplier('stage') === oxygenMultiplier('reef'));
}

// --- Phase 2: the mini-sub's `inSub` arg negates the abyss penalty only in
// the abyss; every other zone ignores it (there's nothing to negate). ---
{
  check('abyss on foot (inSub=false, the default): still x1.5', Math.abs(oxygenMultiplier('abyss') - ABYSS.airMult) < 1e-9);
  check('abyss in the sub: same as the plain reef rate, no penalty', Math.abs(oxygenMultiplier('abyss', true) - oxygenMultiplier('reef')) < 1e-9);

  check('non-abyss zones ignore the inSub arg entirely', oxygenMultiplier('reef', true) === oxygenMultiplier('reef', false) &&
    oxygenMultiplier('temple', true) === oxygenMultiplier('temple', false) &&
    oxygenMultiplier('belly', true) === oxygenMultiplier('belly', false));
}

// --- Smoke test: _generateAbyss() builds a usable zone off a stub Game. ---
{
  const s = {
    reef: 1, zone: 'abyss', cave: null,
    // _generateAbyss calls a few other Reef.prototype methods on `this`
    // (currents, powerups, portal clearance) — bind the real ones so this
    // drives the actual generation logic, not a reimplementation of it.
    _makeCurrents: Reef.prototype._makeCurrents,
    _makePowerups: Reef.prototype._makePowerups,
    _orientShells: Reef.prototype._orientShells,
    _clearCreaturesNearPortals: Reef.prototype._clearCreaturesNearPortals,
  };
  Reef.prototype._generateAbyss.call(s);
  check('abyss exit hatches are placed', Array.isArray(s.abyssExits) && s.abyssExits.length > 0 && typeof s.abyssExits[0].x === 'number' && typeof s.abyssExits[0].bonus === 'number');
  check('the abyss seeds treasure', Array.isArray(s.treasures) && s.treasures.length > 0);
  const pearlCount = s.treasures.filter((t) => t.kind === 'blackpearl').length;
  check('the abyss seeds 2-3 extra Black Pearls (denser than a normal reef)', pearlCount >= 2 && pearlCount <= 3);
  check('the abyss seeds chests on the cave floor', Array.isArray(s.shells) && s.shells.length > 0);
  check('reef-only fields are cleared while in the abyss', s.templeGate === null && s.abyssEntrance === null && s.door === null && s.key === null);
}

console.log(`abyss-air: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
