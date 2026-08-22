// Reef-intro "new threat" support: fauna display info covers every spawnable
// kind, and the reef-unlock helpers report genuine new arrivals per reef.
// Run: node tests/game/reef-intro.test.mjs

import { ZONE_FAUNA, FAUNA_INFO, faunaInfo, newFaunaAtReef, faunaKindsUpTo } from '../../src/entities/spawn.js';
import { RELIC, RELIC_INFO, WHIRL } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Every kind used anywhere in ZONE_FAUNA has display info ---
const allKinds = new Set();
for (const band of Object.keys(ZONE_FAUNA)) for (const e of ZONE_FAUNA[band]) allKinds.add(e.k);
for (const k of allKinds) check(`FAUNA_INFO has ${k}`, FAUNA_INFO[k] && FAUNA_INFO[k].name && FAUNA_INFO[k].glyph);
check('faunaInfo returns null for unknown', faunaInfo('dragon') === null);

// --- Reef-band new arrivals unlock at the expected reefs ---
const at2 = newFaunaAtReef(2);
check('piranha is new at reef 2', at2.includes('piranha'));
check('moray is new at reef 2', at2.includes('moray'));
check('shark is NOT new at reef 2 (reef-1 baseline)', !at2.includes('shark'));
check('octopus is NOT new at reef 2', !at2.includes('octopus'));

const at3 = newFaunaAtReef(3);
check('grouper is new at reef 3', at3.includes('grouper'));
check('electric ray is new at reef 3', at3.includes('ray'));
check('piranha is not "new" again at reef 3', !at3.includes('piranha'));

// --- A kind is new at exactly one reef ---
const reef2set = new Set(at2), reef3set = new Set(at3);
check('new-arrival sets are disjoint across reefs', ![...reef2set].some((k) => reef3set.has(k)));

// --- Availability is cumulative ---
check('piranha NOT available at reef 1', !faunaKindsUpTo(1).includes('piranha'));
check('piranha available at reef 2', faunaKindsUpTo(2).includes('piranha'));
check('urchin available by reef 5', faunaKindsUpTo(5).includes('urchin'));
check('new-at-reef ⊆ available-up-to-reef', newFaunaAtReef(4).every((k) => faunaKindsUpTo(4).includes(k)));

// --- Everything the helpers surface is announceable ---
for (let r = 2; r <= 8; r++) for (const k of newFaunaAtReef(r)) check(`reef ${r} new kind ${k} has info`, !!FAUNA_INFO[k]);

// --- Relic + whirlpool config ---
for (const t of RELIC.types) check(`RELIC_INFO covers ${t}`, RELIC_INFO[t] && RELIC_INFO[t].name && RELIC_INFO[t].glyph);
check('WHIRL.lives is a positive integer', Number.isInteger(WHIRL.lives) && WHIRL.lives >= 1);
check('WHIRL.hitInvuln is positive', WHIRL.hitInvuln > 0);

console.log(`reef-intro: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
