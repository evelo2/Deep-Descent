// The crush-depth klaxon. Proved against the same stub AudioContext the music
// tests use: what this file can prove is that it reaches the bus (so the master
// mute silences it), that re-asserting the same state allocates nothing and
// re-issues no ramp, and that it stops cleanly. It CANNOT prove audibility —
// see the OfflineAudioContext render in the plan's Task 9 Step 5.
// Run: node tests/audio/klaxon.test.mjs

import { Klaxon } from '../../src/klaxon.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// A stub AudioContext, copied from tests/audio/music-tension.test.mjs (that
// file does not export its stubCtx, so it is duplicated rather than imported)
// and extended to record every setTargetAtTime / linearRampToValueAtTime /
// exponentialRampToValueAtTime call into ctx._ramps — that is what the
// idempotence assertions below read. It also returns `nodes` and a `bus` node
// directly, rather than only `ctx`, so this test can hand the klaxon a
// destination distinct from ctx.destination and inspect the node graph.
function stubCtx() {
  const nodes = [];
  const ramps = [];
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
    setTargetAtTime(v) { this.value = v; this._calls.push(['target', v]); ramps.push(['target', v]); return this; },
    linearRampToValueAtTime(v) { this.value = v; this._calls.push(['ramp', v]); ramps.push(['ramp', v]); return this; },
    exponentialRampToValueAtTime(v) { this.value = v; this._calls.push(['exp', v]); ramps.push(['exp', v]); return this; } });
  const ctx = {
    currentTime: 0, sampleRate: 48000, _nodes: nodes, _ramps: ramps,
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
  const bus = node('bus');   // stands in for Audio#master — the destination the klaxon rides
  return { ctx, nodes, bus };
}

{
  const { ctx, nodes, bus } = stubCtx();
  const k = new Klaxon(ctx, bus);
  check('silent until switched on', k.on === false);
  const before = nodes.length;

  k.set(true);
  check('switching on marks it on', k.on === true);
  check('it allocated its voice', nodes.length > before);
  check('it reaches the bus so the master mute silences it',
    nodes.some((n) => n._conn.includes(bus) || n._conn.some((c) => c._conn && c._conn.includes(bus))));

  const afterOn = nodes.length;
  const rampsAfterOn = ctx._ramps.length;
  k.set(true); k.set(true); k.set(true);
  check('re-asserting ON allocates nothing', nodes.length === afterOn);
  check('re-asserting ON re-issues no ramp — a per-frame setter must return early',
    ctx._ramps.length === rampsAfterOn);

  k.set(false);
  check('switching off marks it off', k.on === false);
  const rampsAfterOff = ctx._ramps.length;
  k.set(false); k.set(false);
  check('re-asserting OFF re-issues no ramp', ctx._ramps.length === rampsAfterOff);

  k.set(true);
  k.stop();
  check('stop() releases the voice', k.on === false);
}

console.log(`ok klaxon.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
