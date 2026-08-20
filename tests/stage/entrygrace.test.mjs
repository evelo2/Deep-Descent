// Regression test for the "enter a stage and instantly pop back out" class of
// bug. Stages are now COMMIT-AND-FINISH: there is no retreat door, so the only
// way out is reaching the forward exit. Entering and holding ANY direction must
// never exit the stage on its own — you can only leave by completing it.
// (Historically the lair rooms spawned next to a '<' retreat door and a held
// leftward input at the transition popped you straight back out; that door is
// gone, which this test locks in.)
// Run: node tests/stage/entrygrace.test.mjs

import { Stage } from '../../src/stage/stage.js';
import { getTheme, THEMES } from '../../src/stage/themes.js';
import { STAGE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// Hold `moveX` for `secs` and return the frame an exit fired (or null).
function firstExit(theme, moveX, secs) {
  const s = new Stage(getTheme(theme));
  const frames = Math.round(secs * 60);
  for (let f = 0; f < frames; f++) {
    const ev = s.update(1 / 60, { moveX, jump: false, climbY: 0 });
    if (ev.exited) return { frame: f, t: f / 60, kind: ev.exited };
  }
  return null;
}

check('STAGE.doorGrace is a positive window (guards the forward door on room entry)', STAGE.doorGrace > 0);

// No theme, no held direction, may exit just by standing/pushing at spawn: the
// only door is the far-off forward exit, and there is no retreat door to trip.
for (const theme of ['ship', 'lair']) {
  for (const [dir, mx] of [['idle', 0], ['right', 1], ['left', -1]]) {
    const e = firstExit(theme, mx, 3.0);
    check(`${theme} hold-${dir}: never exits the stage on its own`, e === null);
  }
}

// Structural: no room in any theme still contains a retreat door glyph.
for (const th of THEMES) {
  const hasRetreat = th.rooms.some((room) => room.join('').includes('<'));
  check(`${th.key}: no rooms contain a '<' retreat door`, !hasRetreat);
}

console.log(`entrygrace: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
