// The Depth Valve (shop item) holds pressure below its line: deeper than
// VALVE.holdDepthM the DEPTH TERM of the air drain stops growing, so the world
// floor costs the same air as the valve's line. The baseline breath and every
// drain multiplier (reef penalty, abyss 150%, wetsuit, extraction lapse) are
// untouched — the valve only clamps the depth the pressure is charged at.
// Pure function, shared by update() + this test. Run: node tests/game/valve-air.test.mjs

// Cave's constructor touches the DOM; the shop checks below drive hand-built
// stubs so no world-gen runs, but importing the reef still needs the stub the
// other reef-side tests use. Mirror abyss-air's.
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

import { Reef, pressureDepth } from '../../src/minigames/reef/index.js';
import { WORLD, AIR, VALVE, DARKZONE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const holdY = WORLD.SURFACE + VALVE.holdDepthM * 10;

// --- Config sanity: the line has to sit inside the water column to mean anything.
check('the valve line sits below the surface', holdY > WORLD.SURFACE);
check('the valve line sits above the world floor', holdY < WORLD.WH);

// --- Without the valve, the drain is charged at the diver's true depth. ---
check('no valve: identity at the surface', pressureDepth(WORLD.SURFACE, false) === WORLD.SURFACE);
check('no valve: identity above the line', pressureDepth(holdY - 500, false) === holdY - 500);
check('no valve: identity below the line', pressureDepth(WORLD.WH, false) === WORLD.WH);
check('no valve is the default', pressureDepth(WORLD.WH) === WORLD.WH);

// --- With the valve: nothing changes above the line, it clamps below it. ---
check('valve: unchanged above the line', pressureDepth(holdY - 500, true) === holdY - 500);
check('valve: unchanged at the surface', pressureDepth(WORLD.SURFACE, true) === WORLD.SURFACE);
check('valve: exactly at the line is the line', pressureDepth(holdY, true) === holdY);
check('valve: below the line clamps back to the line', pressureDepth(holdY + 800, true) === holdY);
check('valve: the world floor is charged at the line', pressureDepth(WORLD.WH, true) === holdY);

// --- The resulting burn rate: flat below the line, real saving at the floor,
// and the baseline breath still charged (the valve is not free air). ---
const drain = (y, hasValve) => AIR.drainPerSec + pressureDepth(y, hasValve) * AIR.drainDepthFactor;
check('valve: the burn rate is identical below the line at any depth',
  Math.abs(drain(holdY + 600, true) - drain(WORLD.WH, true)) < 1e-9);
check('no valve: the burn rate still rises with depth', drain(WORLD.WH, false) > drain(holdY + 600, false));
check('valve: a real saving at the floor', drain(WORLD.WH, true) < drain(WORLD.WH, false));
check('valve: never worse than diving without it', drain(WORLD.WH, true) <= drain(WORLD.WH, false)
  && drain(holdY - 500, true) <= drain(holdY - 500, false));
check('valve: the baseline breath is still charged', drain(WORLD.WH, true) > AIR.drainPerSec);
check('valve: the floor costs exactly baseline + the line\'s depth term',
  Math.abs(drain(WORLD.WH, true) - (AIR.drainPerSec + holdY * AIR.drainDepthFactor)) < 1e-9);

// --- BALANCE: how much the valve is actually worth, and where. ---------------
// Shape alone is not enough: with the line set too deep the valve is dominated
// by the Sealed Wetsuit (-35% at EVERY depth, from reef 1) and nobody buys it.
// These pin the intended value curve so a future nudge to holdDepthM cannot
// silently undo the balance pass of 2026-09-01.
const yOf = (m) => WORLD.SURFACE + m * 10;
const floorM = (WORLD.WH - WORLD.SURFACE) / 10;
const saving = (m) => 1 - drain(yOf(m), true) / drain(yOf(m), false);

check('no saving at all above the line', saving(VALVE.holdDepthM - 50) === 0);
check('no saving exactly at the line', saving(VALVE.holdDepthM) === 0);
check('the saving grows the deeper you go below the line',
  saving(floorM) > saving(300) && saving(300) > saving(240));
check('a worthwhile saving by 240 m (~15%)', saving(240) > 0.13 && saving(240) < 0.17);
check('a strong saving at the world floor (~33%)',
  saving(floorM) > 0.31 && saving(floorM) < 0.36);
check('the valve never costs more air than diving without it',
  [0, 50, 120, 200, 300, floorM].every((m) => saving(m) >= 0));

// The line's identity: it starts paying about where the caves turn dark, so
// "buy it before you go into the deep dark" is a legible rule of thumb.
const darkStartM = DARKZONE.minDepthFrac * floorM;
check('the valve line sits at or above the depth dark caves begin',
  VALVE.holdDepthM <= darkStartM);
check('the valve line is close to where dark caves begin, not far above it',
  darkStartM - VALVE.holdDepthM < 25);

// --- The shop row: a one-off unlock, reef-gated, gone once owned. Driven
// through the REAL _shopItems() so the gate itself is what is under test. ---
function shopStub(over = {}) {
  return {
    shopWhere: 'boat', carried: 0, carriedPearls: 0, atBell: null, _relicBellFull: false,
    reef: VALVE.minReef, gold: 5000, owned: new Set(['harpoon', 'net']),
    weaponLevel: { harpoon: 3, net: 3 }, harpoonAmmo: 30, harpoonMax: 30, harpoonCapLevel: 3,
    speargunAmmo: 0, chargeAmmo: 0, chargeMax: 1, chargeCapLevel: 0, aimLevel: 9,
    tankLevel: 9, flares: 3, hasTorch: true, hasValve: false, buffT: {},
    runValveBought: 0, runValveOffered: 0,
    _dblCost: Reef.prototype._dblCost, _mmss: () => '0:00',
    ...over,
  };
}
const valveRows = (over) => Reef.prototype._shopItems.call(shopStub(over)).filter((it) => it.kind === 'valve');

check('the valve is offered from its gate reef', valveRows().length === 1);
check('the valve is not offered before its gate reef', valveRows({ reef: VALVE.minReef - 1 }).length === 0);
check('the valve is offered at deeper reefs too', valveRows({ reef: VALVE.minReef + 3 }).length === 1);
check('the valve is gone once owned', valveRows({ hasValve: true }).length === 0);
check('the valve row costs VALVE.cost', valveRows()[0].cost === VALVE.cost);
check('the valve row names its depth so the player knows what they are buying',
  valveRows()[0].label.includes(String(VALVE.holdDepthM)));

// --- Buying it: the REAL _shopBuy branch deducts gold and flips the flag. ---
{
  const stub = shopStub();
  stub.shopSel = Reef.prototype._shopItems.call(stub).findIndex((it) => it.kind === 'valve');
  stub._shopItems = () => Reef.prototype._shopItems.call(stub);
  stub.gold = VALVE.cost;
  stub.audio = { select() {}, gasp() {}, bank() {} };
  stub.particles = { sparkle() {} };
  Reef.prototype._shopBuy.call(stub);
  check('buying the valve sets the flag', stub.hasValve === true);
  check('buying the valve spends exactly its cost', stub.gold === 0);
  check('buying the valve flashes a pickup name', typeof stub.puName === 'string' && stub.puName.length > 0);
  check('buying the valve records the purchase', stub.runValveBought === 1);
}
{
  const broke = shopStub();
  broke.shopSel = Reef.prototype._shopItems.call(broke).findIndex((it) => it.kind === 'valve');
  broke._shopItems = () => Reef.prototype._shopItems.call(broke);
  broke.gold = VALVE.cost - 1;
  broke.audio = { select() {}, gasp() {}, bank() {} };
  Reef.prototype._shopBuy.call(broke);
  check('too little gold buys nothing', broke.hasValve !== true && broke.gold === VALVE.cost - 1);
  check('too little gold shows the deny flash', broke.shopDeny > 0);
  check('too little gold records no purchase', broke.runValveBought === 0);
}

// --- Purchase telemetry. Two 0-or-1 per-run flags feed the lifetime counters
// legacy:valveOffered / legacy:valveBought, whose ratio is the attach rate —
// the evidence the 2026-09-01 rebalance was decided without. The OFFER is
// recorded in _openShop, not in _shopItems: that builder runs every frame while
// the shop is drawn and must stay side-effect-free. ---
function openStub(over = {}) {
  return {
    _shell: {}, audio: { select() {} }, reef: VALVE.minReef, hasValve: false,
    runValveOffered: 0, ...over,
  };
}
const offerOf = (over, times = 1) => {
  const s = openStub(over);
  for (let i = 0; i < times; i++) Reef.prototype._openShop.call(s, 'boat');
  return s.runValveOffered;
};

check('opening the shop at the gate reef records the offer', offerOf() === 1);
check('opening the shop deeper than the gate reef records the offer', offerOf({ reef: VALVE.minReef + 4 }) === 1);
check('opening the shop before the gate reef records no offer', offerOf({ reef: VALVE.minReef - 1 }) === 0);
check('opening the shop when you already own one records no offer', offerOf({ hasValve: true }) === 0);
check('re-opening the shop counts the run once, not once per visit', offerOf({}, 4) === 1);
check('recording the offer does not disturb the shop it opened',
  (() => { const s = openStub(); Reef.prototype._openShop.call(s, 'boat');
    return s._shell.state === 'shop' && s.shopWhere === 'boat' && s.shopSel === 0; })());

// --- Both flags reach the lifetime counters through the real _runDelta(). ---
function deltaStub(over = {}) {
  return {
    runSharkKills: 0, depthReached: 0, runTime: 0, runSubLoot: 0, runNetted: 0,
    lastPayout: 0, blackPearlsBanked: 0, bossesFelled: 0, score: 0,
    runChestsOpened: 0, runGuardiansFelled: 0,
    runValveBought: 0, runValveOffered: 0, ...over,
  };
}
const deltaOf = (over) => Reef.prototype._runDelta.call(deltaStub(over));

check('the run delta carries the offer under its namespaced key',
  deltaOf({ runValveOffered: 1 })['legacy:valveOffered'] === 1);
check('the run delta carries the purchase under its namespaced key',
  deltaOf({ runValveBought: 1, runValveOffered: 1 })['legacy:valveBought'] === 1);
check('a run that never saw the shop contributes 0 to both',
  deltaOf()['legacy:valveOffered'] === 0 && deltaOf()['legacy:valveBought'] === 0);
check('the counters are exactly 0 or 1 — one run can buy at most one valve',
  [deltaOf({ runValveBought: 1, runValveOffered: 1 }), deltaOf()]
    .every((d) => [0, 1].includes(d['legacy:valveBought']) && [0, 1].includes(d['legacy:valveOffered'])));

// The invariant that makes the ratio meaningful: buying is only reachable
// through a shop that offered it, so bought <= offered on every real path.
{
  const s = shopStub();
  Reef.prototype._openShop.call(Object.assign(s, { _shell: {}, audio: { select() {}, gasp() {}, bank() {} } }), 'boat');
  s.shopSel = Reef.prototype._shopItems.call(s).findIndex((it) => it.kind === 'valve');
  s._shopItems = () => Reef.prototype._shopItems.call(s);
  s.particles = { sparkle() {} };
  Reef.prototype._shopBuy.call(s);
  const d = Reef.prototype._runDelta.call(deltaStub({ runValveBought: s.runValveBought, runValveOffered: s.runValveOffered }));
  check('the real open-then-buy path records both an offer and a purchase',
    d['legacy:valveOffered'] === 1 && d['legacy:valveBought'] === 1);
  check('bought never exceeds offered', d['legacy:valveBought'] <= d['legacy:valveOffered']);
}

console.log(`valve-air: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
