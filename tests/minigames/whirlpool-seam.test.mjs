// The whirlpool seam (Phase 4): a REAL Game constructed with the DiverWorld
// engine + Core services drives the extracted whirlpool MiniGame through the
// `reef` facade. This is the Node-side proof that the delegation is wired
// correctly — enter/update/exit route diver+air through host.world, tier payouts
// through host.economy, and the reef's own loot/score/lives stay reef-side — and
// that the whirlpool still NEVER costs a run-life. Run:
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

// The module was built (world + services present).
check('game._whirl was constructed', !!game._whirl && game._whirl.id === 'whirlpool');
check('shared wallet: game.meta === host.economy.state', game.meta === services.economy.state);

// Seed the run-local reef fields the whirlpool banks into, then dive.
Object.assign(game, { score: 0, carried: 0, carriedPearls: 0, depthReached: 0, reefBanked: 0, gold: 0, bankPulse: 0, blackPearlsBanked: 0, lives: 3, reef: 1, carryingRelic: false, relicBanked: false });
const livesBefore = game.lives;
game.whirlEntrance = { x: 1380, y: 3000, r: 46 };
game._whirl.enter(game.whirlEntrance);

check('enter set the zone to whirlpool', game.zone === 'whirlpool');
check('enter built the shaft', !!game._whirl.shaft && game._whirl.shaft.bottom === undefined);
check('enter armed the sweep at base speed', game._whirl.speed === WHIRL.baseSpeed);
check('enter dropped the diver into the shaft (host.world owns it)', world.diver.x === game._whirl.bailMaw.x && world.diver === game.diver);
const airAtStart = world.air = game.airMax = 100;   // set a known air level to watch it drain

// Step a few frames — the sweep drags the diver down and drains air.
const yBefore = world.diver.y;
for (let i = 0; i < 5; i++) game._whirl.update(1 / 60);
check('the current sweeps the diver downward', world.diver.y > yBefore);
check('air drains during the sweep (host.world.air)', world.air < airAtStart);
check('the density timer advanced', game._whirl.elapsed > 0);
check('still no run-life lost mid-sweep', game.lives === livesBefore);

// Force a speed-break tier crossing → salvage credits through host.economy.
const salvageBefore = services.economy.state.salvage;
game._whirl.speed = WHIRL.baseSpeed + WHIRL.tierStep * 1.5;   // enough for tier 1
game._whirl.update(1 / 60);
check('a tier crossing credits salvage via host.economy.earn', services.economy.state.salvage > salvageBefore);
check('salvageEarned this-ride tracks the payout', game._whirl.salvageEarned > 0);
check('the shared wallet reflects it (game.meta.salvage rose)', game.meta.salvage === services.economy.state.salvage);

// A fatal obstacle hit ends the ride — banking + restoring the reef — but NEVER
// costs a run-life (the whole point of the zone).
game._whirl.lives = 1; game._whirl.hitT = 0;
game._whirl.obstacles = [{ x: world.diver.x, y: world.diver.y, r: 200, kind: 'mine', phase: 0 }];
game._whirl.update(1 / 60);
check('the fatal hit ended the ride (zone restored to reef)', game.zone === 'reef');
check('the whirlpool NEVER cost a run-life', game.lives === livesBefore);
check('exit reset the module state (shaft cleared)', game._whirl.shaft === null && game._whirl.speed === 0);
check('exit consumed the entrance (portal spent)', game.whirlEntrance === null);

console.log(`whirlpool-seam: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
