import { STAGE } from '../../src/config.js';
import { StageEntrance } from '../../src/entities/stageentrance.js';
import { getTheme } from '../../src/stage/themes.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const e = new StageEntrance(500, 400, getTheme('ship'));
assert('stores theme', e.theme.key === 'ship');
assert('has radius', e.r === STAGE.entranceR);
assert('contains: near diver true', e.contains({ x: 505, y: 405, radius: 15 }) === true);
assert('contains: far diver false', e.contains({ x: 900, y: 900, radius: 15 }) === false);
done();
