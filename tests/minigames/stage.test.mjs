// Platformer Stage MiniGame (Phase 5 extraction). The stage's enter/update/
// render/exit + its Stage-engine wiring now live in src/minigames/stage/index.js
// as a delegated module driven by the legacy reef through the `reef` facade,
// against host.world (camera/air) + host.input/audio/particles. This drives the
// MODULE directly. Run: node tests/minigames/stage.test.mjs

import { makeStage } from '../../src/minigames/stage/index.js';
import { THEMES } from '../../src/stage/themes.js';
import { STAGE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const mkHost = () => {
  const calls = [];
  return {
    _calls: calls,
    world: { diver: { x: 0, y: 0 }, camX: 5, camY: 7, air: 80, airMax: 100 },
    audio: new Proxy({}, { get: (_, k) => () => calls.push(k) }),
    particles: { sparkle() { calls.push('sparkle'); } },
    input: { vector: () => ({ x: 0, y: 0 }), firePress: false, consumeTapFire: () => false, consumeButton: () => false },
    viewport: { W: 900, H: 600, WW: 2760, WH: 4200 },
  };
};
const mkReef = () => ({
  carried: 0, score: 0, lives: 3, shake: 0, flash: 0, zoneFade: 0, zone: 'reef',
  state: 'playing', t: 0, reefNum: 1, controlScheme: 'keyboard', fireGrace: 0,
  stageEntrances: [],
  snapshotReef() { this._snap = true; }, restoreReef() { this._restored = true; },
  loseLife() { this._lostLife = true; },   // default: survivable (state stays 'playing')
  consumeStageEntrance(e) { this.stageEntrances = this.stageEntrances.filter((x) => x !== e); },
  drawChrome() {},
});
const mkEntrance = () => ({ x: 1000, y: 2000, theme: THEMES[0], contains: () => true });

// --- enter(): snapshots the reef, builds a real Stage, zeroes the camera ---
{
  const host = mkHost(), reef = mkReef();
  const w = makeStage({ host, reef });
  check('id is stage', w.id === 'stage');
  const e = mkEntrance();
  reef.stageEntrances.push(e);
  w.enter(e);
  check('enter set the zone to stage', reef.zone === 'stage');
  check('enter snapshotted the reef', reef._snap === true);
  check('enter built a Stage with a body', !!w.stage && !!w.stage.body && typeof w.stage.body.x === 'number');
  check('enter fixed the camera to origin (host.world)', host.world.camX === 0 && host.world.camY === 0);
  check('enter recorded the entered entrance', w.enteredEntrance === e);
  check('enter armed the zone transition fx', reef.shake === 8 && reef.zoneFade === 1);
  check('enter played the select sfx', host._calls.includes('select'));
}

// --- update() loot event → adds to the reef carried pile + pearl sfx ---
{
  const host = mkHost(), reef = mkReef();
  const w = makeStage({ host, reef });
  w.enter(mkEntrance());
  w.stage = { body: { x: 1, y: 2 }, update: () => ({ loot: 7 }), respawn() {} };
  w.update(1 / 60);
  check('loot is added to the reef carried pile', reef.carried === 7);
  check('loot sparkles + plays the pearl sfx', host._calls.includes('sparkle') && host._calls.includes('pearl'));
}

// --- update() death (survivable) → costs a run-life, then respawns ---
{
  const host = mkHost(), reef = mkReef();
  const w = makeStage({ host, reef });
  w.enter(mkEntrance());
  let respawned = false;
  w.stage = { body: { x: 1, y: 2 }, update: () => ({ died: true }), respawn() { respawned = true; } };
  w.update(1 / 60);
  check('a stage death costs a run-life (reef.loseLife called)', reef._lostLife === true);
  check('death flashes + shakes + plays hit', reef.flash === 1 && reef.shake === 12 && host._calls.includes('hit'));
  check('still alive → respawn at room start', respawned === true);
}

// --- update() death (fatal) → loseLife ends the run, NO respawn ---
{
  const host = mkHost(), reef = mkReef();
  reef.loseLife = function () { this._lostLife = true; this.state = 'gameover'; };
  const w = makeStage({ host, reef });
  w.enter(mkEntrance());
  let respawned = false;
  w.stage = { body: { x: 1, y: 2 }, update: () => ({ died: true }), respawn() { respawned = true; } };
  w.update(1 / 60);
  check('a fatal death does NOT respawn (run over)', respawned === false);
}

// --- update() complete → exit(): restores the reef, consumes the entrance ---
{
  const host = mkHost(), reef = mkReef();
  const w = makeStage({ host, reef });
  const e = mkEntrance();
  reef.stageEntrances.push(e);
  w.enter(e);
  w.stage = { body: { x: 1, y: 2 }, update: () => ({ exited: 'complete' }), respawn() {} };
  w.update(1 / 60);
  check('completing the stage restored the reef', reef._restored === true);
  check('the entered entrance was consumed (one-shot)', !reef.stageEntrances.includes(e));
  check('the stage instance was cleared', w.stage === null && w.enteredEntrance === null);
  check('a fire-grace was set so the exit press does not fire in the reef', reef.fireGrace === 0.3);
}

// --- Only completion exits — a bare frame with no event keeps playing ---
{
  const host = mkHost(), reef = mkReef();
  const w = makeStage({ host, reef });
  w.enter(mkEntrance());
  w.stage = { body: { x: 1, y: 2 }, update: () => ({}), respawn() {} };
  w.update(1 / 60);
  check('no event → still in the stage', reef.zone === 'stage' && w.stage !== null);
}

console.log(`stage(minigame): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
