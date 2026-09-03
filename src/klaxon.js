// @ts-check
// The crush-depth klaxon — a two-tone submarine emergency horn that loops while
// the diver is below crush depth. It is a GAMEPLAY SIGNAL, not score: it rides
// the master bus and follows the master mute (M), never the music toggle (J).
//
// The `set(on)` setter MUST return early when the value is unchanged. It is
// called every frame; re-issuing setTargetAtTime 60x/second restarts the ramp
// and it never lands (this cost a chase layer that reached 0.58 instead of 1.0,
// fixed 2026-09-01).

const LOW = 340;    // Hz — the two horn tones
const HIGH = 510;
const PERIOD = 0.9; // seconds per alternation
// Gain when sounding. Deliberately at the ambient bed's level (0.12) rather
// than above it: this is a SQUARE wave, so its harmonic content makes it read
// far louder than the same amplitude on a sine or triangle. It does not need
// volume to grab attention — an alternating two-tone horn is conspicuous by
// character. Compare: ambient hum 0.12, music tension send 0.18, sea-life
// calls 0.09. Was 0.22, judged too loud in play 2026-09-02.
const PEAK = 0.12;

export class Klaxon {
  /** @param {any} ctx @param {any} destination */
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.dest = destination;
    this.on = false;
    this.osc = null;
    this.gain = null;
    this.lfo = null;
  }

  set(on) {
    if (on === this.on) return;   // <- the early return that makes the ramp land
    this.on = on;
    if (on) this._start(); else this._stop();
  }

  _start() {
    const ctx = this.ctx, now = ctx.currentTime;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, now);
    this.gain.connect(this.dest);

    this.osc = ctx.createOscillator();
    this.osc.type = 'square';
    this.osc.frequency.setValueAtTime(LOW, now);
    // Alternate the two tones by scheduling a repeating square LFO on frequency.
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfo.frequency.setValueAtTime(1 / PERIOD, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime((HIGH - LOW) / 2, now);
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.osc.frequency);
    this.osc.frequency.setValueAtTime((LOW + HIGH) / 2, now);

    this.osc.connect(this.gain);
    this.osc.start(now);
    this.lfo.start(now);
    this.gain.gain.setTargetAtTime(PEAK, now, 0.05);
  }

  _stop() {
    if (!this.gain) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    const osc = this.osc, lfo = this.lfo, g = this.gain;
    this.osc = null; this.lfo = null; this.gain = null;
    setTimeout(() => {
      try { osc.stop(); lfo.stop(); g.disconnect(); } catch (e) { /* already torn down */ }
    }, 400);
  }

  stop() { this.set(false); }
}
