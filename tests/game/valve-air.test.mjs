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

import { Reef } from '../../src/minigames/reef/index.js';
import { AIR, DEPTH, VALVE, crushDepthM, valveDiscount, airDepthTerm } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const near = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

// --- crush depth: one Valve level per world tier ---------------------------
check('no valve crushes at 400 m',  crushDepthM(0) === 400);
check('Lv1 crushes at 720 m',       crushDepthM(1) === 720);
check('Lv2 crushes at 1160 m',      crushDepthM(2) === 1160);
check('Lv3 crushes at 1820 m',      crushDepthM(3) === 1820);
check('each level reaches its tier floor: Lv1 clears 700 m', crushDepthM(1) > 700);
check('Lv2 clears the 1150 m floor',  crushDepthM(2) > 1150);
check('Lv3 clears the 1800 m floor',  crushDepthM(3) > 1800);
check('no valve does NOT clear the 700 m tier-2 floor', crushDepthM(0) < 700);

// --- clamps: a corrupt level must never crash a dive -----------------------
check('level 4 clamps to Lv3',    crushDepthM(4) === crushDepthM(3));
check('level -1 clamps to Lv0',   crushDepthM(-1) === crushDepthM(0));
check('NaN clamps to Lv0',        crushDepthM(NaN) === crushDepthM(0));
check('undefined clamps to Lv0',  crushDepthM(undefined) === crushDepthM(0));

// --- the oxygen line steepens the depth term, and only below 250 m ---------
check('the oxygen line sits at 250 m', DEPTH.oxygenLineM === 250);
check('the steepening factor is 1.6',  DEPTH.oxygenSteepen === 1.6);
check('the crush timer is 14 s', DEPTH.crushTimer === 14);
check('the timer recovers at 1 s per 1.5 s of safe water', DEPTH.crushRecoverRatio === 1.5);
check('the gauge starts warning 40 m above crush depth', DEPTH.approachWarnM === 40);
const perM = AIR.drainDepthFactor * 10;
check('above the line the term is the unchanged linear rate',
  near(airDepthTerm(100, 0), 100 * perM));
check('at the line exactly, still linear',
  near(airDepthTerm(250, 0), 250 * perM));
check('below the line the marginal rate is 1.6x',
  near(airDepthTerm(350, 0) - airDepthTerm(250, 0), 100 * perM * 1.6));
check('the term is monotonic in depth', airDepthTerm(800, 0) > airDepthTerm(400, 0));

// --- the tier-floor costs the discount ladder is sized against -------------
check('unvalved at 400 m costs ~3.5/s',      near(airDepthTerm(400, 0), 3.53, 0.05));
check('Lv1 at the 700 m tier-2 floor ~4.2/s', near(airDepthTerm(700, 1), 4.19, 0.05));
check('Lv2 at the 1150 m tier-3 floor ~4.5/s', near(airDepthTerm(1150, 2), 4.50, 0.05));
check('Lv3 at the 1800 m tier-4 floor ~4.7/s', near(airDepthTerm(1800, 3), 4.72, 0.05));
check('a properly equipped diver pays about the same at every tier floor',
  Math.max(airDepthTerm(400, 0), airDepthTerm(700, 1), airDepthTerm(1150, 2), airDepthTerm(1800, 3)) -
  Math.min(airDepthTerm(400, 0), airDepthTerm(700, 1), airDepthTerm(1150, 2), airDepthTerm(1800, 3)) < 1.3);

// --- parity with the shipped 2026-09-01 clamp, where it was tuned ----------
// The old valve clamped the depth term at VALVE.holdDepthM (150 m), charging
// 150 * 10 * drainDepthFactor = 1.08/s at any depth below it.
const oldClamped = VALVE.holdDepthM * 10 * AIR.drainDepthFactor;
check('Lv1 at 240 m stays within 5% of the clamp it replaces',
  Math.abs(airDepthTerm(240, 1) - oldClamped) / oldClamped < 0.05);
// At the old 411 m floor the numbers DELIBERATELY diverge — the oxygen line
// raised the unvalved cost there too, so the valve's share of the saving falls
// from 34% to 23%. Pinned as a new number, not as parity (see the spec).
check('Lv1 at the old 411 m floor is the new pinned 2.19/s',
  near(airDepthTerm(411, 1), 2.19, 0.05));
