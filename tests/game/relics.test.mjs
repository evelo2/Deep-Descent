// Regression test: the Salvage Log relic model (Phase 2). Data-driven relics
// applied at run start via `applyLoadout`. Pure logic — no DOM.
// Run: node tests/game/relics.test.mjs

import { RELICS, getRelic, applyLoadout } from '../../src/meta/relics.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- applyLoadout: lungs + fins set the expected flags, others left at defaults.
{
  const g = {};
  applyLoadout(g, ['lungs', 'fins']);
  check('lungs: +30 air bonus', g._relicAirBonus === 30);
  check('fins: 1.18 swim mult', g._relicSwimMult === 1.18);
  check('plating: false by default', g._relicPlating === false);
  check('bellrig: false by default', g._relicBellFull === false);
}

// --- applyLoadout resets flags each call (fresh {} here, but proves the reset
// happens unconditionally — a second call on the SAME object would also clear
// stale flags from a prior loadout).
{
  const g = {};
  applyLoadout(g, ['plating', 'bellrig']);
  check('plating: equipped', g._relicPlating === true);
  check('plating: platingReady starts true when equipped', g._platingReady === true);
  check('bellrig: equipped', g._relicBellFull === true);
  check('reset: air bonus stays 0 with no lungs', g._relicAirBonus === 0);
}

// --- unknown ids are ignored, not thrown.
{
  const g = {};
  let threw = false;
  try { applyLoadout(g, ['nope', 'lungs']); } catch (e) { threw = true; }
  check('unknown id: does not throw', !threw);
  check('unknown id: known ids in the same loadout still apply', g._relicAirBonus === 30);
  check('unknown id: nothing else got set', g._relicSwimMult === 1 && g._relicPlating === false && g._relicBellFull === false);
}

// --- Phase 5: the six new relics set their flags; empty loadout leaves them
// all false; mixing with the original four still works; unknown ids ignored.
{
  const g = {};
  applyLoadout(g, ['sonar', 'barbs', 'secondwind', 'eye', 'chart', 'magnet']);
  check('sonar: equipped', g._relicSonar === true);
  check('barbs: equipped', g._relicBarbs === true);
  check('secondwind: equipped', g._relicSecondWind === true);
  check('eye: equipped', g._relicEye === true);
  check('chart: equipped', g._relicChart === true);
  check('magnet: equipped', g._relicMagnet === true);

  const g2 = {};
  applyLoadout(g2, []);
  check('empty loadout: sonar false', g2._relicSonar === false);
  check('empty loadout: barbs false', g2._relicBarbs === false);
  check('empty loadout: secondwind false', g2._relicSecondWind === false);
  check('empty loadout: eye false', g2._relicEye === false);
  check('empty loadout: chart false', g2._relicChart === false);
  check('empty loadout: magnet false', g2._relicMagnet === false);

  const g3 = {};
  applyLoadout(g3, ['lungs', 'sonar', 'plating', 'magnet']);
  check('mix: lungs still applies with new relics', g3._relicAirBonus === 30);
  check('mix: plating still applies with new relics', g3._relicPlating === true);
  check('mix: sonar applies', g3._relicSonar === true);
  check('mix: magnet applies', g3._relicMagnet === true);
  check('mix: barbs left false', g3._relicBarbs === false);

  const g4 = {};
  let threw = false;
  try { applyLoadout(g4, ['nope', 'eye', 'bogus']); } catch (e) { threw = true; }
  check('unknown id (new relics): does not throw', !threw);
  check('unknown id (new relics): known id still applies', g4._relicEye === true);
  check('unknown id (new relics): others stay false', g4._relicSonar === false && g4._relicChart === false);
}

// --- getRelic.
{
  const r = getRelic('bellrig');
  check('getRelic: returns the relic by id', r && r.id === 'bellrig');
  check('getRelic: unknown id returns null', getRelic('nope') === null);
}

// --- stacking: the same relic twice compounds multiplicatively.
{
  const g = {};
  applyLoadout(g, ['fins', 'fins']);
  const expected = 1.18 * 1.18;
  check('stacking: fins twice compounds', Math.abs(g._relicSwimMult - expected) < 1e-9);
}

// --- applying an empty loadout resets to defaults (no behavior change from base game).
{
  const g = {};
  applyLoadout(g, []);
  check('empty loadout: air bonus 0', g._relicAirBonus === 0);
  check('empty loadout: swim mult 1', g._relicSwimMult === 1);
  check('empty loadout: plating false', g._relicPlating === false);
  check('empty loadout: platingReady false', g._platingReady === false);
  check('empty loadout: bellrig false', g._relicBellFull === false);
}

// --- RELICS table sanity.
{
  const ids = RELICS.map(r => r.id);
  check('RELICS: has the four starter relics', ['lungs', 'fins', 'plating', 'bellrig'].every(id => ids.includes(id)));
  check('RELICS: has the six Phase 5 relics', ['sonar', 'barbs', 'secondwind', 'eye', 'chart', 'magnet'].every(id => ids.includes(id)));
  check('RELICS: every entry has id/name/desc/cost/apply', RELICS.every(r => r.id && r.name && r.desc && typeof r.cost === 'number' && typeof r.apply === 'function'));
}

console.log(`relics: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
