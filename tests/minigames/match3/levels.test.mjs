import { LEVELS, getLevel, leftoverBonus, TILE_NAMES } from '../../../src/minigames/match3/levels.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

check(LEVELS.length === 5, 'five levels in v1');
check(LEVELS.every((l) => l.goalType === 'collect'), 'all collect goals');
check(LEVELS.every((l) => l.targetTile >= 0 && l.targetTile < 6), 'valid target tiles');
check(LEVELS.every((l) => l.moves > 0 && l.targetCount > 0 && l.reward > 0), 'positive params');
check(getLevel(0).id === 1 && getLevel(5) === null, 'getLevel bounds');
check(leftoverBonus(0) === 0 && leftoverBonus(4) > 0, 'leftover bonus scales');
check(TILE_NAMES.length === 6, 'six tile names');
console.log(`ok levels.test.mjs (${pass} checks)`);
