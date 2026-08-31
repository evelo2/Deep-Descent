// The score's data layer: five palettes, the zone/theme selection rule, and the
// harmony maths. All pure — no AudioContext exists in Node, and none is needed
// to prove that the right palette is chosen or that a chord is in tune.
// Run: node tests/audio/palettes.test.mjs

globalThis.document = { getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

import { PALETTES, paletteFor, noteFreq, chordFreqs } from '../../src/music/palettes.js';
import { REEF_THEMES } from '../../src/minigames/reef/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const IDS = ['beauty', 'dread', 'horror', 'sacral', 'organic'];

// --- The table itself -------------------------------------------------------
check('all five palettes exist', IDS.every((id) => PALETTES[id]));
check('no extra palettes crept in', Object.keys(PALETTES).length === IDS.length);
for (const id of IDS) {
  const p = PALETTES[id];
  check(`${id}: has a root in the audible bass`, p.root > 30 && p.root < 500);
  check(`${id}: has a non-empty scale of semitones`, Array.isArray(p.scale) && p.scale.length >= 3
    && p.scale.every((s) => Number.isInteger(s) && s >= 0 && s < 24));
  check(`${id}: has at least two chords`, Array.isArray(p.chords) && p.chords.length >= 2
    && p.chords.every((c) => Array.isArray(c) && c.length >= 2));
  check(`${id}: chords hold long enough to be ambient`, p.chordSeconds >= 6);
  check(`${id}: sub sits below 80 Hz`, p.subFreq > 20 && p.subFreq < 80);
  check(`${id}: filter range is audible`, p.filterBase > 100 && p.filterBase + p.filterDepth < 12000);
  check(`${id}: reverb tail is long`, p.reverbSeconds >= 3 && p.reverbSeconds <= 10);
  check(`${id}: motifs are sparse`, p.motifPerMinute > 0 && p.motifPerMinute <= 30);
  check(`${id}: has a detune spread`, p.detuneCents > 0 && p.detuneCents < 50);
  check(`${id}: names a pad waveform`, ['sine', 'triangle', 'sawtooth', 'square'].includes(p.padWave));
}

// --- Selection: zones override, reefs follow their theme --------------------
check('the abyss forces horror', paletteFor('abyss', 'beauty') === 'horror');
check('the temple is sacral', paletteFor('temple', 'beauty') === 'sacral');
check('the belly is organic', paletteFor('belly', 'beauty') === 'organic');
check('the reef plays its theme palette', paletteFor('reef', 'beauty') === 'beauty');
check('stage keeps the reef palette', paletteFor('stage', 'horror') === 'horror');
check('whirlpool keeps the reef palette', paletteFor('whirlpool', 'dread') === 'dread');
check('an unknown palette id falls back rather than throwing', PALETTES[paletteFor('reef', 'nope')]);
check('a missing palette id falls back rather than throwing', PALETTES[paletteFor('reef', undefined)]);
check('an unknown zone is treated as a reef', paletteFor('somewhere-new', 'beauty') === 'beauty');

// --- Every reef theme must name a real palette (guards adding a 7th theme) ---
check('there are still six reef themes', REEF_THEMES.length === 6);
for (const t of REEF_THEMES)
  check(`reef theme ${t.key} names a real palette`, typeof t.music === 'string' && !!PALETTES[t.music]);

// --- Harmony ----------------------------------------------------------------
check('an octave up doubles the frequency', Math.abs(noteFreq(220, 12) - 440) < 1e-9);
check('an octave down halves it', Math.abs(noteFreq(440, -12) - 220) < 1e-9);
check('unison is unchanged', noteFreq(220, 0) === 220);
check('a fifth is about 1.4983x', Math.abs(noteFreq(100, 7) / 100 - 1.498307) < 1e-5);
{
  const p = PALETTES.dread;
  const f = chordFreqs(p, 0);
  check('a chord has one frequency per voice', f.length === p.chords[0].length);
  check('chord frequencies are all audible', f.every((x) => x > 20 && x < 20000));
  check('chord voices ascend', f.every((x, i) => i === 0 || x > f[i - 1]));
  check('chord index wraps instead of running off the end',
    chordFreqs(p, p.chords.length).length === chordFreqs(p, 0).length);
}

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok palettes.test.mjs (${passed} checks)`);
