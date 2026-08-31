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
