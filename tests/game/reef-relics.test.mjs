// Reef-skip relics: find a reef's relic → bank a one-use token → cash it at the
// menu to start a run one reef deeper with scaled gold. Pure/Node-testable via
// an injected fake store. Run: node tests/game/reef-relics.test.mjs
import {
  defaultSalvage, loadSalvage, saveSalvage,
  bankReefRelic, consumeReefRelic, availableSkips, skipStartGold,
} from '../../src/meta/salvage.js';
import { SKIP } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _map: m };
}

// --- 1. defaults + banking ---
{
  const s = defaultSalvage();
  check('default reefRelics is an empty object', s.reefRelics && Object.keys(s.reefRelics).length === 0);
  bankReefRelic(s, 1);
  bankReefRelic(s, 1);
  bankReefRelic(s, 3);
  check('banking counts per reef', s.reefRelics[1] === 2 && s.reefRelics[3] === 1);
  bankReefRelic(s, 0);        // invalid
  bankReefRelic(s, 1.5);      // invalid
  bankReefRelic(s, -2);       // invalid
  check('invalid reef numbers are ignored', s.reefRelics[0] === undefined && Object.keys(s.reefRelics).length === 2);
}

// --- 2. availableSkips: a reef-N token unlocks a start at reef N+1 ---
{
  const s = defaultSalvage();
  check('no relics → no skips', availableSkips(s).length === 0);
  bankReefRelic(s, 1); bankReefRelic(s, 3);
  check('relics {1,3} → start reefs [2,4]', JSON.stringify(availableSkips(s)) === JSON.stringify([2, 4]));
}

// --- 3. consume: one-use, decrements, removes at zero ---
{
  const s = defaultSalvage();
  bankReefRelic(s, 2); bankReefRelic(s, 2);
  check('consume returns true when available', consumeReefRelic(s, 2) === true);
  check('count decremented to 1', s.reefRelics[2] === 1);
  check('consume again true', consumeReefRelic(s, 2) === true);
  check('key removed at zero', s.reefRelics[2] === undefined);
  check('consume with none returns false', consumeReefRelic(s, 2) === false);
  check('consume a never-held reef returns false', consumeReefRelic(s, 9) === false);
}

// --- 4. gold head-start formula ---
{
  check('fresh reef 1 → 0 gold', skipStartGold(1) === 0);
  check('reef 2 → goldPerReef', skipStartGold(2) === SKIP.goldPerReef);
  check('reef 3 → 2× goldPerReef', skipStartGold(3) === SKIP.goldPerReef * 2);
  check('reef 5 → 4× goldPerReef (example 500 → 2000)', skipStartGold(5) === SKIP.goldPerReef * 4);
}

// --- 5. persistence round-trip through a fake store ---
{
  const store = fakeStore();
  const s = defaultSalvage();
  bankReefRelic(s, 1); bankReefRelic(s, 1); bankReefRelic(s, 4);
  saveSalvage(s, store);
  const back = loadSalvage(store);
  check('reefRelics survive save/load', back.reefRelics[1] === 2 && back.reefRelics[4] === 1);
  check('availableSkips after reload', JSON.stringify(availableSkips(back)) === JSON.stringify([2, 5]));
}

// --- 6. load sanitizes garbage reefRelics ---
{
  const store = fakeStore();
  store.setItem('deepdescent.salvage.v1', JSON.stringify({
    salvage: 5, unlocked: [], slots: 2, loadout: [],
    reefRelics: { 1: 2, '2': -3, 'x': 5, 3: 'nope', 4: 1.9, '-1': 4 },
  }));
  const s = loadSalvage(store);
  check('valid positive counts kept (floored)', s.reefRelics[1] === 2 && s.reefRelics[4] === 1);
  check('negative / non-numeric / bad keys dropped', s.reefRelics[2] === undefined && s.reefRelics.x === undefined && s.reefRelics[3] === undefined && s.reefRelics['-1'] === undefined);
}

// --- 7. missing reefRelics field loads as empty (back-compat with old saves) ---
{
  const store = fakeStore();
  store.setItem('deepdescent.salvage.v1', JSON.stringify({ salvage: 9, unlocked: ['fins'], slots: 3, loadout: ['fins'] }));
  const s = loadSalvage(store);
  check('old save without reefRelics → empty map, other fields intact', Object.keys(s.reefRelics).length === 0 && s.salvage === 9 && s.loadout[0] === 'fins');
}

console.log(`reef-relics: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
