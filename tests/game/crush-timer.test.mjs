// The crush timer: below your Valve's crush depth an alarm starts and a 14 s
// countdown runs. Reaching zero ends the dive outright, ignoring lives (spec
// locked decision 4). Returning to safe water recovers the timer GRADUALLY —
// 1 s per 1.5 s — which is the anti-yo-yo rule (locked decision 5).
// Run: node tests/game/crush-timer.test.mjs

import { DEPTH, crushDepthM, crushStep, crushRecover } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const fresh = () => ({ phase: 'safe', t: DEPTH.crushTimer });

// --- entering the crush band ----------------------------------------------
let s = crushStep(fresh(), 300, 0, 0.1);
check('safe above crush depth', s.phase === 'safe');
check('a safe diver keeps a full timer', s.t === DEPTH.crushTimer);

s = crushStep(fresh(), 500, 0, 0.1);
check('crossing 400 m with no valve raises the alarm', s.phase === 'alarmed');
check('the timer starts running down immediately', s.t < DEPTH.crushTimer);

s = crushStep(fresh(), 500, 1, 0.1);
check('Lv1 is safe at 500 m', s.phase === 'safe');
s = crushStep(fresh(), 900, 1, 0.1);
check('Lv1 alarms at 900 m', s.phase === 'alarmed');
s = crushStep(fresh(), 1750, 3, 0.1);
check('Lv3 is safe at 1750 m — the tier-4 floor is reachable', s.phase === 'safe');

// --- exactly at the line is safe; a metre past is not ---------------------
check('exactly at crush depth is safe',
  crushStep(fresh(), crushDepthM(0), 0, 0.1).phase === 'safe');
check('one metre below crush depth alarms',
  crushStep(fresh(), crushDepthM(0) + 1, 0, 0.1).phase === 'alarmed');

// --- the countdown and death ----------------------------------------------
s = fresh();
for (let i = 0; i < 139; i++) s = crushStep(s, 500, 0, 0.1);   // 13.9 s
check('still alarmed just before the timer expires', s.phase === 'alarmed');
check('the timer has nearly run out', s.t < 0.2);
s = crushStep(s, 500, 0, 0.2);
check('the timer reaching zero crushes the diver', s.phase === 'crushed');
check('a crushed diver stays crushed even after ascending',
  crushStep(s, 10, 0, 0.1).phase === 'crushed');

// --- gradual recovery: the anti-yo-yo rule --------------------------------
s = fresh();
for (let i = 0; i < 40; i++) s = crushStep(s, 500, 0, 0.1);    // 4 s down -> t = 10
const spent = DEPTH.crushTimer - s.t;
check('four seconds below the line spends four seconds of timer', Math.abs(spent - 4) < 0.05);
s = crushStep(s, 100, 0, 3);                                   // 3 s of safe water
check('ascending returns you to safe', s.phase === 'safe');
check('3 s of safe water recovers only 2 s of timer',
  Math.abs(s.t - (DEPTH.crushTimer - 4 + 3 / DEPTH.crushRecoverRatio)) < 0.05);
check('recovery is slower than the drain — dipping costs more than it returns',
  DEPTH.crushRecoverRatio > 1);

// --- recovery never exceeds the maximum -----------------------------------
s = crushStep({ phase: 'safe', t: DEPTH.crushTimer - 1 }, 10, 0, 600);
check('a long safe stretch does not overfill the timer', s.t === DEPTH.crushTimer);

// --- docked recovery: a boat or dive bell shelters like safe water ---------
// Fix round 1: the docked (atStation) path in reef/index.js used to skip
// crushStep entirely, freezing the timer while docked. The fix extracted the
// safe-branch arithmetic into crushRecover() so BOTH crushStep's safe branch
// and the docked path in reef/index.js call the same function — asserted
// here directly (crushStep's own recovery checks above already exercise this
// same code, just reached through crushStep instead of by name).
s = crushRecover({ phase: 'alarmed', t: 5 }, 0.1);
check('docking while alarmed clears the alarm', s.phase === 'safe');

s = crushRecover({ phase: 'alarmed', t: 5 }, 3);
check('docking recovers the timer at 1 s per 1.5 s docked, not instantly',
  Math.abs(s.t - (5 + 3 / DEPTH.crushRecoverRatio)) < 0.05);
check('3 s docked does not fully refill a 5 s-remaining timer', s.t < DEPTH.crushTimer);

s = crushRecover({ phase: 'safe', t: DEPTH.crushTimer - 1 }, 600);
check('recovery while docked never exceeds the maximum', s.t === DEPTH.crushTimer);

// crushRecover takes no depth argument at all — that IS the fix: the docked
// path never consults crushDepthM, so no depth, however far below the crush
// line, can push a docked diver to 'crushed'. A diver who docks with almost
// no time left proves the haven shelters regardless of how deep they are.
s = crushRecover({ phase: 'alarmed', t: 0.05 }, 0.1);
check('a diver docked below their crush depth is not crushed — the haven genuinely shelters',
  s.phase === 'safe' && s.phase !== 'crushed');

console.log(`ok crush-timer.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
