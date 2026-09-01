// The voices: detuned pad stacks, aleatoric bell motifs, and the lookahead
// scheduler that places them. Driven against the same stub AudioContext as
// music-graph.test.mjs — the helpers below are duplicated deliberately so each
// test file stands alone. Run: node tests/audio/music-voices.test.mjs

import { Music } from '../../src/music/index.js';
import { PALETTES, chordFreqs } from '../../src/music/palettes.js';

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

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok music-voices.test.mjs (${passed} checks)`);
