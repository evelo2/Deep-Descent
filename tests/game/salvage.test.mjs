// Regression test: the Salvage meta-progression module (The Salvage Log, Phase 1).
// Pure, storage-injectable logic — no DOM. Covers milestone payout math and
// localStorage-shaped persistence (defaults, malformed input, round-trip, clamping).
// Run: node tests/game/salvage.test.mjs

import { loadSalvage, saveSalvage, runPayout, defaultSalvage } from '../../src/meta/salvage.js';
import { SALVAGE } from '../../src/config.js';
import { Game } from '../../src/game.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Fake in-memory storage, shaped like localStorage.
const store = (init = null) => {
  let v = init;
  return { getItem: () => v, setItem: (k, s) => { v = s; } };
};

// --- runPayout: pure milestone math. ------------------------------------------
{
  const p = runPayout({ deepestReef: 3, bosses: 1, relicsBanked: 2 });
  const expected = 3 * SALVAGE.perReef + 1 * SALVAGE.perBoss + 2 * SALVAGE.perRelic;
  check('runPayout: sums reef/boss/relic milestones', p === expected);
}
{
  // Black Pearls now grant Salvage immediately on banking (see _bankLoot),
  // not at the run-end milestone — a stray `pearls` field must be ignored,
  // never double-counted.
  const p = runPayout({ deepestReef: 2, bosses: 1, relicsBanked: 0, pearls: 99 });
  const expected = 2 * SALVAGE.perReef + 1 * SALVAGE.perBoss;
  check('runPayout: no longer counts pearls (stray pearls field ignored)', p === expected);
}
{
  const p = runPayout({});
  check('runPayout: defaults deepestReef=1, rest 0', p === Math.round(1 * SALVAGE.perReef));
}

// --- loadSalvage: defaults on no store / null / malformed. --------------------
{
  check('loadSalvage(no store): matches defaultSalvage()', deepEqual(loadSalvage(store(null)), defaultSalvage()));
}
{
  check('loadSalvage(store(null)): matches defaultSalvage()', deepEqual(loadSalvage(store(null)), defaultSalvage()));
}
{
  const s = store('{not json');
  let threw = false;
  let result;
  try { result = loadSalvage(s); } catch (e) { threw = true; }
  check('loadSalvage(malformed JSON): does not throw', !threw);
  check('loadSalvage(malformed JSON): falls back to defaults', deepEqual(result, defaultSalvage()));
}

// --- loadSalvage: partial merge over defaults. ---------------------------------
{
  const s = store('{"salvage":50}');
  const r = loadSalvage(s);
  check('partial merge: salvage taken from saved value', r.salvage === 50);
  check('partial merge: slots defaulted', r.slots === SALVAGE.startSlots);
  check('partial merge: unlocked defaulted to []', Array.isArray(r.unlocked) && r.unlocked.length === 0);
  check('partial merge: loadout defaulted to []', Array.isArray(r.loadout) && r.loadout.length === 0);
}

// --- saveSalvage -> loadSalvage round-trip. -------------------------------------
{
  const s = store();
  const state = { salvage: 123, unlocked: ['lungs', 'fins'], slots: 3, loadout: ['lungs'] };
  saveSalvage(state, s);
  const r = loadSalvage(s);
  check('round-trip: state survives save -> load unchanged', deepEqual(r, state));
}

// --- saveSalvage never throws even with no store available. --------------------
{
  let threw = false;
  try { saveSalvage({ salvage: 1, unlocked: [], slots: 2, loadout: [] }, { setItem() { throw new Error('boom'); } }); }
  catch (e) { threw = true; }
  check('saveSalvage: swallows a throwing store (never throws)', !threw);
}

// --- slots clamp to [startSlots, maxSlots] on load. -----------------------------
{
  const s = store(JSON.stringify({ salvage: 0, unlocked: [], slots: 99, loadout: [] }));
  const r = loadSalvage(s);
  check('slots clamp: an out-of-range saved slots clamps to maxSlots', r.slots === SALVAGE.maxSlots);
}
{
  const s = store(JSON.stringify({ salvage: 0, unlocked: [], slots: -5, loadout: [] }));
  const r = loadSalvage(s);
  check('slots clamp: a too-low saved slots clamps up to startSlots', r.slots === SALVAGE.startSlots);
}

// --- salvage is always a finite number >= 0. ------------------------------------
{
  const s = store(JSON.stringify({ salvage: 'not a number', unlocked: [], slots: 2, loadout: [] }));
  const r = loadSalvage(s);
  check('salvage sanity: non-numeric salvage falls back to 0', r.salvage === 0);
}
{
  const s = store(JSON.stringify({ salvage: -50, unlocked: [], slots: 2, loadout: [] }));
  const r = loadSalvage(s);
  check('salvage sanity: negative salvage clamps to 0', r.salvage === 0);
}

// --- _gameOver is idempotent: a same-frame double death awards Salvage once. --
{
  const gameOver = Game.prototype._gameOver;
  const stub = {
    state: 'playing', score: 0, hi: 100, hiReef: 1,   // score<hi so no localStorage hi-write
    reef: 3, bossesFelled: 1, relicsBanked: 0, blackPearlsBanked: 0,
    meta: { salvage: 0, unlocked: [], slots: 2, loadout: [] },
    lastPayout: null, newHi: false, audio: { gasp() {} },
  };
  gameOver.call(stub);
  const after1 = stub.meta.salvage;
  const expected = 3 * SALVAGE.perReef + 1 * SALVAGE.perBoss;   // deepestReef 3, 1 boss
  check('first _gameOver awards the milestone payout', after1 === expected && after1 > 0);
  gameOver.call(stub);   // second death in the same frame — must be a no-op
  check('second _gameOver does NOT re-award Salvage (idempotent)', stub.meta.salvage === after1);
}

// --- _bankLoot converts carried Black Pearls to Salvage immediately. -----------
{
  const bankLoot = Game.prototype._bankLoot;
  const stub = {
    carried: 0, score: 0, gold: 0, reefBanked: 0, bankPulse: 0,
    carryingRelic: false, relicBanked: false, relicsBanked: 0,
    carriedPearls: 3, blackPearlsBanked: 0,
    meta: { salvage: 0, unlocked: [], slots: 2, loadout: [] },
    audio: { bank() {} },
    puName: '', puCol: '', puT: 0,
  };
  bankLoot.call(stub);
  check('_bankLoot: converts carriedPearls to Salvage at SALVAGE.perPearl',
    stub.meta.salvage === 3 * SALVAGE.perPearl);
  check('_bankLoot: clears carriedPearls after banking', stub.carriedPearls === 0);
  check('_bankLoot: increments blackPearlsBanked run counter', stub.blackPearlsBanked === 3);
}
{
  // Empty case: no pearls collected banks exactly as before — no Salvage change.
  const bankLoot = Game.prototype._bankLoot;
  const stub = {
    carried: 100, score: 0, gold: 0, reefBanked: 0, bankPulse: 0,
    carryingRelic: false, relicBanked: false, relicsBanked: 0,
    carriedPearls: 0, blackPearlsBanked: 0,
    meta: { salvage: 5, unlocked: [], slots: 2, loadout: [] },
    audio: { bank() {} },
    puName: '', puCol: '', puT: 0,
  };
  bankLoot.call(stub);
  check('_bankLoot: no pearls carried leaves Salvage unchanged', stub.meta.salvage === 5);
  check('_bankLoot: no pearls carried leaves blackPearlsBanked at 0', stub.blackPearlsBanked === 0);
}

console.log(`salvage: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
