// Whirlpool MiniGame (Phase 4 extraction). The whirlpool's state + logic now
// live in src/minigames/whirlpool/index.js as a delegated module driven by the
// legacy reef through the `reef` facade, running against `host.world` +
// `host.economy`. This ports the old tests/game/whirlpool*.test.mjs to drive the
// MODULE directly (the reef-owned toast-queue test moved to a game test).
// Run: node tests/minigames/whirlpool.test.mjs

import { makeWhirlpool } from '../../src/minigames/whirlpool/index.js';
import { WHIRL, whirlpoolReward, PAL } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// A minimal Host: real-shaped world/economy, no-op audio/particles, still input,
// fixed viewport. The pure-logic paths tested here never draw, so no DOM.
const mkHost = () => ({
  world: {
    diver: { x: 0, y: 0, vx: 0, vy: 0, radius: 12, facing: 1, kick: 0, invuln: 0, hurtT: 0 },
    camX: 0, camY: 0, air: 100, airMax: 100,
    placeDiver(x, y, vx) { this.diver.x = x; this.diver.y = y; this.diver.vx = vx; this.diver.vy = 0; this.diver.invuln = 1.6; },
  },
  economy: { state: { salvage: 0 }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } },
  audio: new Proxy({}, { get: () => () => {} }),
  particles: { sparkle() {} },
  input: { vector: () => ({ x: 0, y: 0 }) },
  viewport: { W: 900, H: 600, WW: 2760, WH: 4200 },
});
// A minimal reef facade: plain fields for the get/set members + no-op verbs.
const mkReef = () => ({
  carried: 0, carriedPearls: 0, score: 0, depthReached: 0,
  shake: 0, flash: 0, zoneFade: 0, zone: 'reef', whirlEntrance: { x: 100, y: 200, r: 46 },
  hi: 0, state: 'playing', t: 0, bg: null, ctx: null,
  snapshotReef() {}, restoreReef() {}, bankLoot() {}, toast() {}, text() {}, drawChrome() {},
});

// --- generate(): a usable endless shaft + armed streaming cursors, nothing seeded ---
{
  const w = makeWhirlpool({ host: mkHost(), reef: mkReef() });
  w.generate();
  check('id is whirlpool', w.id === 'whirlpool');
  check('a shaft is defined', !!w.shaft && typeof w.shaft.cx === 'number' && typeof w.shaft.halfW === 'number');
  check('the shaft is endless (no fixed bottom)', w.shaft.bottom === undefined);
  check('a bail-out maw is placed', !!w.bailMaw && typeof w.bailMaw.x === 'number' && typeof w.bailMaw.y === 'number');
  check('obstacles/bubbles/treasures start EMPTY (streamed at run time)',
    w.obstacles.length === 0 && w.bubbles.length === 0 && w.treasures.length === 0);
  check('the density timer + streaming cursors are armed',
    w.elapsed === 0 && w.nextObstacleY > w.shaft.top && w.nextBubbleY > w.shaft.top && w.nextTreasureY > w.shaft.top);
  check('lives armed to WHIRL.lives', w.lives === WHIRL.lives);
}

// --- spawnRow(): low density at ramp 0, denser at ramp 1, within the shaft ---
{
  const w = makeWhirlpool({ host: mkHost(), reef: mkReef() });
  w.generate();
  w.spawnRow(1000, 0);
  check('low starting density: a row at ramp 0 spawns exactly 1 obstacle', w.obstacles.length === 1);
  check('the first obstacle has a valid kind', ['mine', 'jelly', 'star'].includes(w.obstacles[0].kind));

  w.obstacles = [];
  for (let i = 0; i < 40; i++) w.spawnRow(1000 + i * 120, 1);
  check('peak density spawns more obstacles per row than the start', w.obstacles.length > 40);
  check('every obstacle has a valid kind', w.obstacles.every((o) => ['mine', 'jelly', 'star'].includes(o.kind)));
  check('every obstacle sits within the shaft half-width', w.obstacles.every((o) => Math.abs(o.x - w.shaft.cx) <= w.shaft.halfW));
  const kinds = new Set(w.obstacles.map((o) => o.kind));
  check('all three obstacle kinds appear across a large sample', kinds.has('mine') && kinds.has('jelly') && kinds.has('star'));
}

