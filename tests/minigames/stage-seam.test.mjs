// The stage seam (Phase 5): a REAL Game constructed with the DiverWorld engine
// drives the extracted Stage MiniGame through the `reef` facade — proving enter/
// update/exit route the camera through host.world, loot into the reef carried
// pile, a stage death through the reef's real _loseLife (the stage DOES cost
// run-lives), and completion through snapshot/restore + entrance consume. Run:
//   node tests/minigames/stage-seam.test.mjs

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null };

import { Game } from '../../src/game.js';
import { WORLD } from '../../src/config.js';
import { THEMES } from '../../src/stage/themes.js';
import { makeDiverWorld } from '../../src/core/world/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const noop = new Proxy({}, { get: () => () => {} });
const input = { vector: () => ({ x: 0, y: 0 }), firePress: false, consumeTapFire: () => false, consumeButton: () => false, endFrame() {} };
const services = {
  economy: { state: { salvage: 0 }, earn() {} },
  progression: { badges: {}, stats: {}, progress: {} },
  achievements: { unlock() {} },
};
const world = makeDiverWorld({ viewport: WORLD });
const game = new Game(noop, input, noop, { sparkle() {} }, noop, services, world);

check('game._stage was constructed', !!game._stage && game._stage.id === 'stage');

// Seed run-local fields, then enter a stage through a fabricated reef portal.
Object.assign(game, { score: 0, carried: 0, lives: 3, reef: 1, state: 'playing' });
const entrance = { x: 1200, y: 2000, theme: THEMES[0], contains: () => true };
game.stageEntrances = [entrance];
world.camX = 55; world.camY = 66;   // dirty camera to prove enter() zeroes it
game._stage.enter(entrance);

check('enter set the zone to stage', game.zone === 'stage');
check('enter built a real Stage', !!game._stage.stage && !!game._stage.stage.body);
check('enter zeroed the camera via host.world', world.camX === 0 && world.camY === 0);
check('enter recorded the entrance', game._stage.enteredEntrance === entrance);

// Loot event → the reef carried pile grows (facade set routes to Game.carried).
game._stage.stage = { body: { x: 1, y: 2 }, update: () => ({ loot: 9 }), respawn() {} };
game._stage.update(1 / 60);
check('loot routed into the reef carried pile', game.carried === 9);

// A survivable stage death spends a real run-life through the reef's _loseLife.
const livesBefore = game.lives;
let respawned = false;
game._stage.stage = { body: { x: 1, y: 2 }, update: () => ({ died: true }), respawn() { respawned = true; } };
game._stage.update(1 / 60);
check('a stage death costs a real run-life', game.lives === livesBefore - 1);
check('survived the death → respawned at room start', respawned === true && game.state === 'playing');

// Completing the stage restores the reef and consumes the entrance (one-shot).
game._stage.stage = { body: { x: 1, y: 2 }, update: () => ({ exited: 'complete' }), respawn() {} };
game._stage.update(1 / 60);
check('completion restored the reef zone', game.zone === 'reef');
check('the entrance was consumed (one-shot)', !game.stageEntrances.includes(entrance));
check('the stage instance was cleared', game._stage.stage === null);

console.log(`stage-seam: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
