// Max lives is a Dry Dock permanent unlock: the ceiling starts at 3 (the lives
// you begin a run with) and each Salvage purchase adds one, to a configurable
// cap of 6. This deliberately lowers the old free ceiling of 5.
// Run: node tests/game/life-max.test.mjs

import { LIVES, GAME } from '../../src/config.js';
import { defaultSalvage, loadSalvage, saveSalvage } from '../../src/meta/salvage.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const fakeStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

check('the ceiling starts at the 3 lives a run begins with', LIVES.baseMax === 3);
check('the ceiling caps at 6', LIVES.capMax === 6);
check('the cap is a config knob above the base', LIVES.capMax > LIVES.baseMax);
check('the old hardcoded GAME.maxLives is gone', GAME.maxLives === undefined);
check('a fresh save starts at the base ceiling', defaultSalvage().lifeMax === LIVES.baseMax);

// --- round-trip and clamping ----------------------------------------------
{
  const s = fakeStore();
  const st = defaultSalvage(); st.lifeMax = 5;
  saveSalvage(st, s);
  check('lifeMax survives a save/load round trip', loadSalvage(s).lifeMax === 5);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, lifeMax: 99 }));
  check('an absurd lifeMax clamps to the cap', loadSalvage(s).lifeMax === LIVES.capMax);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, lifeMax: 1 }));
  check('a too-low lifeMax clamps up to the base', loadSalvage(s).lifeMax === LIVES.baseMax);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, lifeMax: 'lots' }));
  check('a junk lifeMax falls back to the base', loadSalvage(s).lifeMax === LIVES.baseMax);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {} }));
  check('an old save with no lifeMax backfills to the base — no migration needed',
    loadSalvage(s).lifeMax === LIVES.baseMax);
}

// --- the seen-once warning flags live here too, NOT in progress.v1 --------
{
  check('a fresh save has seen neither line',
    defaultSalvage().seen.oxygenLine === false && defaultSalvage().seen.crushLine === false);
  const s = fakeStore();
  const st = defaultSalvage(); st.seen.crushLine = true;
  saveSalvage(st, s);
  const back = loadSalvage(s);
  check('a seen flag survives a round trip', back.seen.crushLine === true);
  check('an unseen flag stays false',        back.seen.oxygenLine === false);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, seen: 'yes' }));
  check('a junk seen bag sanitizes to all-false',
    loadSalvage(s).seen.oxygenLine === false && loadSalvage(s).seen.crushLine === false);
}

console.log(`ok life-max.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