// --- hit(): survives WHIRL.lives-1 hits, the last ends the run; struck rock removed ---
{
  const reef = mkReef();
  const w = makeWhirlpool({ host: mkHost(), reef });
  w.generate();
  w.obstacles = [{ x: 0, y: 0, r: 20 }, { x: 50, y: 0, r: 20 }, { x: 100, y: 0, r: 20 }, { x: 150, y: 0, r: 20 }];
  let ended = false;
  for (let n = 0; n < WHIRL.lives - 1; n++) if (w.hit(0)) ended = true;
  check(`survives the first ${WHIRL.lives - 1} hits`, ended === false);
  check('lives decremented to 1', w.lives === 1);
  check('i-frames set after a hit', w.hitT === WHIRL.hitInvuln);
  check('each hit removed one obstacle', w.obstacles.length === 4 - (WHIRL.lives - 1));
  check('a surviving hit flashes shake + flash on the reef', reef.shake === 12 && reef.flash === 0.6);
  const fatal = w.hit(0);
  check('the final hit returns true (run ends)', fatal === true);
  check('lives now zero', w.lives === 0);
}
{
  const w = makeWhirlpool({ host: mkHost(), reef: mkReef() });
  w.generate();
  w.obstacles = [{ x: 0, y: 0, r: 20 }, { x: 50, y: 0, r: 20 }, { x: 100, y: 0, r: 20 }, { x: 150, y: 0, r: 20 }];
  const target = w.obstacles[2];
  w.hit(2);
  check('the struck obstacle is the one spliced out', !w.obstacles.includes(target));
  check('other obstacles remain', w.obstacles.length === 3);
}

// --- The whirlpool never costs a run-life: the module source cannot even name it ---
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/minigames/whirlpool/index.js', import.meta.url), 'utf8');
  check('module never references _loseLife (obstacle/air-out/bail exits are all free)', !src.includes('_loseLife'));
  check('module never references loseLife at all', !/loseLife/.test(src));
}

// --- exit(): zone-local state resets, no leak into the next run ---
{
  const reef = mkReef();
  const w = makeWhirlpool({ host: mkHost(), reef });
  w.generate();
  w.tier = 5; w.salvageEarned = 99; w.speed = 400; w.rideScore = 123;
  w.bubbles = [{}]; w.treasures = [{}]; w.obstacles = [{}];
  w.exit();
  check('exit resets tier', w.tier === 0);
  check('exit resets salvageEarned', w.salvageEarned === 0);
  check('exit resets speed + rideScore', w.speed === 0 && w.rideScore === 0);
  check('exit clears bubbles + treasures + obstacles', w.bubbles.length === 0 && w.treasures.length === 0 && w.obstacles.length === 0);
  check('exit clears the reef whirlEntrance (portal spent)', reef.whirlEntrance === null);
}

// --- whirlpoolReward(tier): starts at 0, monotonic, positive marginals ---
{
  check('whirlpoolReward(0) === 0', whirlpoolReward(0) === 0);
  const tiers = [0, 1, 2, 3, 4, 5, 6];
  const vals = tiers.map(whirlpoolReward);
  check('whirlpoolReward is monotonic increasing over tiers 0..6', vals.every((v, i) => i === 0 || v > vals[i - 1]));
  check('the marginal per-tier award is positive for every tier 1..6',
    tiers.slice(1).every((n) => whirlpoolReward(n) - whirlpoolReward(n - 1) > 0));
}

// --- WHIRL config sanity ---
{
  check('WHIRL.baseSpeed < WHIRL.maxSpeed (the sweep has room to ramp)', WHIRL.baseSpeed < WHIRL.maxSpeed);
  check('WHIRL.accel is positive', WHIRL.accel > 0);
  check('WHIRL.shaftHalfW / obstacleR are positive', WHIRL.shaftHalfW > 0 && WHIRL.obstacleR > 0);
  check('WHIRL.entranceChance is a valid probability', WHIRL.entranceChance > 0 && WHIRL.entranceChance <= 1);
}

console.log(`whirlpool(minigame): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