check('and that is still a real saving over no valve at all',
  airDepthTerm(411, 1) < airDepthTerm(411, 0) * 0.65);

// --- the discounts themselves ---------------------------------------------
check('no valve discounts nothing', valveDiscount(0) === 0);
check('the discount grows with every level',
  valveDiscount(1) < valveDiscount(2) && valveDiscount(2) < valveDiscount(3));
check('even Lv3 never makes depth free', valveDiscount(3) < 1);
check('a discounted term is always cheaper than an undiscounted one',
  airDepthTerm(1000, 2) < airDepthTerm(1000, 0));

// --- The shop row: sells ONE level at a time, reef-gated, gone once maxed.
// Driven through the REAL _shopItems() so the gate itself is under test.
// (Recovered from the pre-Deep-Reefs coverage at git show 498b06b, adapted
// from the old single-purchase boolean flag to the new valveLevel ladder.)
function shopStub(over = {}) {
  return {
    shopWhere: 'boat', carried: 0, carriedPearls: 0, atBell: null, _relicBellFull: false,
    reef: VALVE.minReef, gold: 5000, owned: new Set(['harpoon', 'net']),
    weaponLevel: { harpoon: 3, net: 3 }, harpoonAmmo: 30, harpoonMax: 30, harpoonCapLevel: 3,
    speargunAmmo: 0, chargeAmmo: 0, chargeMax: 1, chargeCapLevel: 0, aimLevel: 9,
    tankLevel: 9, flares: 3, hasTorch: true, valveLevel: 0, buffT: {},
    runValveBought: 0, runValveOffered: 0,
    _dblCost: Reef.prototype._dblCost, _mmss: () => '0:00',
    ...over,
  };
}
const valveRows = (over) => Reef.prototype._shopItems.call(shopStub(over)).filter((it) => it.kind === 'valve');

check('the valve is offered from its gate reef with no valve', valveRows().length === 1);
check('the valve is not offered before its gate reef', valveRows({ reef: VALVE.minReef - 1 }).length === 0);
check('the valve is offered at deeper reefs too', valveRows({ reef: VALVE.minReef + 3 }).length === 1);
check('the valve is gone once Lv3 (maxLevel) is owned', valveRows({ valveLevel: VALVE.maxLevel }).length === 0);
check('the row offers the NEXT level', valveRows({ valveLevel: 1 })[0].label.includes('Lv2'));
check('the row names the crush depth the next level reaches',
  valveRows({ valveLevel: 1 })[0].label.includes(String(crushDepthM(2))));
check('the Lv1 row costs VALVE.cost', valveRows()[0].cost === VALVE.cost);
check('each level costs double the last', valveRows({ valveLevel: 1 })[0].cost === VALVE.cost * 2);
check('Lv2 -> Lv3 costs quadruple the base', valveRows({ valveLevel: 2 })[0].cost === VALVE.cost * 4);

// --- Buying it: the REAL _shopBuy branch deducts gold and bumps the level. ---
{
  const stub = shopStub();
  stub.shopSel = Reef.prototype._shopItems.call(stub).findIndex((it) => it.kind === 'valve');
  stub._shopItems = () => Reef.prototype._shopItems.call(stub);
  stub.gold = VALVE.cost;
  stub.audio = { select() {}, gasp() {}, bank() {} };
  stub.particles = { sparkle() {} };
  Reef.prototype._shopBuy.call(stub);
  check('buying the valve increments the level', stub.valveLevel === 1);
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
  check('too little gold buys nothing', broke.valveLevel === 0 && broke.gold === VALVE.cost - 1);
  check('too little gold shows the deny flash', broke.shopDeny > 0);
  check('too little gold records no purchase', broke.runValveBought === 0);
}

// --- Purchase telemetry. Two 0-or-1 per-run flags feed the lifetime counters
// legacy:valveOffered / legacy:valveBought, whose ratio is the attach rate.
// The OFFER is recorded in _openShop, not in _shopItems: that builder runs
// every frame while the shop is drawn and must stay side-effect-free. ---
function openStub(over = {}) {
  return {
    _shell: {}, audio: { select() {} }, reef: VALVE.minReef, valveLevel: 0,
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
check('opening the shop when Lv3 (maxLevel) is already owned records no offer',
  offerOf({ valveLevel: VALVE.maxLevel }) === 0);
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
check('the counters are exactly 0 or 1 — one run can buy at most one valve level',
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
