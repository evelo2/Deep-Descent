// Procedural Web Audio: ambient underwater bed + one-shot SFX. No asset files.
// The procedural score lives in src/music/ and hangs off this facade as `music`,
// summed into its own bus so it can be muted without silencing the SFX.
import { Music } from './music/index.js';
import { SeaLife } from './sealife.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.ambientGain = null;
    this._theme = false;        // Treasure Chest Madness looping theme (on while the minigame is open)
    this._themeTimer = null;
    this.music = null;
    this.musicMuted = false;
    this.sealife = null;
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
    this.music = new Music(this.ctx, this.master);
    this.music.setMuted(this.musicMuted);
    // Part of the world, not part of the score: hung off master so the world
    // mute covers it and the music toggle does not.
    this.sealife = new SeaLife(this.ctx, this.master);
    this.sealife.start();
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

  // Ambient darkens/deepens with depth (0..1). The score follows the same signal.
  setDepth(t) {
    if (!this.ctx) return;
    this.ambientGain.gain.setTargetAtTime(0.10 + t * 0.14, this.ctx.currentTime, 0.4);
    if (this.music) this.music.setDepth(t);
    if (this.sealife) this.sealife.setDepth(t);
  }

  // The score. Muting music is deliberately independent of the SFX mute.
  startMusic(paletteId) { if (this.music) this.music.start(paletteId); }
  stopMusic() { if (this.music) this.music.stop(); }
  setPalette(id) { if (this.music) this.music.setPalette(id); }
  // The threat layer: how hard the dive is being hunted, 0..1.
  setTension(t) { if (this.music) this.music.setTension(t); }
  // 0 in open water, 1 in an unlit dark room: darker pads, sparser bells.
  setShade(s) { if (this.music) this.music.setShade(s); }
  // The sea-life bed varies by zone as well as by depth.
  setZone(z) { if (this.sealife) this.sealife.setZone(z); }
  toggleMusicMuted() {
    this.musicMuted = !this.musicMuted;
    if (this.music) this.music.setMuted(this.musicMuted);
    return this.musicMuted;
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
  click()   { this._tone({ type: 'square', f0: 150, f1: 80, t: 0.035, gain: 0.16 }); }   // dry dead-trigger (out of ammo)
  heartbeat() {   // ominous low lub-dub when air runs low
    this._tone({ type: 'sine', f0: 68, f1: 44, t: 0.13, gain: 0.34 });
    setTimeout(() => this._tone({ type: 'sine', f0: 58, f1: 38, t: 0.17, gain: 0.26 }), 175);
  }
  kill()    { this._tone({ type: 'sawtooth', f0: 500, f1: 120, t: 0.2, gain: 0.28 });
              this._tone({ type: 'triangle', f0: 700, f1: 300, t: 0.16, gain: 0.16 }); }
  gem()     { [784,1046,1318,1568].forEach((f,i)=>setTimeout(()=>this._tone({type:'sine',f0:f,f1:f*1.2,t:0.18,gain:0.28}), i*55)); }
  blackpearl() { this._tone({ type: 'sine', f0: 420, f1: 980, t: 0.4, gain: 0.32 });
                 this._tone({ type: 'sine', f0: 630, f1: 1460, t: 0.3, gain: 0.16 }); }

  // --- Treasure Chest Madness (match-3) audio -------------------------------
  // A short bouncy looping theme (I–vi–IV–V in C) under the SFX. Web-Audio
  // procedural, no assets. Started on minigame open, stopped on close. Timing
  // is setTimeout-driven — fine for a casual jingle; gains sit low so match
  // SFX read over the top. Mute is honoured by _tone(), so a muted theme
  // schedules silent tones (cheap) and resumes instantly on unmute.
  startMatchTheme() {
    if (!this.ctx || this._theme) return;
    this._theme = true;
    // one entry per eighth-note step (0 = rest). 16 steps ≈ 2.4s per loop.
    const bass = [130.81,0,196.0,0, 110.0,0,164.81,0, 87.31,0,130.81,0, 98.0,0,146.83,0]; // C A F G roots + fifths
    const lead = [783.99,659.25,523.25,659.25, 880.0,783.99,659.25,587.33,
                  698.46,659.25,587.33,523.25, 587.33,659.25,783.99,0];
    const stepDur = 0.15;
    let step = 0;
    const tick = () => {
      if (!this._theme || !this.ctx) return;
      const b = bass[step % bass.length];
      if (b) this._tone({ type: 'triangle', f0: b, f1: b, t: stepDur * 1.6, gain: 0.10 });
      const l = lead[step % lead.length];
      if (l) this._tone({ type: 'square', f0: l, f1: l, t: stepDur * 0.85, gain: 0.045 });
      step++;
      this._themeTimer = setTimeout(tick, stepDur * 1000);
    };
    tick();
  }
  stopMatchTheme() {
    this._theme = false;
    if (this._themeTimer) { clearTimeout(this._themeTimer); this._themeTimer = null; }
  }

  specialSpawn() {   // a special tile was just created — bright rising chime
    this._tone({ type: 'triangle', f0: 880, f1: 1320, t: 0.12, gain: 0.24 });
    this._tone({ type: 'sine', f0: 1760, f1: 2200, t: 0.10, gain: 0.10 });
  }
  detonate() {       // bomb / chest blast — a low thud with a bright crack
    this._tone({ type: 'sawtooth', f0: 220, f1: 40, t: 0.30, gain: 0.34 });
    this._tone({ type: 'square', f0: 140, f1: 60, t: 0.12, gain: 0.20 });
  }
  chestJingle() {    // a chest popped — sparkly ascending arpeggio
    [659.25,880,1046.5,1318.5,1760].forEach((f,i)=>setTimeout(()=>this._tone({ type:'sine', f0:f, f1:f*1.15, t:0.16, gain:0.26 }), i*55));
  }
  levelClear() {     // triumphant fanfare on LEVEL CLEARED
    [[523.25,0],[659.25,90],[783.99,180],[1046.5,300],[1318.5,300]].forEach(([f,d])=>
      setTimeout(()=>this._tone({ type:'triangle', f0:f, f1:f, t:0.34, gain:0.30 }), d));
  }
}
