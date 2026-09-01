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
import { PALETTES, chordFreqs } from './palettes.js';
import { eventTimes } from './timing.js';
import { Tension } from './tension.js';

// Re-exported so existing importers of the engine keep working unchanged.
export { eventTimes };

const BUS_GAIN = 0.5;
const LOOKAHEAD = 0.5;     // seconds of audio scheduled ahead of the clock
const TICK_MS = 200;       // how often the scheduler wakes
const CROSSFADE = 2;       // seconds the outgoing palette takes to fade out
const DEEP_THRESHOLD = 0.6;   // where the water starts closing in
const DEEP_STEEPEN = 2.2;     // how much harder it closes past that point

export class Music {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.playing = false;
    this.muted = false;
    this.depth = 0;
    this.shade = 0;         // 0 in open water, 1 in an unlit dark room
    this.palette = null;
    this._voices = [];      // every node we started, for stop()
    this._fading = [];      // voices from the previous palette, on their way out
    this.paletteId = null;
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

    // The threat layer. It hangs off dry/send like any voice, so it reaches the
    // bus and the existing music mute covers it with no new plumbing — but it
    // keeps its own note list, so setPalette() cannot fade a chase out.
    this.tension = new Tension(ctx, this.dry, this.send);
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

  start(paletteId = this.paletteId) {
    if (this.playing) return;
    this.paletteId = paletteId;
    this.palette = PALETTES[paletteId] || PALETTES.dread;
    this.playing = true;
    this.chordIndex = 0;
    this._nextChordTime = this.ctx.currentTime;
    this._lastMotifTime = this.ctx.currentTime;
    this._startSub();
    this._tick();
    // The browser has no unref; under Node (the tests) a live interval would hold
    // the process open forever, so release it from the event loop where it exists.
    const timer = /** @type {any} */ (setInterval(() => this._tick(), TICK_MS));
    if (timer && typeof timer.unref === 'function') timer.unref();
    this._timer = timer;
  }

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
        const rec = { osc, g, filter };
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
    this.send.gain.setTargetAtTime(p.sendLevel * (0.7 + 0.5 * this._deepCurve()), this.ctx.currentTime, 0.5);
    this._rampFilters();
  }

  // 0 in open water, 1 in an unlit dark room.
  setShade(s) {
    this.shade = Math.max(0, Math.min(1, s));
    if (!this.playing) return;
    this._rampFilters();
  }

  // Depth's own response, steepened past the threshold so the deep audibly
  // closes in. Deliberately NOT a second knob — depth already drives cutoff and
  // reverb send, and a separate deep trigger would double-count the same signal.
  _deepCurve() {
    const t = this.depth;
    return Math.min(1, t <= DEEP_THRESHOLD ? t : DEEP_THRESHOLD + (t - DEEP_THRESHOLD) * DEEP_STEEPEN);
  }

  // The cutoff is only read when a chord is BUILT, so without this a change of
  // depth or shade would not reach the pad you are currently hearing — in the
  // temple that is a twenty-second wait. Ramp the live filters instead.
  _rampFilters() {
    const f = this._cutoff();
    for (const v of this._voices) {
      if (v.filter) v.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.35);
    }
  }

  // How long between bell motifs. Sparser in the dark.
  _motifInterval() {
    const p = this.palette;
    return 60 / (p.motifPerMinute * Math.max(0.2, 1 - 0.5 * this.shade));
  }

  // Called every frame by the dive with the level from threat.js.
  setTension(t) { this.tension.setLevel(t); }

  _cutoff() {
    const p = this.palette;
    // Depth darkens the pad; an unlit dark room darkens it further.
    return p.filterBase + p.filterDepth * (1 - this._deepCurve()) * (1 - 0.6 * this.shade);
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
    const interval = this._motifInterval();
    for (const t of eventTimes(this._lastMotifTime, interval, now, horizon)) {
      this._motif(t);
      this._lastMotifTime = t;
    }
    this.tension.schedule(now, horizon, this.palette);
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
    this.tension.stop();
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    for (const v of this._voices.concat(this._fading)) {
      try { v.osc.stop(); } catch (e) { /* already stopped */ }
      try { v.osc.disconnect(); } catch (e) { /* already gone */ }
    }
    this._voices = [];
    this._fading = [];
  }
}
