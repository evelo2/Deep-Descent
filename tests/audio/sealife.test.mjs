// Sea-life ambience: pure atmosphere. The load-bearing assertions here are that
// it hangs off the MASTER gain and not the music bus — the world mute (M)
// silences it, the music toggle (J) must not — and that its selection table
// cannot correlate with anything dangerous.
// Run: node tests/audio/sealife.test.mjs

import { SeaLife, bandFor, poolFor, pickVoice, VOICES } from '../../src/sealife.js';
import { Music } from '../../src/music/index.js';

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

// --- Bands and pools ---------------------------------------------------------
{
  check('the surface is shallow', bandFor(0) === 'shallow');
  check('the floor is deep', bandFor(1) === 'deep');
  check('an unknown zone yields an empty pool', poolFor('nowhere', 0).length === 0);
  check('the reef has a shallow pool', poolFor('reef', 0).length > 0);
  check('the abyss has a deep pool', poolFor('abyss', 1).length > 0);
  check('every pooled voice is a real voice',
    ['reef', 'abyss', 'temple', 'belly'].every((z) => [0, 1].every((d) =>
      poolFor(z, d).every(([v]) => VOICES.includes(v)))));
  check('shrimp crackle is a shallow-reef sound, not an abyss one',
    poolFor('reef', 0).some(([v]) => v === 'crackle') &&
    !poolFor('abyss', 1).some(([v]) => v === 'crackle'));
  check('dolphins do not click in the abyss',
    !poolFor('abyss', 1).some(([v]) => v === 'clicks'));
}

// --- Weighted pick is total over [0,1) --------------------------------------
{
  const pool = poolFor('reef', 0);
  check('pick returns a voice at the bottom of the range', VOICES.includes(pickVoice(pool, 0)));
  check('pick returns a voice at the top of the range', VOICES.includes(pickVoice(pool, 0.999)));
  check('an empty pool picks nothing', pickVoice([], 0.5) === null);
  check('weight actually biases the choice — crackle dominates the shallow reef',
    pickVoice(pool, 0.1) === 'crackle');
}

// --- Routing: the master, NOT the music bus (decision 4) ---------------------
{
  const ctx = stubCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const music = new Music(ctx, master);
  const sl = new SeaLife(ctx, master);
  check('sea life reaches the master', reaches(sl.gain, master));
  check('sea life reaches the destination', reaches(sl.gain, ctx.destination));
  check('sea life does NOT route through the music bus', !reaches(sl.gain, music.bus));
  music.setMuted(true);
  check('muting the music leaves sea life connected', reaches(sl.gain, master));
}

// --- The scheduler must not hold Node open ----------------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  sl.start();
  check('a timer is running', !!sl._timer);
  check('start() is idempotent', (() => { const t = sl._timer; sl.start(); return sl._timer === t; })());
  sl.stop();
  check('stop() clears the timer', sl._timer === null);
}

// --- It actually makes a sound when its turn comes up ------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  sl.setZone('reef'); sl.setDepth(0);
  for (const voice of VOICES) {
    const before = ctx._nodes.length;
    sl._fire(voice);
    check(`${voice} builds nodes`, ctx._nodes.length > before);
  }
  const before = ctx._nodes.length;
  sl._fire('kraken-roar');
  check('an unknown voice is simply ignored', ctx._nodes.length === before);
}

// --- An unknown zone is silent, not an error --------------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  sl.setZone('nowhere');
  sl._nextAt = -1;
  const before = ctx._nodes.length;
  sl._tick();
  check('an unknown zone schedules nothing', ctx._nodes.length === before);
}

// --- Nothing here can be positioned at the diver ------------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  check('SeaLife is never handed the diver or the creature list',
    typeof sl.setZone === 'function' && typeof sl.setDepth === 'function'
    && sl.diver === undefined && sl.creatures === undefined);
}

if (failed) { console.error(`FAILED ${failed}`); process.exit(1); }
console.log(`ok sealife.test.mjs (${passed} checks)`);
