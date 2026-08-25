// Siren's Lure sets a per-run flag via applyLoadout, cleared by resetRelicFlags.
import { getRelic, applyLoadout, resetRelicFlags } from '../../src/meta/relics.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const siren = getRelic('siren');
check(!!siren && siren.cost > 0, 'siren relic exists with a cost');

const g = {};
resetRelicFlags(g);
check(g._relicSirenLure === false, 'reset defaults the flag off');

applyLoadout(g, ['siren']);
check(g._relicSirenLure === true, 'equipping siren sets the flag');

applyLoadout(g, []);                 // re-applying an empty loadout clears it
check(g._relicSirenLure === false, 'unequipping clears the flag');
console.log(`ok siren-relic.test.mjs (${pass} checks)`);
