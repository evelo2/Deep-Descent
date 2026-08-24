// Economy service — the Core-owned wallet promoted from meta/salvage.js. Run:
//   node tests/core/economy.test.mjs
// It is a THIN wrapper: it loads/saves through meta/salvage.js (same localStorage
// key + format as baseline), owns the loaded salvage bag as `state`, and exposes
// earn/balance/save + the reef-relic helpers. `state` is the same object a future
// minigame reads via host.economy.state, so the wallet is genuinely shared.
import { makeEconomy } from '../../src/core/economy.js';
import { loadSalvage } from '../../src/meta/salvage.js';
import { SALVAGE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// A fake localStorage-shaped store, so the service is fully Node-testable.
function makeStore(seed) {
  const backing = seed ? { 'deepdescent.salvage.v1': seed } : {};
  return {
    backing,
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
  };
}

// --- 1. loads through meta/salvage.js (same key/format) ---
{
  // makeStore seeds the legacy v1 key, so this also exercises v1→v2 migration.
  const store = makeStore(JSON.stringify({ salvage: 120, unlocked: ['lungs'], slots: 3, loadout: ['lungs'], reefRelics: { 2: 1 } }));
  const eco = makeEconomy({ store });
  check('state matches loadSalvage of the same store', JSON.stringify(eco.state) === JSON.stringify(loadSalvage(store)));
  check('balance() reads state.salvage', eco.balance() === 120);
  check('legacy unlocked migrated into the rentals bag', eco.state.rentals.lungs > 0);
}

// --- 2. earn credits salvage and persists to the same store/key ---
{
  const store = makeStore(JSON.stringify({ salvage: 100, rentals: {}, slots: 2, loadout: [], reefRelics: {} }));
  const eco = makeEconomy({ store });
  eco.earn({ salvage: 50 });
  check('earn adds to balance', eco.balance() === 150);
  const reloaded = loadSalvage(store);
  check('earn persisted (survives reload from same key)', reloaded.salvage === 150);
  check('earn returns the new balance', eco.earn({ salvage: 10 }) === 160);
  check('earn({}) is a harmless no-op', eco.earn({}) === 160 && eco.balance() === 160);
}

// --- 3. save() round-trips the owned state (direct mutation is honored) ---
{
  const store = makeStore();
  const eco = makeEconomy({ store });
  eco.state.salvage += 33;             // a future minigame / legacy game mutates the shared bag
  eco.state.rentals.fins = 20;
  eco.save();
  const reloaded = loadSalvage(store);
  check('save() persists direct mutations to salvage', reloaded.salvage === 33);
  check('save() persists direct mutations to rentals', reloaded.rentals.fins === 20);
}

// --- 4. reef-relic passthroughs operate on the owned state ---
{
  const eco = makeEconomy({ store: makeStore() });
  eco.bankReefRelic(2);               // found reef-2 objective relic
  check('bankReefRelic records the token', eco.state.reefRelics[2] === 1);
  check('availableSkips reflects held relics (reef-2 → start reef 3)', JSON.stringify(eco.availableSkips()) === JSON.stringify([3]));
  check('consumeReefRelic spends one and returns true', eco.consumeReefRelic(2) === true);
  check('consumeReefRelic on an empty reef returns false', eco.consumeReefRelic(2) === false);
  check('availableSkips empty after spend', eco.availableSkips().length === 0);
}

// --- 5. no store → still constructs on defaults, never throws ---
{
  const eco = makeEconomy();
  check('default balance is 0', eco.balance() === 0);
  check('default slots is the configured start', eco.state.slots === SALVAGE.startSlots);
  let threw = false;
  try { eco.earn({ salvage: 5 }); eco.save(); } catch (e) { threw = true; }
  check('earn/save never throw without a store', !threw);
}

console.log(`economy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
