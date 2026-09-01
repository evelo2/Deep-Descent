// Crossfading between palettes and the depth response. Same stub AudioContext as
// music-graph.test.mjs — helpers duplicated deliberately so this file runs alone.
// Run: node tests/audio/music-palette-switch.test.mjs

import { Music } from '../../src/music/index.js';
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

// --- Shade and depth reach the pads that are ALREADY playing -----------------
// The cutoff is read only when a chord is BUILT, so without the live ramp a
// change would not reach the pad you are currently hearing — twenty seconds in
// the temple.
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  check('chord notes keep their filter reference',
    m._voices.length > 0 && m._voices.some((v) => !!v.filter));
  const voiced = m._voices.filter((v) => v.filter);
  const before = voiced.map((v) => v.filter.frequency.value);
  m.setShade(1);
  const after = voiced.map((v) => v.filter.frequency.value);
  check('shade ramps the filters that are already sounding',
    after.every((v, i) => v < before[i]));
  m.setShade(4);
  check('shade is clamped above', m.shade === 1);
  m.setShade(-4);
  check('shade is clamped below', m.shade === 0);
  m.stop();
}

// --- Depth past the threshold bites harder than depth before it --------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  m.setShade(0);
  m.setDepth(0.3); const shallow = m._cutoff();
  m.setDepth(0.6); const mid = m._cutoff();
  m.setDepth(0.9); const deep = m._cutoff();
  check('deeper is always darker', shallow > mid && mid > deep);
  check('past the threshold the curve steepens', (mid - deep) > (shallow - mid));
  m.stop();
}

// --- Shade thins the bells ---------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  const lit = m._motifInterval();
  m.setShade(1);
  check('a dark room makes the bells sparser', m._motifInterval() > lit);
  m.stop();
}

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok music-palette-switch.test.mjs (${passed} checks)`);
