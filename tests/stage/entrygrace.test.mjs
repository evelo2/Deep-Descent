// Regression test for the "enter a cavern and the diver instantly exits" bug.
//
// The lair rooms spawn the diver next to the '<' retreat door, so a residual/held
// leftward input at the room transition used to retreat within ~0.07s — you'd
// enter the stage and immediately pop back out. Fix: a STAGE.doorGrace window
// after every spawn (initial + room transitions) during which door tiles are
// ignored, plus a spatial buffer between spawn and the retreat door. This test
// asserts entering + holding any direction can't exit during the grace, while a
// sustained deliberate retreat still works afterwards.
// Run: node tests/stage/entrygrace.test.mjs

import { Stage } from '../../src/stage/stage.js';
import { getTheme } from '../../src/stage/themes.js';
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

check('STAGE.doorGrace is a positive window', STAGE.doorGrace > 0);

// No stage/direction may exit during the grace window (slightly under doorGrace).
const graceProbe = STAGE.doorGrace - 0.05;
for (const theme of ['ship', 'lair']) {
  for (const [dir, mx] of [['idle', 0], ['right', 1], ['left', -1]]) {
    const e = firstExit(theme, mx, graceProbe);
    check(`${theme} hold-${dir}: no exit during door grace`, e === null);
  }
}

// The bug specifically: lair + held-left used to retreat almost immediately.
{
  const e = firstExit('lair', -1, 0.3);
  check('lair hold-left does not retreat in the first 0.3s (was ~0.07s)', e === null);
}

// Feature preserved: a sustained, deliberate hold-left still retreats eventually.
{
  const e = firstExit('lair', -1, 2.0);
  check('lair sustained hold-left still retreats (deliberate)', e && e.kind === 'retreat');
  check('...but only after the grace, not instantly', e && e.t >= STAGE.doorGrace - 0.05);
}

console.log(`entrygrace: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
