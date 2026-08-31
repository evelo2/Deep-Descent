# Underwater Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dive's single lowpassed noise loop with a five-palette
procedural score that follows the reef's theme, overrides per zone, reacts to
depth, and mutes independently of SFX.

**Architecture:** A new `src/music/` module: `palettes.js` holds the palette data
and the pure selection/harmony maths; `index.js` holds `class Music`, which owns
a Web Audio graph — detuned pad stacks, a sub drone and aleatoric bell motifs,
all feeding a convolution reverb built from a generated impulse response, summed
into a `musicBus` that `Audio` can mute on its own. Scheduling uses lookahead
against `ctx.currentTime`, never chained `setTimeout`.

**Tech Stack:** Plain ES modules loaded untransformed by the browser (no build
step), Web Audio API, plain-Node `*.test.mjs` scripts, `tsc --noEmit` over
`// @ts-check` files.

**Spec:** `docs/superpowers/specs/2026-08-31-underwater-music-design.md`

## Global Constraints

- **No build step.** The browser loads `src/**/*.js` as written. Do not add a
  bundler, a transpiler, or any npm runtime dependency.
- **No asset files.** `assets/` is empty and stays empty; the impulse response is
  generated in a buffer at runtime. Do not fetch or bundle audio.
- **No new persisted key.** The music toggle is not persisted, matching mute.
  Do not touch `deepdescent.badges.v1`, `deepdescent.stats.v1`,
  `deepdescent.salvage.v2`, `deepdescent.progress.v1`, `deepdescent.controls`.
- **Three incompatible assertion styles exist in `tests/`.** Read the top of any
  file you edit and copy the style already there. All NEW test files in this plan
  use name-first:
  `const check = (name, cond) => cond ? passed++ : (failed++, console.error(\`  FAIL: ${name}\`));`
  and end with `` console.log(`ok <file> (${passed} checks)`) `` plus a non-zero
  exit on failure.
- **New files under `src/music/` start with `// @ts-check`** on line 1.
  `npm run typecheck` must exit 0.
- **Web Audio does not exist in Node.** No test may construct a real
  `AudioContext`. Pure logic is tested directly; the graph is tested against the
  stub built in Task 2.
- **Audio must never break a dive.** Unknown zone or palette id falls back; it
  does not throw.
- Run one test with `node tests/<path>.test.mjs`; run all with
  `for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done`.
  The suite is 93 files and green at the start of this plan.

## File structure

| File | Responsibility |
|---|---|
| `src/music/palettes.js` **(new)** | The five palettes as data; `paletteFor`, `noteFreq`, `chordFreqs`. Pure — no Web Audio. |
| `src/music/index.js` **(new)** | `class Music`: the graph, the voices, the lookahead scheduler, crossfades, depth response. Exports the pure `eventTimes` helper. |
| `src/audio.js` (modify) | Owns a `Music`; adds `startMusic`/`stopMusic`/`setPalette`/`toggleMusicMuted`; forwards `setDepth`. Keeps the noise bed. |
| `src/minigames/reef/index.js` (modify) | `music` field on `REEF_THEMES`; `_applyMusic()` called on dive start, reef roll and every zone change; the music-toggle key. |
| `src/config.js` (modify) | `KEYMAP.music = ['KeyJ']`. |
| `src/input.js` (modify) | Gamepad L3 (button 10) → `music` edge. |
| `src/game.js` (modify) | The touch button and its glyph. |
| `src/controls.js` (modify) | `music` PROMPTS entry so every scheme's legend is truthful. |
| `src/version.js` (modify) | `BUILD` bump. |

New tests: `tests/audio/palettes.test.mjs`, `tests/audio/music-graph.test.mjs`,
`tests/audio/music-voices.test.mjs`, `tests/audio/music-palette-switch.test.mjs`,
`tests/game/music-toggle.test.mjs`.

---

### Task 1: Palette data and the pure selection maths

**Files:**
- Create: `src/music/palettes.js`
- Modify: `src/minigames/reef/index.js:64` (the `REEF_THEMES` table)
- Test: `tests/audio/palettes.test.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PALETTES` — object keyed `beauty|dread|horror|sacral|organic`.
  - `paletteFor(zone: string, musicId: string): string` — the palette id to play.
  - `noteFreq(root: number, semitones: number): number`
  - `chordFreqs(palette: object, chordIndex: number): number[]`
  - Each `REEF_THEMES` entry gains `music: '<palette id>'`.

- [ ] **Step 1: Write the failing test**

