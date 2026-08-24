// The whirlpool seam (Phase 4; reparented in Phase 6): a REAL Game builds the
// reef MiniGame (game._reef), which in turn builds + owns the whirlpool. This
// drives the whirlpool through the reef's `reef` facade — enter/update/exit route
// diver+air through host.world, tier payouts through host.economy, and the reef's
// own loot/score/lives stay reef-side — and proves the whirlpool NEVER costs a
// run-life. Post-P6 the reef run-state lives on game._reef, not game. Run:
//   node tests/minigames/whirlpool-seam.test.mjs

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null };

import { Game } from '../../src/game.js';
import { WORLD, WHIRL } from '../../src/config.js';
import { makeDiverWorld } from '../../src/core/world/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// Inert deps + minimal Core services (only economy.earn / .state matter here).
const noop = new Proxy({}, { get: () => () => {} });
const services = {
  economy: { state: { salvage: 0 }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } },
  progression: { badges: {}, stats: {}, progress: {} },
  achievements: { unlock() {} },
};
const world = makeDiverWorld({ viewport: WORLD });
const game = new Game(noop, { vector: () => ({ x: 0, y: 0 }), endFrame() {} }, noop, { sparkle() {}, draw() {} }, noop, services, world);
const reef = game._reef;   // P6: the reef MiniGame owns the dive run-state + builds the whirlpool

// The module was built (world + services present).
check('reef._whirl was constructed', !!reef._whirl && reef._whirl.id === 'whirlpool');
check('shared wallet: reef.meta === host.economy.state', reef.meta === services.economy.state);

// Seed the run-local reef fields the whirlpool banks into, then dive.
Object.assign(reef, { score: 0, carried: 0, carriedPearls: 0, depthReached: 0, reefBanked: 0, gold: 0, bankPulse: 0, blackPearlsBanked: 0, lives: 3, reef: 1, carryingRelic: false, relicBanked: false });
const livesBefore = reef.lives;
reef.whirlEntrance = { x: 1380, y: 3000, r: 46 };
reef._whirl.enter(reef.whirlEntrance);

check('enter set the zone to whirlpool', reef.zone === 'whirlpool');
check('enter built the shaft', !!reef._whirl.shaft && reef._whirl.shaft.bottom === undefined);
check('enter armed the sweep at base speed', reef._whirl.speed === WHIRL.baseSpeed);
check('enter dropped the diver into the shaft (host.world owns it)', world.diver.x === reef._whirl.bailMaw.x && world.diver === reef.diver);
const airAtStart = world.air = reef.airMax = 100;   // set a known air level to watch it drain

// Step a few frames — the sweep drags the diver down and drains air.
const yBefore = world.diver.y;
for (let i = 0; i < 5; i++) reef._whirl.update(1 / 60);
check('the current sweeps the diver downward', world.diver.y > yBefore);
check('air drains during the sweep (host.world.air)', world.air < airAtStart);
check('the density timer advanced', reef._whirl.elapsed > 0);
check('still no run-life lost mid-sweep', reef.lives === livesBefore);

// Force a speed-break tier crossing → salvage credits through host.economy.
const salvageBefore = services.economy.state.salvage;
reef._whirl.speed = WHIRL.baseSpeed + WHIRL.tierStep * 1.5;   // enough for tier 1
reef._whirl.update(1 / 60);
check('a tier crossing credits salvage via host.economy.earn', services.economy.state.salvage > salvageBefore);
check('salvageEarned this-ride tracks the payout', reef._whirl.salvageEarned > 0);
check('the shared wallet reflects it (reef.meta.salvage rose)', reef.meta.salvage === services.economy.state.salvage);

// A fatal obstacle hit ends the ride — banking + restoring the reef — but NEVER
// costs a run-life (the whole point of the zone).
reef._whirl.lives = 1; reef._whirl.hitT = 0;
reef._whirl.obstacles = [{ x: world.diver.x, y: world.diver.y, r: 200, kind: 'mine', phase: 0 }];
reef._whirl.update(1 / 60);
check('the fatal hit ended the ride (zone restored to reef)', reef.zone === 'reef');
check('the whirlpool NEVER cost a run-life', reef.lives === livesBefore);
check('exit reset the module state (shaft cleared)', reef._whirl.shaft === null && reef._whirl.speed === 0);
check('exit consumed the entrance (portal spent)', reef.whirlEntrance === null);

console.log(`whirlpool-seam: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
