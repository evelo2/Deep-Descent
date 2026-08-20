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
  check('RELICS: every entry has id/name/desc/cost/apply', RELICS.every(r => r.id && r.name && r.desc && typeof r.cost === 'number' && typeof r.apply === 'function'));
}

console.log(`relics: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
