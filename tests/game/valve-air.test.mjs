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
import { WORLD, AIR, VALVE } from '../../src/config.js';

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

// --- The shop row: a one-off unlock, reef-gated, gone once owned. Driven
// through the REAL _shopItems() so the gate itself is what is under test. ---
function shopStub(over = {}) {
  return {
    shopWhere: 'boat', carried: 0, carriedPearls: 0, atBell: null, _relicBellFull: false,
    reef: VALVE.minReef, gold: 5000, owned: new Set(['harpoon', 'net']),
    weaponLevel: { harpoon: 3, net: 3 }, harpoonAmmo: 30, harpoonMax: 30, harpoonCapLevel: 3,
    speargunAmmo: 0, chargeAmmo: 0, chargeMax: 1, chargeCapLevel: 0, aimLevel: 9,
    tankLevel: 9, flares: 3, hasTorch: true, hasValve: false, buffT: {},
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
}

console.log(`valve-air: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
