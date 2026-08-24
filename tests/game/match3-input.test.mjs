// KEYMAP bindings the match-3 module + menu launcher rely on. KEYMAP lives in
// config.js (input.js imports it from there); KeyM is already `mute`, so the
// launcher is KeyN.
import { KEYMAP } from '../../src/config.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

check(Array.isArray(KEYMAP.match3) && KEYMAP.match3.includes('KeyN'), 'N opens match3');
check(!KEYMAP.match3.includes('KeyM'), 'match3 does not collide with mute (KeyM)');
check(Array.isArray(KEYMAP.back) && KEYMAP.back.length > 0, 'back action exists');
check(Array.isArray(KEYMAP.confirm) && KEYMAP.confirm.includes('Space'), 'confirm action exists (Space)');

console.log(`ok match3-input.test.mjs (${pass} checks)`);
