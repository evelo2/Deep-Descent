// Timed salvage rentals (balance 2026-08-23): v1 unlocked[] -> v2 rentals{}
// migration, sanitize + loadout prune, plus rentRelic / tickEquippedRentals
// mechanics. Storage-injectable, no DOM. Run: node tests/game/rentals.test.mjs

import { loadSalvage, saveSalvage, defaultSalvage } from '../../src/meta/salvage.js';
import { getRelic, rentRelic, tickEquippedRentals } from '../../src/meta/relics.js';
import { RENTAL } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (n, c) => c ? passed++ : (failed++, console.error(`  FAIL: ${n}`));
// A fake store holding v1/v2 blobs; setItem writes only the v2 key (like the app).
const store = (val) => {
  const v = { ...val };
  return {
    getItem: (k) => (k === 'deepdescent.salvage.v2' ? (v.v2 ?? null) : k === 'deepdescent.salvage.v1' ? (v.v1 ?? null) : null),
    setItem: (k, s) => { if (k === 'deepdescent.salvage.v2') v.v2 = s; },
    removeItem() {},
  };
};

// --- default shape has a rentals bag, no `unlocked`. ---
{
  const d = defaultSalvage();
  check('default has rentals {}', d.rentals && typeof d.rentals === 'object' && Object.keys(d.rentals).length === 0);
  check('default has no unlocked', !('unlocked' in d));
}

// --- v1 migration: unlocked -> full-period rentals; unlocked dropped. ---
{
  const v1 = JSON.stringify({ salvage: 50, unlocked: ['sonar', 'fins'], slots: 3, loadout: ['sonar'], reefRelics: {} });
  const r = loadSalvage(store({ v1 }));
  check('v1 unlocked migrates to full-period rentals', r.rentals.sonar === RENTAL.dives && r.rentals.fins === RENTAL.dives);
  check('migration keeps salvage/slots/loadout', r.salvage === 50 && r.slots === 3 && r.loadout.includes('sonar'));
  check('no unlocked after migration', !('unlocked' in r));
}

// --- bogus unlocked ids are dropped on migration. ---
{
  const v1 = JSON.stringify({ salvage: 0, unlocked: ['sonar', 'notarelic'], slots: 2, loadout: [] });
  const r = loadSalvage(store({ v1 }));
  check('unknown relic id dropped in migration', !('notarelic' in r.rentals) && r.rentals.sonar === RENTAL.dives);
}

// --- v2 round-trips and wins over v1. ---
{
  const s = store({ v1: JSON.stringify({ unlocked: ['fins'] }) });
  saveSalvage({ salvage: 7, rentals: { sonar: 5 }, slots: 2, loadout: ['sonar'], reefRelics: {} }, s);
  const r = loadSalvage(s);
  check('v2 read wins over v1', r.rentals.sonar === 5 && !r.rentals.fins && r.salvage === 7);
}

// --- sanitize: junk rental values dropped; cap enforced. ---
{
  const s = store({ v2: JSON.stringify({ salvage: 0, rentals: { sonar: -3, fins: 'x', lungs: 99999, barbs: 4 }, slots: 2, loadout: [] }) });
  const r = loadSalvage(s);
  check('non-positive rental dropped', !('sonar' in r.rentals));
  check('non-number rental dropped', !('fins' in r.rentals));
  check('rental capped at maxDives', r.rentals.lungs === RENTAL.maxDives);
  check('valid rental kept', r.rentals.barbs === 4);
}

// --- load-time loadout prune: an equipped id with no rental is dropped. ---
{
  const s = store({ v2: JSON.stringify({ salvage: 0, rentals: { sonar: 3 }, slots: 2, loadout: ['sonar', 'fins'] }) });
  const r = loadSalvage(s);
  check('equipped-but-unrented pruned from loadout', r.loadout.includes('sonar') && !r.loadout.includes('fins'));
}

// --- rentRelic: spends cost + refills to full; insufficient salvage is a no-op. ---
{
  const cost = getRelic('sonar').cost;
  const st = { salvage: cost + 5, rentals: {}, loadout: [], slots: 2 };
  check('rentRelic succeeds with enough salvage', rentRelic(st, 'sonar') === true);
  check('rentRelic charged the cost', st.salvage === 5);
  check('rentRelic set full period', st.rentals.sonar === RENTAL.dives);
  check('rentRelic broke = no-op false', rentRelic(st, 'lungs') === false && !('lungs' in st.rentals) && st.salvage === 5);
  check('rentRelic unknown id = false', rentRelic(st, 'nope') === false);
}

// --- renew tops a running-low rental back to full. ---
{
  const cost = getRelic('fins').cost;
  const st = { salvage: cost, rentals: { fins: 2 }, loadout: ['fins'], slots: 2 };
  rentRelic(st, 'fins');
  check('renew refills to full period', st.rentals.fins === RENTAL.dives);
}

// --- tick: equipped -1, unequipped frozen, lapse-at-0 removes + returns id. ---
{
  const st = { salvage: 0, rentals: { sonar: 2, fins: 5, barbs: 1 }, loadout: ['sonar', 'barbs'], slots: 3 };
  const lapsed = tickEquippedRentals(st);
  check('equipped sonar ticked', st.rentals.sonar === 1);
  check('unequipped fins frozen', st.rentals.fins === 5);
  check('barbs lapsed (1->0) removed from rentals', !('barbs' in st.rentals));
  check('lapsed barbs removed from loadout', !st.loadout.includes('barbs'));
  check('lapsed list returned', lapsed.length === 1 && lapsed[0] === 'barbs');
}

console.log(`rentals: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
