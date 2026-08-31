// Music mutes independently of SFX. This locks the binding, the prompt in every
// control scheme, and the toggle's effect on the Audio facade — the parts that
// can be wrong silently. Run: node tests/game/music-toggle.test.mjs

import { KEYMAP } from '../../src/config.js';
import { prompt, controlsHelpLines, SCHEMES } from '../../src/controls.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- The binding ------------------------------------------------------------
check('music has a key binding', Array.isArray(KEYMAP.music) && KEYMAP.music.length > 0);
check('music does not collide with mute', !KEYMAP.music.some((c) => KEYMAP.mute.includes(c)));
check('music does not collide with the match-3 launcher', !KEYMAP.music.some((c) => KEYMAP.match3.includes(c)));
check('music does not collide with any other action', (() => {
  const others = Object.entries(KEYMAP).filter(([k]) => k !== 'music').flatMap(([, v]) => v);
  return !KEYMAP.music.some((c) => others.includes(c));
})());

// --- The legend is truthful in every scheme ---------------------------------
for (const s of SCHEMES) {
  check(`${s}: music has a prompt`, typeof prompt(s, 'music') === 'string' && prompt(s, 'music').length > 0);
  check(`${s}: the music prompt differs from mute's`, prompt(s, 'music') !== prompt(s, 'mute'));
}
check('the help screen mentions music', controlsHelpLines('keyboard').some((l) => /music/i.test(l)));

// --- The Audio facade toggles music alone -----------------------------------
{
  const { Audio } = await import('../../src/audio.js');
  const a = new Audio();
  const seen = [];
  a.music = { setMuted: (m) => seen.push(m) };      // stand in for the engine
  check('music starts unmuted', a.musicMuted === false);
  check('toggling reports the new state', a.toggleMusicMuted() === true);
  check('toggling mutes the engine', seen[seen.length - 1] === true);
  check('toggling again unmutes', a.toggleMusicMuted() === false && seen[seen.length - 1] === false);
  check('toggling music leaves the SFX mute alone', a.muted === false);
}

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok music-toggle.test.mjs (${passed} checks)`);
