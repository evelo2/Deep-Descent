// The one-time warning modals. Each fires the FIRST time the diver approaches a
// danger line, pauses the action, and never fires again — the flag persists in
// salvage.v2. Run: node tests/game/depth-warning.test.mjs

import { DEPTH, crushDepthM } from '../../src/config.js';
import { warnKindFor } from '../../src/minigames/reef/warnings.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const unseen = () => ({ oxygenLine: false, crushLine: false });

check('nothing to warn about in the shallows', warnKindFor(50, 0, unseen()) === null);
check('approaching the oxygen line warns once',
  warnKindFor(DEPTH.oxygenLineM - 10, 0, unseen()) === 'oxygenLine');
check('already-seen oxygen line does not warn again',
  warnKindFor(DEPTH.oxygenLineM - 10, 0, { oxygenLine: true, crushLine: false }) === null);
check('approaching crush depth warns',
  warnKindFor(crushDepthM(0) - DEPTH.approachWarnM + 5, 0, unseen()) === 'crushLine');
check('the crush warning outranks the oxygen one when both are due',
  warnKindFor(crushDepthM(0) - 5, 0, unseen()) === 'crushLine');
check('a higher Valve level moves the crush warning deeper',
  warnKindFor(crushDepthM(0) - 5, 3, { oxygenLine: true, crushLine: false }) === null);
check('and it still fires at that level\'s own line',
  warnKindFor(crushDepthM(3) - 5, 3, { oxygenLine: true, crushLine: false }) === 'crushLine');
check('both seen means silence forever',
  warnKindFor(crushDepthM(0) + 100, 0, { oxygenLine: true, crushLine: true }) === null);
check('a null seen is treated as nothing seen (does not throw)',
  warnKindFor(crushDepthM(0) - 5, 0, null) === 'crushLine');
check('an undefined seen is treated as nothing seen (does not throw)',
  warnKindFor(50, 0, undefined) === null);

console.log(`ok depth-warning.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
