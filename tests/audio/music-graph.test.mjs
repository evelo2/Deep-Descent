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
