// Threat derivation: pure arithmetic over entity lists, no Web Audio involved.
// Levels are compared with a tolerance — 0.55 + 0.15 is 0.7000000000000001 in
// binary floating point, so exact equality here would be a false failure.
// Run: node tests/audio/threat-level.test.mjs
import { tensionLevel } from '../../src/music/threat.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const near = (a, b) => Math.abs(a - b) < 1e-9;

check('no entities at all is silence', tensionLevel([], [], null) === 0);
check('null lists are tolerated', tensionLevel(null, null, null) === 0);
check('a creature that is not pursuing is silence',
  tensionLevel([{ pursuing: false }], [], null) === 0);
check('one pursuer opens the layer', near(tensionLevel([{ pursuing: true }], [], null), 0.7));
check('two pursuers push it higher',
  near(tensionLevel([{ pursuing: true }, { pursuing: true }], [], null), 0.85));
check('it saturates at 1 and never exceeds it',
  tensionLevel(Array.from({ length: 12 }, () => ({ pursuing: true })), [], null) === 1);
check('a dead pursuer does not count',
  tensionLevel([{ pursuing: true, dead: true }], [], null) === 0);
check('a live kraken always counts', near(tensionLevel([], [{ dead: false }], null), 0.7));
check('a dead kraken does not', tensionLevel([], [{ dead: true }], null) === 0);
check('a live guardian counts', near(tensionLevel([], [], { dead: false, hp: 3 }), 0.7));
check('a spent guardian does not', tensionLevel([], [], { dead: false, hp: 0 }) === 0);
check('sources add together',
  near(tensionLevel([{ pursuing: true }], [{ dead: false }], null), 0.85));

if (failed) { console.error(`FAILED ${failed}`); process.exit(1); }
console.log(`ok threat-level.test.mjs (${passed} checks)`);
