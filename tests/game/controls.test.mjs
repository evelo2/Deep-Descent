// Tests for the control-scheme legend: scheme cycling, keyboard vs shared-pad
// prompt vocabularies, and the built strings. Run: node tests/game/controls.test.mjs

import { SCHEMES, SCHEME_LABEL, isPadScheme, nextScheme, prevScheme, prompt, controlsHelpLines, hintStrip, stageHintStrip } from '../../src/controls.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Schemes + labels. --------------------------------------------------------
check('three schemes', SCHEMES.length === 3 && SCHEMES.join() === 'keyboard,steamdeck,rog');
check('labels present', SCHEME_LABEL.keyboard === 'Keyboard' && SCHEME_LABEL.steamdeck === 'Steam Deck' && SCHEME_LABEL.rog === 'ROG Ally');
check('keyboard is not a pad scheme', isPadScheme('keyboard') === false);
check('steamdeck + rog are pad schemes', isPadScheme('steamdeck') && isPadScheme('rog'));

// --- Cycling wraps in both directions. ---------------------------------------
check('next wraps keyboard→steamdeck→rog→keyboard',
  nextScheme('keyboard') === 'steamdeck' && nextScheme('steamdeck') === 'rog' && nextScheme('rog') === 'keyboard');
check('prev wraps keyboard→rog', prevScheme('keyboard') === 'rog');

// --- Prompt vocabulary: keyboard vs shared pad. ------------------------------
check('keyboard fire is Space / F', prompt('keyboard', 'fire') === 'Space / F');
check('pad fire is A', prompt('steamdeck', 'fire') === 'A' && prompt('rog', 'fire') === 'A');
check('keyboard flare is G, pad flare is LT', prompt('keyboard', 'flare') === 'G' && prompt('rog', 'flare') === 'LT');
check('keyboard torch is T, pad torch is R3', prompt('keyboard', 'torch') === 'T' && prompt('steamdeck', 'torch') === 'R3');
check('steamdeck and rog share the same prompts', prompt('steamdeck', 'swap') === prompt('rog', 'swap'));
check('unknown action → empty string', prompt('keyboard', 'nope') === '');

// --- Built strings pick up the scheme. ---------------------------------------
{
  const kb = controlsHelpLines('keyboard'), pad = controlsHelpLines('rog');
  check('controls help has 7 lines', kb.length === 7);
  check('keyboard help mentions WASD', kb[0].includes('Arrows / WASD'));
  check('pad help mentions the stick, not WASD', pad[0].includes('Left stick') && !pad[0].includes('WASD'));
  check('pad fire line shows A', pad[1].startsWith('Fire — A'));
}
{
  check('keyboard hint strip mentions P / Esc pause', hintStrip('keyboard').includes('P / Esc pause'));
  check('pad hint strip mentions Start pause', hintStrip('rog').includes('Start pause'));
  check('keyboard stage strip has Space jump', stageHintStrip('keyboard').includes('Space jump'));
  check('pad stage strip has A jump', stageHintStrip('steamdeck').includes('A jump'));
}

console.log(`controls: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