Create `tests/audio/palettes.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/audio/palettes.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `src/music/palettes.js`.

- [ ] **Step 3: Create `src/music/palettes.js`**

```js
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
```

- [ ] **Step 4: Add the `music` field to `REEF_THEMES`**

In `src/minigames/reef/index.js:64`, add one field per entry, keeping every
existing field untouched. The comment above the table should note that `music`
names a palette in `src/music/palettes.js`:

```js
  { key: 'kelp',     tag: '🌿', tint: [60, 175, 120], music: 'beauty', adjs: [...
  { key: 'volcanic', tag: '🌋', tint: [220, 95, 55],  music: 'dread',  adjs: [...
  { key: 'frozen',   tag: '❄',  tint: [120, 185, 235], music: 'dread',  adjs: [...
  { key: 'haunted',  tag: '👻', tint: [155, 115, 205], music: 'horror', adjs: [...
  { key: 'neon',     tag: '✨', tint: [90, 220, 215],  music: 'beauty', adjs: [...
  { key: 'junk',     tag: '⚓', tint: [195, 155, 95],  music: 'horror', adjs: [...
```

`REEF_THEMES` is currently module-private. Export it (`export const REEF_THEMES = [`)
so the test can iterate the real table — that iteration is what makes adding a
seventh theme without music a test failure rather than a silent fallback.

- [ ] **Step 5: Run the test and the reef suites**

Run: `node tests/audio/palettes.test.mjs && node tests/minigames/reef.test.mjs && node tests/minigames/reef-seam.test.mjs && npm run typecheck`
Expected: all PASS, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/music/palettes.js src/minigames/reef/index.js tests/audio/palettes.test.mjs
git commit -m "feat(music): five palettes and the pure zone/theme selection rule"
```

---

### Task 2: The graph — reverb, buses, and a stub AudioContext to prove it

**Files:**
- Create: `src/music/index.js`
- Test: `tests/audio/music-graph.test.mjs` (create)

**Interfaces:**
- Consumes: `PALETTES` from Task 1.
- Produces:
  - `class Music { constructor(ctx, destination) }`
  - `music.bus` — the `GainNode` everything sums into.
  - `music.start(paletteId)`, `music.stop()`, `music.setMuted(m)`
  - `eventTimes(prev, interval, from, to): number[]` (pure, used in Task 3)

- [ ] **Step 1: Write the failing test**

Create `tests/audio/music-graph.test.mjs`:

```js
// The music graph, proved against a stub AudioContext. Node has no Web Audio, so
// this records node creation and every connect() and asserts the shape: the
// convolver is in the send path, the bus reaches the destination, muting music
// touches only the bus, and stop() disconnects instead of leaking oscillators.
// Run: node tests/audio/music-graph.test.mjs

import { Music, eventTimes } from '../../src/music/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// A stub AudioContext. Every node records what it is and what it connected to,
// so the test can walk the graph the same way audio would.
function stubCtx() {
  const nodes = [];
  const node = (kind, extra = {}) => {
    const n = {
      kind, _conn: [], _disconnected: false,
      connect(t) { this._conn.push(t); return t; },
      disconnect() { this._disconnected = true; },
      ...extra,
    };
    nodes.push(n);
    return n;
  };
  const param = () => ({ value: 0, _calls: [],
    setValueAtTime(v) { this.value = v; this._calls.push(['set', v]); return this; },
    setTargetAtTime(v) { this.value = v; this._calls.push(['target', v]); return this; },
    linearRampToValueAtTime(v) { this.value = v; this._calls.push(['ramp', v]); return this; },
    exponentialRampToValueAtTime(v) { this.value = v; this._calls.push(['exp', v]); return this; } });
  const ctx = {
    currentTime: 0, sampleRate: 48000, _nodes: nodes,
    destination: node('destination'),
    createGain: () => node('gain', { gain: param() }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(), detune: param(),
      _started: false, _stopped: false, start() { this._started = true; }, stop() { this._stopped = true; } }),
    createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(), Q: param() }),
    createConvolver: () => node('convolver', { buffer: null }),
    createStereoPanner: () => node('panner', { pan: param() }),
    createBufferSource: () => node('bufsrc', { buffer: null, loop: false,
      _started: false, start() { this._started = true; }, stop() {} }),
    createBuffer: (channels, length, rate) => ({
      length, sampleRate: rate, numberOfChannels: channels,
      _data: Array.from({ length: channels }, () => new Float32Array(length)),
      getChannelData(i) { return this._data[i]; },
    }),
  };
  return ctx;
}
const of = (ctx, kind) => ctx._nodes.filter((n) => n.kind === kind);
const reaches = (from, target, seen = new Set()) => {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (from._conn || []).some((n) => reaches(n, target, seen));
};

// --- Construction builds the fixed graph ------------------------------------
{
  const ctx = stubCtx();
  const dest = ctx.destination;
  const m = new Music(ctx, dest);

  check('a convolver is created for the reverb', of(ctx, 'convolver').length === 1);
  const conv = of(ctx, 'convolver')[0];
  check('the convolver is given a generated impulse response', !!conv.buffer);
  check('the impulse response is stereo', conv.buffer.numberOfChannels === 2);
  check('the impulse response is seconds long, not milliseconds',
    conv.buffer.length >= ctx.sampleRate * 2);
  check('the impulse response decays rather than being flat noise', (() => {
    const d = conv.buffer.getChannelData(0);
    const head = Math.abs(d[(d.length * 0.02) | 0]);
    const tail = Math.abs(d[(d.length * 0.95) | 0]);
    return head > tail;
  })());

  check('the music bus exists and reaches the destination', !!m.bus && reaches(m.bus, dest));
  check('the convolver returns into the bus', reaches(conv, m.bus));
  check('nothing is connected straight past the bus to the destination',
    ctx._nodes.filter((n) => n !== m.bus && (n._conn || []).includes(dest)).length === 0);
}

// --- Mute cuts the bus, and only the bus ------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  const before = m.bus.gain.value;
  m.setMuted(true);
  check('muting music drops the bus gain to zero', m.bus.gain.value === 0);
  m.setMuted(false);
  check('unmuting restores a positive bus gain', m.bus.gain.value > 0 && m.bus.gain.value <= before + 1e-9);
}

// --- stop() tears down ------------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('dread');
  const oscs = of(ctx, 'osc');
  check('starting creates oscillators', oscs.length > 0);
  check('every oscillator was started', oscs.every((o) => o._started));
  m.stop();
  check('stopping stops every oscillator it started', of(ctx, 'osc').every((o) => o._stopped));
  check('stopping reports itself as not playing', m.playing === false);
  check('stop is idempotent', (() => { m.stop(); return true; })());
}

// --- eventTimes: the lookahead window ---------------------------------------
check('no event is ever scheduled in the past',
  eventTimes(0, 1, 5, 8).every((t) => t >= 5));
check('events are spaced by the interval', (() => {
  const t = eventTimes(0, 2, 0, 9);
  return t.every((x, i) => i === 0 || Math.abs((x - t[i - 1]) - 2) < 1e-9);
})());
check('events stay inside the window', eventTimes(0, 1, 3, 6).every((t) => t >= 3 && t < 6));
check('an empty window yields nothing', eventTimes(0, 1, 5, 5).length === 0);
check('a window entirely behind us yields nothing', eventTimes(10, 1, 2, 3).length === 0);
check('the window advances monotonically', (() => {
  const a = eventTimes(0, 1, 0, 3), b = eventTimes(a[a.length - 1], 1, 3, 6);
  return b[0] > a[a.length - 1];
})());

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok music-graph.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/audio/music-graph.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `src/music/index.js`.

- [ ] **Step 3: Create `src/music/index.js` with the graph only**

Voices arrive in Task 3; `start()` here creates the sub drone alone, which is
enough to satisfy "starting creates oscillators".

```js
// @ts-check
// The music engine. One fixed graph built at construction:
//
//   voices ──┬── dry ─────────────────┐
//            └── send → Convolver ────┴→ bus → destination
//
// The convolution reverb is the difference between thin and full, and its
// impulse response is generated here rather than fetched — the project ships no
// asset files. Everything sums into `bus` so music can be muted without
// touching SFX.
import { PALETTES } from './palettes.js';

const BUS_GAIN = 0.5;

// The event times inside [from, to) that follow `prev` at `interval` spacing.
// Pure, and the reason scheduling never drifts: callers advance a window against
// ctx.currentTime instead of chaining setTimeout.
export function eventTimes(prev, interval, from, to) {
  const out = [];
  if (interval <= 0) return out;
  for (let t = prev + interval; t < to; t += interval) if (t >= from) out.push(t);
  return out;
}

export class Music {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.playing = false;
    this.muted = false;
    this.depth = 0;
    this.palette = null;
    this._voices = [];      // every node we started, for stop()
    this._timer = null;

    this.bus = ctx.createGain();
    this.bus.gain.value = BUS_GAIN;
    this.bus.connect(destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(6);
    this.reverb.connect(this.bus);

    this.send = ctx.createGain();
    this.send.gain.value = 0.5;
    this.send.connect(this.reverb);

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.bus);
  }

  // A generated impulse response: stereo noise under an exponential decay. Cheap
  // to build, no asset, and it is what gives the score its space.
  _impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.6);
        d[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    this.bus.gain.setTargetAtTime(m ? 0 : BUS_GAIN, this.ctx.currentTime, 0.15);
    if (m) this.bus.gain.value = 0; else this.bus.gain.value = BUS_GAIN;
  }

  start(paletteId) {
    if (this.playing) return;
    this.palette = PALETTES[paletteId] || PALETTES.dread;
    this.playing = true;
    this._startSub();
  }

  // The drone under everything — felt more than heard, and most of "full".
  _startSub() {
    const ctx = this.ctx, p = this.palette;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.subFreq, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 4);
    osc.connect(g).connect(this.dry);
    osc.start();
    this._voices.push({ osc, g });
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    for (const v of this._voices) {
      try { v.osc.stop(); } catch (e) { /* already stopped */ }
      try { v.osc.disconnect(); } catch (e) { /* already gone */ }
    }
    this._voices = [];
  }
}
```

- [ ] **Step 4: Run the test**

Run: `node tests/audio/music-graph.test.mjs && npm run typecheck`
Expected: PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/music/index.js tests/audio/music-graph.test.mjs
git commit -m "feat(music): reverb graph, music bus, and lookahead timing maths"
```

---

### Task 3: The voices — pad stack, motifs, and the scheduler

**Files:**
- Modify: `src/music/index.js`
- Test: `tests/audio/music-voices.test.mjs` (create)

**Interfaces:**
- Consumes: `Music`, `eventTimes` from Task 2; `chordFreqs` from Task 1.
- Produces:
  - `music._chordAt(i)` — starts one chord's pad stack, returns its voice records.
  - `music._motif(when)` — schedules one bell tone.
  - `music._tick()` — the scheduler body; advances the lookahead window.
  - `music.chordIndex` — how many chords have been scheduled.

- [ ] **Step 1: Write the failing test**

Create `tests/audio/music-voices.test.mjs`. Copy the `stubCtx`, `of` and
`reaches` helpers verbatim from `tests/audio/music-graph.test.mjs` (they are
duplicated deliberately — each test file stands alone and is runnable by itself,
which is the convention in this suite), then:

```js
import { Music } from '../../src/music/index.js';
import { PALETTES, chordFreqs } from '../../src/music/palettes.js';

// --- The pad stack ----------------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('dread');
  const before = of(ctx, 'osc').length;
  const voices = m._chordAt(0);
  const made = of(ctx, 'osc').length - before;
  const p = PALETTES.dread;

  check('one detuned stack per chord note', made === chordFreqs(p, 0).length * m.DETUNE_VOICES);
  check('the stack is actually detuned, not unison',
    new Set(of(ctx, 'osc').slice(before).map((o) => o.detune.value)).size > 1);
  check('detune stays inside the palette spread',
    of(ctx, 'osc').slice(before).every((o) => Math.abs(o.detune.value) <= p.detuneCents));
  check('the pad uses the palette waveform',
    of(ctx, 'osc').slice(before).every((o) => o.type === p.padWave));
  check('the pad is filtered', of(ctx, 'filter').length > 0);
  check('the pad reaches the bus', voices.length > 0 && reaches(voices[0].osc, m.bus));
  check('the pad also feeds the reverb send', reaches(voices[0].osc, m.send));
  check('chord voices are tracked for teardown', m._voices.length >= made);
}

// --- Motifs -----------------------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('horror');
  const before = of(ctx, 'osc').length;
  m._motif(ctx.currentTime + 0.2);
  const made = of(ctx, 'osc').slice(before);
  check('a motif makes exactly one tone', made.length === 1);
  check('the motif uses the palette motif waveform', made[0].type === PALETTES.horror.motifWave);
  check('the motif is panned somewhere', of(ctx, 'panner').length > 0);
  check('the motif is drenched in the send', reaches(made[0], m.send));
  const scale = PALETTES.horror.scale;
  const root = PALETTES.horror.root;
  const allowed = [];
  for (let oct = -1; oct <= 3; oct++) for (const s of scale) allowed.push(root * Math.pow(2, (s + 12 * oct) / 12));
  check('the motif note comes from the palette scale',
    allowed.some((f) => Math.abs(f - made[0].frequency.value) < 0.01));
}

// --- The scheduler ----------------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  check('the first chord is scheduled on start', m.chordIndex >= 1);
  const idx = m.chordIndex;
  ctx.currentTime = PALETTES.beauty.chordSeconds * 1.5;
  m._tick();
  check('a tick past the chord length advances the progression', m.chordIndex > idx);
  const idx2 = m.chordIndex;
  m._tick();
  check('a tick with no time elapsed schedules nothing new', m.chordIndex === idx2);
  check('the scheduler never looks behind the current time', m._nextChordTime >= ctx.currentTime);
}

// --- Teardown still holds with every voice type running ---------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('sacral');
  m._chordAt(1); m._motif(ctx.currentTime + 0.1);
  m.stop();
  check('stop stops every oscillator, pads and motifs included',
    of(ctx, 'osc').every((o) => o._stopped));
  check('stop clears the voice list', m._voices.length === 0);
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/audio/music-voices.test.mjs`
Expected: FAIL — `m._chordAt is not a function`.

- [ ] **Step 3: Add the voices and the scheduler to `src/music/index.js`**

Add `DETUNE_VOICES` as a class field, import `chordFreqs`, and add the methods.
`start()` gains the scheduler kick-off; keep the existing `_startSub`.

```js
// at the top, extend the import
import { PALETTES, chordFreqs } from './palettes.js';

const LOOKAHEAD = 0.5;     // seconds of audio scheduled ahead of the clock
const TICK_MS = 200;       // how often the scheduler wakes
```

Inside the class:

```js
  // Oscillators per chord note. Four is where a stack starts sounding like one
  // rich voice rather than four thin ones.
  get DETUNE_VOICES() { return 4; }

  // One chord: every note as a detuned stack through its own drifting lowpass.
  _chordAt(chordIndex) {
    const ctx = this.ctx, p = this.palette;
    const freqs = chordFreqs(p, chordIndex);
    const made = [];
    for (const f of freqs) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this._cutoff(), ctx.currentTime);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.10, ctx.currentTime + p.chordSeconds * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + p.chordSeconds * 1.1);
      filter.connect(g);
      g.connect(this.dry);
      g.connect(this.send);
      for (let i = 0; i < this.DETUNE_VOICES; i++) {
        const osc = ctx.createOscillator();
        osc.type = p.padWave;
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        // spread symmetrically across the palette's cents range
        osc.detune.setValueAtTime(p.detuneCents * (i / (this.DETUNE_VOICES - 1) * 2 - 1), ctx.currentTime);
        osc.connect(filter);
        osc.start();
        osc.stop(ctx.currentTime + p.chordSeconds * 1.2);
        const rec = { osc, g };
        this._voices.push(rec);
        made.push(rec);
      }
    }
    return made;
  }

  // A single bell tone from the palette's scale, panned and sent hard to the
  // reverb. Random pitch and pan are why the score never audibly repeats.
  _motif(when) {
    const ctx = this.ctx, p = this.palette;
    const oct = [-1, 0, 1, 2][(Math.random() * 4) | 0];
    const semi = p.scale[(Math.random() * p.scale.length) | 0] + 12 * oct;
    const osc = ctx.createOscillator();
    osc.type = p.motifWave;
    osc.frequency.setValueAtTime(p.root * Math.pow(2, semi / 12), when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.06, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.5);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.random() * 1.6 - 0.8, when);
    osc.connect(g).connect(pan);
    pan.connect(this.send);
    pan.connect(this.dry);
    osc.start(when);
    osc.stop(when + 2.6);
    this._voices.push({ osc, g });
  }

  _cutoff() {
    const p = this.palette;
    // Depth darkens the pad: at the floor the cutoff sits at the palette's base.
    return p.filterBase + p.filterDepth * (1 - this.depth);
  }

  // Advance the lookahead window. Called every TICK_MS and directly by tests.
  _tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const p = this.palette;
    while (this._nextChordTime < horizon) {
      this._chordAt(this.chordIndex);
      this.chordIndex++;
      this._nextChordTime += p.chordSeconds;
    }
    const interval = 60 / p.motifPerMinute;
    for (const t of eventTimes(this._lastMotifTime, interval, now, horizon)) {
      this._motif(t);
      this._lastMotifTime = t;
    }
  }
```

and extend `start()`:

```js
  start(paletteId) {
    if (this.playing) return;
    this.palette = PALETTES[paletteId] || PALETTES.dread;
    this.playing = true;
    this.chordIndex = 0;
    this._nextChordTime = this.ctx.currentTime;
    this._lastMotifTime = this.ctx.currentTime;
    this._startSub();
    this._tick();
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }
```

- [ ] **Step 4: Run the tests**

Run: `node tests/audio/music-voices.test.mjs && node tests/audio/music-graph.test.mjs && npm run typecheck`
Expected: PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/music/index.js tests/audio/music-voices.test.mjs
git commit -m "feat(music): detuned pad stacks, aleatoric motifs, lookahead scheduler"
```

---

### Task 4: Palette switching, crossfade, and depth response

**Files:**
- Modify: `src/music/index.js`
- Test: `tests/audio/music-palette-switch.test.mjs` (create)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces:
  - `music.setPalette(paletteId)` — crossfades to a new palette; no-op if unchanged.
  - `music.setDepth(t)` — `t` in 0..1.
  - `music.paletteId` — the currently playing palette id.

- [ ] **Step 1: Write the failing test**

Create `tests/audio/music-palette-switch.test.mjs`, again copying `stubCtx`/`of`
from `tests/audio/music-graph.test.mjs`, then:

```js
import { Music } from '../../src/music/index.js';
import { PALETTES } from '../../src/music/palettes.js';

// --- Switching --------------------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  check('the starting palette is recorded', m.paletteId === 'beauty');
  const oscsBefore = of(ctx, 'osc').length;

  m.setPalette('beauty');
  check('switching to the same palette changes nothing', of(ctx, 'osc').length === oscsBefore);

  m.setPalette('horror');
  check('switching palette is recorded', m.paletteId === 'horror');
  check('the new palette is the one in use', m.palette === PALETTES.horror);
  check('switching starts new voices', of(ctx, 'osc').length > oscsBefore);
  check('the outgoing voices are faded, not cut', m._fading.length > 0);
  check('the fade ramps a gain down to silence',
    m._fading.every((v) => v.g.gain._calls.some(([kind, val]) => kind !== 'set' && val <= 0.001)));

  m.setPalette('nonsense-id');
  check('an unknown palette falls back rather than throwing', !!m.palette);
  check('the fallback is a real palette', Object.values(PALETTES).includes(m.palette));
}

// --- Switching before start -------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.setPalette('sacral');
  check('setting a palette while stopped does not start playing', m.playing === false);
  check('setting a palette while stopped remembers it for start', m.paletteId === 'sacral');
  m.start();
  check('start with no argument uses the remembered palette', m.palette === PALETTES.sacral);
}

// --- Depth ------------------------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('dread');
  m.setDepth(0);
  const shallow = m._cutoff();
  m.setDepth(1);
  const deep = m._cutoff();
  check('depth darkens the pad filter', deep < shallow);
  check('the deep cutoff is still audible', deep > 100);
  check('depth is clamped at the top', (m.setDepth(9), m.depth === 1));
  check('depth is clamped at the bottom', (m.setDepth(-9), m.depth === 0));
  m.setDepth(1);
  check('depth raises the reverb send', m.send.gain.value > 0);
}

// --- Teardown across a switch ----------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  m.setPalette('organic');
  m.stop();
  check('stop stops fading voices too', of(ctx, 'osc').every((o) => o._stopped));
  check('stop clears the fade list', m._fading.length === 0);
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/audio/music-palette-switch.test.mjs`
Expected: FAIL — `m.setPalette is not a function`.

- [ ] **Step 3: Implement switching and depth**

Add `CROSSFADE = 2` beside the other constants. In the constructor add
`this._fading = []; this.paletteId = null;`. Change `start(paletteId)` to
`start(paletteId = this.paletteId)` and set `this.paletteId = paletteId` where
the palette is resolved. Then:

```js
  // Crossfade to a different palette. Fading rather than cutting is what makes a
  // zone change feel like the water changing rather than a track switch.
  setPalette(paletteId) {
    if (paletteId === this.paletteId) return;
    this.paletteId = paletteId;
    const next = PALETTES[paletteId] || PALETTES.dread;
    if (!this.playing) { this.palette = next; return; }

    const now = this.ctx.currentTime;
    for (const v of this._voices) {
      v.g.gain.linearRampToValueAtTime(0.0001, now + CROSSFADE);
      this._fading.push(v);
    }
    this._voices = [];
    this.palette = next;
    this.chordIndex = 0;
    this._nextChordTime = now;
    this._lastMotifTime = now;
    this._startSub();
    this._tick();
  }

  // 0 at the surface, 1 at the world floor. Descending darkens the pads and
  // pushes more of the signal into the reverb.
  setDepth(t) {
    this.depth = Math.max(0, Math.min(1, t));
    if (!this.playing) return;
    const p = this.palette;
    this.send.gain.setTargetAtTime(p.sendLevel * (0.7 + 0.5 * this.depth), this.ctx.currentTime, 0.5);
  }
```

Extend `stop()` to tear down `_fading` as well as `_voices`:

```js
    for (const v of this._voices.concat(this._fading)) {
      try { v.osc.stop(); } catch (e) { /* already stopped */ }
      try { v.osc.disconnect(); } catch (e) { /* already gone */ }
    }
    this._voices = [];
    this._fading = [];
```

- [ ] **Step 4: Run every music test**

Run: `for f in tests/audio/*.test.mjs; do node "$f" || echo "FAIL $f"; done && npm run typecheck`
Expected: all PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/music/index.js tests/audio/music-palette-switch.test.mjs
git commit -m "feat(music): palette crossfades and depth-reactive filter and send"
```

---

### Task 5: Wire the score into Audio and the reef

**Files:**
- Modify: `src/audio.js`
- Modify: `src/minigames/reef/index.js` (dive start `:339`, `_newReefName` `:639`,
  zone changes `:1912`, `:1928`, `:1948`, `:1962`, `_gameOver` `:1810`, `setDepth` call `:1390`)
- Test: extend `tests/audio/palettes.test.mjs` (no new file)

**Interfaces:**
- Consumes: `Music`, `paletteFor`.
- Produces on `Audio`: `startMusic(paletteId)`, `stopMusic()`, `setPalette(id)`,
  `toggleMusicMuted(): boolean`, `musicMuted: boolean`.
- Produces on the reef: `_applyMusic()` — the single call site for palette choice.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio/palettes.test.mjs`, before its summary line:

```js
// --- The reef picks its palette through the one shared rule ------------------
// _applyMusic is the only place the reef decides what to play; drive it against
// a stub so the wiring is proved without an AudioContext.
{
  const { Reef } = await import('../../src/minigames/reef/index.js');
  const calls = [];
  const stub = {
    zone: 'reef',
    reefTheme: REEF_THEMES.find((t) => t.key === 'haunted'),
    audio: { setPalette: (id) => calls.push(id) },
  };
  Reef.prototype._applyMusic.call(stub);
  check('a haunted reef plays its theme palette \u2014 horror, not its own key',
    calls[calls.length - 1] === 'horror');

  stub.zone = 'abyss';
  Reef.prototype._applyMusic.call(stub);
  check('dropping into the abyss switches to horror', calls[calls.length - 1] === 'horror');

  stub.zone = 'temple';
  Reef.prototype._applyMusic.call(stub);
  check('the temple switches to sacral', calls[calls.length - 1] === 'sacral');

  stub.zone = 'belly';
  Reef.prototype._applyMusic.call(stub);
  check('the belly switches to organic', calls[calls.length - 1] === 'organic');

  stub.zone = 'reef';
  stub.reefTheme = REEF_THEMES.find((t) => t.key === 'kelp');
  Reef.prototype._applyMusic.call(stub);
  check('surfacing back to a kelp reef returns to beauty', calls[calls.length - 1] === 'beauty');

  stub.reefTheme = undefined;
  Reef.prototype._applyMusic.call(stub);
  check('a missing reef theme does not throw', !!calls[calls.length - 1]);
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/audio/palettes.test.mjs`
Expected: FAIL — `Reef.prototype._applyMusic is not a function`.

- [ ] **Step 3: Add the music API to `src/audio.js`**

Import `Music`, hold one, build it in `ensure()` after `master` exists, and
forward depth. The existing noise bed stays exactly as it is — it becomes the
pressure hum under the score.

```js
import { Music } from './music/index.js';
```

In the constructor: `this.music = null; this.musicMuted = false;`
At the end of `ensure()`, after `this._startAmbient();`:

```js
    this.music = new Music(this.ctx, this.master);
    this.music.setMuted(this.musicMuted);
```

New methods:

```js
  startMusic(paletteId) { if (this.music) this.music.start(paletteId); }
  stopMusic() { if (this.music) this.music.stop(); }
  setPalette(id) { if (this.music) this.music.setPalette(id); }
  toggleMusicMuted() {
    this.musicMuted = !this.musicMuted;
    if (this.music) this.music.setMuted(this.musicMuted);
    return this.musicMuted;
  }
```

And extend `setDepth(t)` — keep the ambient line, add:

```js
    if (this.music) this.music.setDepth(t);
```

- [ ] **Step 4: Add `_applyMusic()` and its call sites to the reef**

Import at the top of `src/minigames/reef/index.js`:

```js
import { paletteFor } from '../../music/palettes.js';
```

Add the method beside the other small helpers:

```js
  // The ONE place the dive decides what to play: the zone wins if it has its own
  // score, otherwise the reef's theme does. Called on dive start, on every reef
  // roll, and on every zone change.
  _applyMusic() {
    this.audio.setPalette(paletteFor(this.zone, this.reefTheme && this.reefTheme.music));
  }
```

Call it:
- at the end of `_newReefName()` (`:639`) — a new reef may roll a new palette;
- immediately after each `this.zone = '...'` assignment at `:1912` (reef),
  `:1928` (belly), `:1948` (temple), `:1962` (abyss);
- at dive start (`:339`, after `this.zone = 'reef'`), preceded by
  `this.audio.startMusic();` so the engine is running before the palette is set;
- in `_gameOver()` (`:1810`), call `this.audio.stopMusic();` — the menu keeps the
  ambient bed alone, per the spec.

- [ ] **Step 5: Run the tests**

Run: `node tests/audio/palettes.test.mjs && node tests/minigames/reef.test.mjs && node tests/minigames/reef-seam.test.mjs && npm run typecheck`
Expected: PASS, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/audio.js src/minigames/reef/index.js tests/audio/palettes.test.mjs
git commit -m "feat(music): drive the score from the reef's zone and theme"
```

---

### Task 6: The music toggle — key, pad, touch button, legend

**Files:**
- Modify: `src/config.js` (`KEYMAP`)
- Modify: `src/input.js` (gamepad `poll()`, the edge block)
- Modify: `src/controls.js` (`PROMPTS`, `controlsHelpLines`)
- Modify: `src/game.js` (touch button rect `:430`, `_touchBtn` glyph)
- Modify: `src/minigames/reef/index.js:1253` (beside the mute handler)
- Test: `tests/game/music-toggle.test.mjs` (create)

**Interfaces:**
- Consumes: `Audio.toggleMusicMuted` from Task 5.
- Produces: `KEYMAP.music`, a `music` prompt in every scheme, `musicMuted` on the reef.

- [ ] **Step 1: Write the failing test**

Create `tests/game/music-toggle.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/game/music-toggle.test.mjs`
Expected: FAIL — `music has a key binding` (KEYMAP.music undefined).

- [ ] **Step 3: Add the binding, the pad edge and the prompts**

`src/config.js`, in `KEYMAP` beside `mute`:

```js
  music: ['KeyJ'],   // mute MUSIC only (M is mute-everything, N launches match-3)
```

`src/input.js`, in `poll()` beside the other edges:

```js
      if (edge(10)) this._padEdges.add('music');                          // L3 → mute music (mirrors torch on R3)
```

`src/controls.js`, in `PROMPTS`:

```js
  music: { key: 'J',             pad: 'L3' },
```

and extend the mute line of `controlsHelpLines` so the help page tells the truth:

```js
    `Pause — ${g('pause')}     Mute — ${g('mute')}     Music — ${g('music')}`,
```

- [ ] **Step 4: Add the touch button and its glyph**

`src/game.js`, beside the mute button at `:430`:

```js
        gameplay.push({ id: 'music', x: 404, y: 8, w: 46, h: 34 });
```

In `_touchBtn`, add `music` to the `active` expression so a muted-music button
reads as engaged, and give it a glyph branch alongside `mute`'s:

```js
    const active = (b.id === 'pause' && this.state === 'paused') || (b.id === 'mute' && this.muted)
      || (b.id === 'music' && this._reef && this._reef.musicMuted) || b.id === 'sail'
      || (b.id === 'aim' && this.input._aimBtnActive) || (b.id === 'torch' && this.torchOn);
```

Draw a music note for `b.id === 'music'`: a filled ellipse at `(cx - 3, cy + 5)`
with a stem `ctx.fillRect(cx + 1, cy - 8, 2, 13)`, in `PAL.hudText`, and a
strike-through line when `this._reef && this._reef.musicMuted` — mirror however
the existing `mute` branch signals its off state.

- [ ] **Step 5: Handle the key in the reef**

`src/minigames/reef/index.js:1253`, immediately after the mute handler:

```js
    if (this.input.pressed('music') || this.input.consumeButton('music')) { this.audio.ensure(); this.musicMuted = this.audio.toggleMusicMuted(); }
```

and initialise `this.musicMuted = false;` beside the other run-state flags.

- [ ] **Step 6: Run the tests**

Run: `node tests/game/music-toggle.test.mjs && node tests/game/controls.test.mjs && node tests/game/touch-buttons.test.mjs && npm run typecheck`
Expected: PASS, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/config.js src/input.js src/controls.js src/game.js src/minigames/reef/index.js tests/game/music-toggle.test.mjs
git commit -m "feat(music): mute music independently of SFX (J / L3 / touch)"
```

---

### Task 7: Close the phase — full suite, versions, docs, and a tuning pass

**Files:**
- Modify: `src/version.js`
- Modify: `README.md`
- Modify: `docs/platform/architecture.md`

- [ ] **Step 1: Run the whole suite and the typechecker**

Run:
```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```
Expected: 98 files, zero FAIL lines, typecheck exits 0.

- [ ] **Step 2: Bump the build stamp**

`src/version.js`: set `BUILD` to `'music-<YYYY-MM-DD>'` using today's date. Leave
`VERSION` alone. Bump `ENGINE_VERSION` only if the Core contract changed — it has
not in this plan, so leave it.

- [ ] **Step 3: Document it**

Add a README bullet beside the other feature bullets describing the score: five
palettes chosen by reef theme, zone overrides for the abyss, temple and belly,
and the `J` music toggle. Add a short section to `docs/platform/architecture.md`
recording that `src/music/` owns the score, that `Audio` owns the `Music`
instance, and that `paletteFor` is the only place the mapping lives.

- [ ] **Step 4: The tuning pass — REQUIRED, do not skip**

Serve the repo (`python3 -m http.server 8000`) and play a dive with sound on.
This is the step that decides whether any of it is good; no automated check in
this repo can reach it.

Listen for, and adjust in `PALETTES`:
- **Balance** — the score must sit under the SFX, never over them. If harpoon
  and pickup sounds stop reading clearly, lower `BUS_GAIN` in `src/music/index.js`.
- **Chord rate** — if it feels restless, raise `chordSeconds`; ambient wants to
  be slower than instinct suggests.
- **Motif density** — if the bells feel like a melody rather than an event,
  lower `motifPerMinute`.
- **Muddiness at depth** — if descending turns the low end to soup, raise
  `filterBase` or lower the sub gain in `_startSub`.
- **The zone crossfades** — enter the temple and the abyss and confirm the change
  reads as the water changing, not as a track switch.
- **Palette character** — confirm a haunted reef actually feels different from a
  kelp forest. If two palettes are hard to tell apart, push their roots and
  scales further apart rather than nudging levels.

Also verify: `J` mutes music while harpoon SFX still fire; `M` still mutes
everything; touch emulation shows the new button and it works; the score stops on
death and the menu is quiet apart from the ambient bed.

- [ ] **Step 5: Commit and land**

```bash
git add -A
git commit -m "chore(music): tuning pass, build stamp, docs"
```

Then follow superpowers:finishing-a-development-branch to land the work.
