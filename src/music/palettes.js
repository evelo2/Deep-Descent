// @ts-check
// The score's data layer. Five palettes, each a plain object so tuning by ear is
// a number edit rather than a code change, plus the pure maths that turns a
// palette into frequencies. Deliberately free of Web Audio so it can be tested
// under plain Node.

// scale: semitone offsets from root, the notes this palette may use.
// chords: each entry is a list of SCALE DEGREES (indices into `scale`); degrees
//   past the end of the scale wrap up an octave, so [0,2,4,7] is a spread voicing.
// filterBase/filterDepth: lowpass cutoff floor and the range the LFO sweeps.
// motifPerMinute: how often a bell motif fires — sparse is the point.
export const PALETTES = {
  // Consonant, wide, wondering. Kelp forests and glowing shoals.
  beauty: {
    root: 174.61, scale: [0, 2, 4, 7, 9], chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 3, 5]],
    chordSeconds: 14, padWave: 'triangle', detuneCents: 6, filterBase: 900, filterDepth: 700,
    subFreq: 43.65, motifPerMinute: 9, motifWave: 'sine', reverbSeconds: 6, sendLevel: 0.55,
  },
  // Minor with a suspended second grinding underneath. Volcanic and frozen.
  dread: {
    root: 146.83, scale: [0, 2, 3, 5, 7, 10], chords: [[0, 2, 4], [0, 1, 4], [3, 5, 0], [2, 4, 6]],
    chordSeconds: 16, padWave: 'sawtooth', detuneCents: 9, filterBase: 520, filterDepth: 480,
    subFreq: 36.71, motifPerMinute: 6, motifWave: 'triangle', reverbSeconds: 7, sendLevel: 0.6,
  },
  // Dissonant clusters and a tritone. Haunted wrecks, rusted junk, the abyss.
  horror: {
    root: 138.59, scale: [0, 1, 3, 6, 8, 11], chords: [[0, 1, 3], [0, 3, 5], [1, 2, 4], [0, 2, 5]],
    chordSeconds: 18, padWave: 'sawtooth', detuneCents: 14, filterBase: 380, filterDepth: 420,
    subFreq: 34.65, motifPerMinute: 4, motifWave: 'square', reverbSeconds: 8, sendLevel: 0.7,
  },
  // Open fifths and octaves, choral, enormous. The temple.
  sacral: {
    root: 164.81, scale: [0, 2, 5, 7, 9], chords: [[0, 2, 4], [0, 2, 5], [1, 3, 5]],
    chordSeconds: 20, padWave: 'sine', detuneCents: 4, filterBase: 1100, filterDepth: 500,
    subFreq: 41.20, motifPerMinute: 5, motifWave: 'sine', reverbSeconds: 9, sendLevel: 0.75,
  },
  // Close, dry, low, pulsing — you are inside something alive. The belly.
  organic: {
    root: 110.0, scale: [0, 3, 5, 7, 10], chords: [[0, 2, 3], [1, 3, 4], [0, 1, 3]],
    chordSeconds: 9, padWave: 'triangle', detuneCents: 11, filterBase: 300, filterDepth: 260,
    subFreq: 27.50, motifPerMinute: 12, motifWave: 'sine', reverbSeconds: 3, sendLevel: 0.25,
  },
};

// Zones that impose their own score regardless of which reef you came in from.
const ZONE_PALETTE = { abyss: 'horror', temple: 'sacral', belly: 'organic' };

// Audio must never be able to break a dive, so anything unrecognised lands here.
const FALLBACK = 'dread';

// The single place the mapping lives: a zone override if there is one, else the
// reef theme's own palette, else the fallback.
export function paletteFor(zone, musicId) {
  const z = ZONE_PALETTE[zone];
  if (z) return z;
  return PALETTES[musicId] ? musicId : FALLBACK;
}

// Equal temperament: n semitones above (or below) a root frequency.
export function noteFreq(root, semitones) {
  return root * Math.pow(2, semitones / 12);
}

// A chord's frequencies, low to high. Degrees past the end of the scale wrap up
// an octave, which is what lets a 5-note scale voice a spread triad.
export function chordFreqs(palette, chordIndex) {
  const chord = palette.chords[((chordIndex % palette.chords.length) + palette.chords.length) % palette.chords.length];
  const n = palette.scale.length;
  return chord.map((deg) => {
    const octave = Math.floor(deg / n);
    return noteFreq(palette.root, palette.scale[deg % n] + 12 * octave);
  });
}
