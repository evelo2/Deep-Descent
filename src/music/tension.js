// @ts-check
// The threat layer: a driving pulse that rides ON TOP of whatever palette is
// playing rather than replacing it. A full crossfade was rejected — at two
// seconds it lands after the scare is already over.
//
// It owns its own nodes and its own note list, deliberately NOT in
// Music._voices, because setPalette() fades that array out and a chase has to
// survive a zone change. It takes the palette as a parameter at schedule time
// rather than holding one, so the pulse changes key underneath itself when the
// water changes and the temple keeps its own identity through a chase.
import { noteFreq } from './palettes.js';
import { eventTimes } from './timing.js';

const RISE = 0.35;    // time constant on the way up — a lock-on should land fast
const FALL = 2.5;     // and on the way down: "fades when the lock breaks"
const SILENT = 0.01;  // below this the layer schedules nothing at all
const PEAK = 0.20;    // per-note gain at full level — loud enough to read OVER the pads
const MAX_NOTES = 64; // ~15s of pulse; older ones are long finished

// Three patterns, differing mostly in tempo — that is what reads as urgency.
// `steps` are scale DEGREES into whatever palette is current, so the pulse is
// always in key; `null` is a rest, which still advances the step.
export const PATTERNS = [
  { id: 'drive', stepSeconds: 0.30, steps: [0, null, 2, 0, 4, null, 2, null] },
  { id: 'hunt', stepSeconds: 0.24, steps: [0, 0, 3, null, 0, 2, null, 4] },
  { id: 'stalk', stepSeconds: 0.375, steps: [0, null, null, 4, 2, null] },
];

// A degree in the palette's ROOT octave. Deliberately not an octave lower: down
// there the pulse lands on the sub drone (organic's sub is 27.5 Hz and its root
// an octave down is 55 — exactly an octave apart) and thickens the rumble
// instead of reading as rhythm. Degrees past the scale wrap up, as elsewhere.
export function degreeFreq(palette, deg) {
  const n = palette.scale.length;
  const octave = Math.floor(deg / n);
  return noteFreq(palette.root, palette.scale[((deg % n) + n) % n] + 12 * octave);
}

export class Tension {
  constructor(ctx, dry, send) {
    this.ctx = ctx;
    this.level = 0;
    this._notes = [];
    this._pattern = PATTERNS[0];
    this._step = 0;
    this._lastTime = 0;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(dry);

    // A touch of space, not a wash: reverb on a chase makes it mushy and slow,
    // which is the opposite of the point.
    this.sendGain = ctx.createGain();
    this.sendGain.gain.value = 0.18;
    this.gain.connect(this.sendGain);
    this.sendGain.connect(send);
  }

  // Called every frame with the raw target from threat.js.
  //
  // The early return is load-bearing, not an optimisation. The dive reports the
  // same level every frame while a chase holds; re-issuing setTargetAtTime each
  // frame restarts the exponential approach from wherever it had got to, so the
  // ramp never completes — and because `rising` is false once the target has
  // been stored, every one of those re-issues used the 2.5s FALL constant. The
  // measured result was a chase reaching 0.58 after 2.5s instead of ~1. Schedule
  // once per actual change and let the automation run.
  setLevel(target) {
    const t = Math.max(0, Math.min(1, target));
    if (t === this.level) return;
    const rising = t > this.level;
    if (rising && this.level <= SILENT) this._pickPattern();
    this.level = t;
    this.gain.gain.setTargetAtTime(t, this.ctx.currentTime, rising ? RISE : FALL);
  }

  // A fresh chase never reuses the pattern the last one ended on.
  _pickPattern() {
    const pool = PATTERNS.filter((p) => p.id !== this._pattern.id);
    this._pattern = pool[(Math.random() * pool.length) | 0] || PATTERNS[0];
    this._step = 0;
    this._lastTime = this.ctx.currentTime;
  }

  // Advance the pulse across the same lookahead window the score uses.
  schedule(from, to, palette) {
    if (this.level < SILENT || !palette) return;
    const p = this._pattern;
    for (const when of eventTimes(this._lastTime, p.stepSeconds, from, to)) {
      const deg = p.steps[this._step % p.steps.length];
      this._step++;
      this._lastTime = when;
      if (deg === null) continue;
      this._note(when, degreeFreq(palette, deg));
    }
  }

  // One short plucked note. Fast attack, short decay — it has to feel like a
  // pulse rather than another pad.
  _note(when, freq) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Open enough to keep some bite above the pads, which sit under 1100.
    filter.frequency.setValueAtTime(2600, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(PEAK, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(filter).connect(g).connect(this.gain);
    osc.start(when);
    osc.stop(when + 0.24);
    this._notes.push({ osc, g });
    while (this._notes.length > MAX_NOTES) {
      const old = this._notes.shift();
      try { old.osc.disconnect(); } catch (e) { /* already gone */ }
    }
  }

  stop() {
    for (const v of this._notes) {
      try { v.osc.stop(); } catch (e) { /* already stopped */ }
      try { v.osc.disconnect(); } catch (e) { /* already gone */ }
    }
    this._notes = [];
    this.level = 0;
    this.gain.gain.value = 0;
  }
}
