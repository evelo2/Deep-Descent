// The threat layer, proved against the same stub AudioContext the other music
// tests use. What matters here is that it reaches the bus (so the music toggle
// mutes it), that a zone change does NOT kill it, and that it stays silent and
// free when nothing is chasing.
// Run: node tests/audio/music-tension.test.mjs

import { Music } from '../../src/music/index.js';
import { Tension, PATTERNS, degreeFreq } from '../../src/music/tension.js';
import { PALETTES } from '../../src/music/palettes.js';

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

// --- Pitch derives from whatever palette is current --------------------------
{
  const sacral = degreeFreq(PALETTES.sacral, 0);
  const horror = degreeFreq(PALETTES.horror, 0);
  check('the pulse takes its key from the palette', sacral !== horror);
  check('degree 0 sits an octave below the palette root',
    Math.abs(sacral - PALETTES.sacral.root / 2) < 0.001);
  check('degrees past the scale wrap up an octave',
    degreeFreq(PALETTES.sacral, PALETTES.sacral.scale.length) > sacral);
}

// --- Routing: through the music bus, so J mutes it ---------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  check('Music owns a tension layer', !!m.tension);
  check('the tension layer reaches the bus', reaches(m.tension.gain, m.bus));
  check('the tension layer reaches the destination', reaches(m.tension.gain, ctx.destination));
  check('the tension layer reaches the reverb', reaches(m.tension.gain, m.reverb));
  check('it starts silent', m.tension.gain.gain.value === 0);
}

// --- Silence is free ---------------------------------------------------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  const before = ctx._nodes.length;
  t.schedule(0, 10, PALETTES.dread);
  check('nothing is scheduled while the level is zero', ctx._nodes.length === before);
}

// --- Raising the level schedules notes ---------------------------------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  t.setLevel(1);
  const before = of(ctx, 'osc').length;
  t.schedule(0, 4, PALETTES.dread);
  const oscs = of(ctx, 'osc');
  check('a raised level schedules pulse notes', oscs.length > before);
  check('every pulse oscillator is started', oscs.every((o) => o._started));
  check('rests do not become notes — the pattern is sparser than its step grid',
    oscs.length < Math.ceil(4 / t._pattern.stepSeconds));
}

// --- Variants: a fresh chase does not repeat the last pattern ----------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  check('there are several patterns to choose from', PATTERNS.length >= 3);
  const seen = [];
  for (let i = 0; i < 8; i++) { t.setLevel(0); t.setLevel(1); seen.push(t._pattern.id); }
  let repeats = 0;
  for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) repeats++;
  check('a new chase never reuses the pattern the last one ended on', repeats === 0);
  check('over several chases more than one pattern actually gets used',
    new Set(seen).size > 1);
  check('the patterns genuinely differ in tempo',
    new Set(PATTERNS.map((p) => p.stepSeconds)).size === PATTERNS.length);
}

// --- The chase survives a zone change (decision 2) ---------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  m.setTension(1);
  const level = m.tension.gain.gain.value;
  m.setPalette('sacral');
  check('setPalette leaves the tension level alone', m.tension.gain.gain.value === level);
  check('setPalette does not stop the layer', m.tension.level === 1);
  check('the pulse re-keys to the new palette on its next note',
    m.palette === PALETTES.sacral);
  m.stop();
}

// --- stop() cleans up --------------------------------------------------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  t.setLevel(1);
  t.schedule(0, 4, PALETTES.dread);
  check('notes were retained for cleanup', t._notes.length > 0);
  t.stop();
  check('stop() drops the level to zero', t.gain.gain.value === 0);
  check('stop() releases every note', t._notes.length === 0);
}

// --- The facade never throws without a context (audio must not break a dive) --
{
  const { Audio } = await import('../../src/audio.js');
  const a = new Audio();
  let threw = false;
  try { a.setTension(1); } catch (e) { threw = true; }
  check('setTension is safe before ensure()', !threw);
}

// --- Threat derivation reaches the layer end to end --------------------------
{
  const { tensionLevel } = await import('../../src/music/threat.js');
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('dread');
  m.setTension(tensionLevel([{ pursuing: true }], [], null));
  check('one pursuer opens the layer through Music', m.tension.level > 0.5);
  m.setTension(tensionLevel([{ pursuing: false }], [], null));
  check('losing the pursuer closes it', m.tension.level === 0);
  m.stop();
}

if (failed) { console.error(`FAILED ${failed}`); process.exit(1); }
console.log(`ok music-tension.test.mjs (${passed} checks)`);
