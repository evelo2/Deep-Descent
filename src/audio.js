// Procedural Web Audio: ambient underwater bed + one-shot SFX. No asset files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.ambientGain = null;
  }

  // Must be created after a user gesture (browser autoplay policy).
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _startAmbient() {
    // Low filtered noise bed for an underwater "pressure" hum.
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.12;
    src.connect(lp).connect(this.ambientGain).connect(this.master);
    src.start();
  }

  // Ambient darkens/deepens with depth (0..1).
  setDepth(t) {
    if (!this.ctx) return;
    this.ambientGain.gain.setTargetAtTime(0.10 + t * 0.14, this.ctx.currentTime, 0.4);
  }

  _tone({ type = 'sine', f0, f1 = f0, t = 0.15, gain = 0.3, curve = 'exp' }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + t);
    else osc.frequency.linearRampToValueAtTime(f1, now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    osc.connect(g).connect(this.master);
    osc.start(now); osc.stop(now + t + 0.02);
  }

  pickup()  { this._tone({ type: 'triangle', f0: 660, f1: 1180, t: 0.18, gain: 0.35 }); }
  pearl()   { this._tone({ type: 'sine', f0: 880, f1: 1600, t: 0.28, gain: 0.4 });
              this._tone({ type: 'sine', f0: 1320, f1: 2000, t: 0.22, gain: 0.18 }); }
  bank()    { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this._tone({type:'triangle',f0:f,f1:f,t:0.16,gain:0.3}), i*70)); }
  hit()     { this._tone({ type: 'sawtooth', f0: 320, f1: 60, t: 0.35, gain: 0.4 }); }
  refill()  { this._tone({ type: 'sine', f0: 300, f1: 520, t: 0.12, gain: 0.12 }); }
  gasp()    { this._tone({ type: 'sine', f0: 180, f1: 90, t: 0.5, gain: 0.3 }); }
  select()  { this._tone({ type: 'square', f0: 520, f1: 720, t: 0.08, gain: 0.15 }); }
  fire()    { this._tone({ type: 'square', f0: 900, f1: 240, t: 0.14, gain: 0.22 }); }
  kill()    { this._tone({ type: 'sawtooth', f0: 500, f1: 120, t: 0.2, gain: 0.28 });
              this._tone({ type: 'triangle', f0: 700, f1: 300, t: 0.16, gain: 0.16 }); }
  gem()     { [784,1046,1318,1568].forEach((f,i)=>setTimeout(()=>this._tone({type:'sine',f0:f,f1:f*1.2,t:0.18,gain:0.28}), i*55)); }
  blackpearl() { this._tone({ type: 'sine', f0: 420, f1: 980, t: 0.4, gain: 0.32 });
                 this._tone({ type: 'sine', f0: 630, f1: 1460, t: 0.3, gain: 0.16 }); }
}
