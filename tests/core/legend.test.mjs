// The control legend is built from a manifest's controls.actions, per scheme.
// The shell renders these lines on the briefing + pause overlays (P11.2) — the
// manifest is the only source, so a minigame can never disagree with its legend.
import { legendLines, loadScheme, saveScheme, CONTROLS_KEY } from '../../src/controls.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const actions = [
  { id: 'cursor', label: 'Move cursor', keys: ['Arrows'],         pad: 'D-pad', touch: 'drag' },
  { id: 'swap',   label: 'Swap tiles',  keys: ['Space', 'Enter'], pad: 'A',     touch: 'tap two tiles' },
];

const kb = legendLines('keyboard', actions, false);
check('one line per action', kb.length === 2);
check('keyboard joins multiple keys', kb[1] === 'Swap tiles — Space / Enter');
check('pad schemes use the pad label', legendLines('rog', actions, false)[1] === 'Swap tiles — A');
check('steamdeck shares the pad vocabulary', legendLines('steamdeck', actions, false)[0] === 'Move cursor — D-pad');
check('touch devices use the touch label', legendLines('keyboard', actions, true)[0] === 'Move cursor — drag');
check('an action with no touch label falls back to its scheme label',
  legendLines('keyboard', [{ id: 'x', label: 'Fire', keys: ['F'] }], true)[0] === 'Fire — F');
check('missing actions yield no lines', legendLines('keyboard', undefined, false).length === 0);

// Scheme persistence moved out of game.js so the Core chrome and the shell read
// one source. Storage is injectable so this runs headless.
const store = {};
const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
check('the scheme key is unchanged', CONTROLS_KEY === 'deepdescent.controls');
check('an unset scheme loads as keyboard', loadScheme(storage) === 'keyboard');
saveScheme('rog', storage);
check('a saved scheme round-trips', loadScheme(storage) === 'rog');
store[CONTROLS_KEY] = 'not-a-scheme';
check('an unknown stored scheme falls back to keyboard', loadScheme(storage) === 'keyboard');

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok legend.test.mjs (${passed} checks)`);
