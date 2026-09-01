// @ts-check
// Off-screen sea life: whale song, dolphin clicks, distant groans and a shrimp
// crackle bed. There are no whales or dolphins in the fauna roster — the whale
// is a ZONE you swim inside — so these are atmosphere by necessity, and must
// never be wired to an entity.
//
// PURE ATMOSPHERE, enforced structurally rather than by discipline: selection is
// a weighted table keyed by (zone, depth band), fired on a randomised interval,
// panned at random, never placed at the diver and unreachable from any spawn or
// damage event. There is no code path by which one of these can correlate with a
// threat, so it cannot become readable as a warning.
//
// It connects to the MASTER gain, not the music bus: it is part of the world,
// like the pressure hum, so the world mute (M) silences it and the music toggle
// (J) leaves it alone.
import { makeImpulse } from './music/impulse.js';

export const VOICES = ['whale', 'clicks', 'groan', 'crackle'];

const MIN_GAP = 14;   // seconds between events — sparse is the whole point
const MAX_GAP = 38;
const TICK_MS = 1000; // events are tens of seconds apart; no need to wake often

export function bandFor(depth) { return depth < 0.5 ? 'shallow' : 'deep'; }

// Weighted pools per zone and band. An unrecognised zone yields an empty pool
// and therefore silence — audio must never be able to break a dive.
const POOLS = {
  'reef:shallow': [['crackle', 6], ['clicks', 3], ['whale', 1]],
  'reef:deep': [['groan', 4], ['whale', 2], ['crackle', 2]],
  'abyss:shallow': [['groan', 5], ['whale', 1]],
  'abyss:deep': [['groan', 6], ['whale', 2]],
  'temple:shallow': [['whale', 2], ['groan', 2]],
  'temple:deep': [['whale', 3], ['groan', 3]],
  'belly:shallow': [['groan', 3], ['crackle', 1]],
  'belly:deep': [['groan', 4], ['whale', 2]],
};

export function poolFor(zone, depth) { return POOLS[`${zone}:${bandFor(depth)}`] || []; }

// Weighted choice against r in [0,1). Pure, so the table is testable.
export function pickVoice(pool, r) {
  const total = pool.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let x = r * total;
  for (const [voice, w] of pool) { x -= w; if (x < 0) return voice; }
  return pool[pool.length - 1][0];
}

export class SeaLife {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.zone = 'reef';
    this.depth = 0;
    this._timer = null;
    this._nextAt = 0;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0.5;
    this.gain.connect(destination);

    // Its own reverb: it cannot borrow the music's, which lives behind the
    // music mute.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 7);
    this.reverb.connect(this.gain);

    this.send = ctx.createGain();
    this.send.gain.value = 0.6;
    this.send.connect(this.reverb);

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.gain);
  }

  setZone(z) { this.zone = z; }
  setDepth(t) { this.depth = Math.max(0, Math.min(1, t)); }

  start() {
    if (this._timer) return;
    this._armNext();
    // The browser has no unref; under Node (the tests) a live interval would
    // hold the process open forever, so release it where it exists.
    const timer = /** @type {any} */ (setInterval(() => this._tick(), TICK_MS));
    if (timer && typeof timer.unref === 'function') timer.unref();
    this._timer = timer;
  }

  _armNext() {
    this._nextAt = this.ctx.currentTime + MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
  }

  _tick() {
    if (this.ctx.currentTime < this._nextAt) return;
    this._armNext();
    const voice = pickVoice(poolFor(this.zone, this.depth), Math.random());
    if (voice) this._fire(voice);
  }

  // Everything below is panned at random and placed nowhere in particular.
  _pan() {
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.random() * 1.8 - 0.9, this.ctx.currentTime);
    p.connect(this.dry);
    p.connect(this.send);
    return p;
  }

  _fire(voice) {
    if (voice === 'whale') this._whale();
    else if (voice === 'clicks') this._clicks();
    else if (voice === 'groan') this._groan();
    else if (voice === 'crackle') this._crackle();
  }

  // A slow glide, low and long, drenched in the reverb.
  _whale() {
    const ctx = this.ctx, now = ctx.currentTime;
    const dur = 3 + Math.random() * 3;
    const f0 = 60 + Math.random() * 60;
    const f1 = f0 * (1.4 + Math.random() * 1.4);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.linearRampToValueAtTime(f1, now + dur * 0.55);
    osc.frequency.linearRampToValueAtTime(f0 * 0.9, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.09, now + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this._pan());
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  // A burst of tiny high impulses — a pod somewhere off in the blue.
  _clicks() {
    const ctx = this.ctx, now = ctx.currentTime;
    const pan = this._pan();
    const n = 6 + ((Math.random() * 15) | 0);
    for (let i = 0; i < n; i++) {
      const when = now + i * (0.02 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2200 + Math.random() * 2600, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.09, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      osc.connect(g).connect(pan);
      osc.start(when);
      osc.stop(when + 0.04);
    }
  }

  // Something enormous shifting a long way off. Filtered noise, no pitch.
  _groan() {
    const ctx = this.ctx, now = ctx.currentTime;
    const dur = 2.5 + Math.random() * 2.5;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // A 120 Hz lowpass on white noise leaves almost nothing, so this sits a
    // little higher and much louder than the pitched voices to land at the same
    // audible level.
    lp.frequency.setValueAtTime(180 + Math.random() * 160, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.75, now + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(lp).connect(g).connect(this._pan());
    src.start(now);
  }

  // Snapping shrimp: the actual sound of a living reef, and the cheapest thing
  // here — a scatter of tiny clicks over a couple of seconds.
  _crackle() {
    const ctx = this.ctx, now = ctx.currentTime;
    const pan = this._pan();
    const n = 10 + ((Math.random() * 20) | 0);
    for (let i = 0; i < n; i++) {
      const when = now + Math.random() * 2.2;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400 + Math.random() * 2000, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.05, when + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
      osc.connect(g).connect(pan);
      osc.start(when);
      osc.stop(when + 0.03);
    }
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}
