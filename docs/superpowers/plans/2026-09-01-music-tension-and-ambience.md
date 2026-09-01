# Music Tension Layer & Sea-Life Ambience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a situational pulse layer that overlays the existing score during a chase, dark-zone shading of the pads, and a sparse bed of off-screen sea life.

**Architecture:** Threat is derived from a `pursuing` flag each creature sets in its own `update()`, collapsed to a 0–1 level by a pure function and smoothed inside a new `Tension` module that owns its own nodes outside `Music._voices` (so a zone change cannot kill a chase). Dark shades the existing pads by ramping live filters; depth reuses the existing response with a steeper curve past a threshold. Sea life is a separate module hung off `audio.master`, so the world mute covers it and the music toggle does not.

**Tech Stack:** Plain ES modules, Web Audio API, no build step, no asset files. Tests are plain Node scripts against a stub `AudioContext`.

**Spec:** `docs/superpowers/specs/2026-09-01-music-tension-and-ambience-design.md`

## Global Constraints

- **No build step and no asset files.** Everything is synthesised. Never add a dependency.
- **`npm run typecheck` must exit 0.** New files under `src/music/` start with `// @ts-check` on line 1.
- **Every new `setInterval` must be `unref()`'d** in the `Music.start()` style, or the Node test suite hangs forever.
- **`tests/audio/` uses name-first `check(name, cond)`.** The repo has three incompatible assertion styles and mixing the two `check` forms silently always-passes. Copy the stub `AudioContext` from `tests/audio/music-graph.test.mjs` into each new test file — these files duplicate helpers deliberately so each runs standalone.
- **Every test file ends by printing its own summary line:** `` console.log(`ok <file> (${passed} checks)`) `` and exits non-zero on failure.
- **`pursuing` is written only by the creature and read only by audio.** No gameplay code may branch on it.
- **Audio must never break a dive.** Guard every new facade entry point in the existing `if (this.music) ...` style.
- Do not touch `paletteFor`, the palette data, `startMatchTheme`, or any persisted `deepdescent.*` key.

Run the whole suite with:

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
```

---

### Task 1: Threat derivation

**Files:**
- Modify: `src/entities/creatures.js` (base constructor + nine `update()` methods)
- Create: `src/music/threat.js`
- Test: `tests/audio/threat-level.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `tensionLevel(creatures, krakens, guardian) -> number` in `src/music/threat.js`, returning 0 or a value in [0.55, 1]. Every `Creature` gains a boolean `pursuing` field, default `false`.

- [ ] **Step 1: Write the failing test**

Create `tests/audio/threat-level.test.mjs`:

```js
// Threat derivation: pure arithmetic over entity lists, no Web Audio involved.
// Run: node tests/audio/threat-level.test.mjs
import { tensionLevel } from '../../src/music/threat.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

check('no entities at all is silence', tensionLevel([], [], null) === 0);
check('null lists are tolerated', tensionLevel(null, null, null) === 0);
check('a creature that is not pursuing is silence',
  tensionLevel([{ pursuing: false }], [], null) === 0);
check('one pursuer opens the layer', tensionLevel([{ pursuing: true }], [], null) === 0.7);
check('two pursuers push it higher',
  tensionLevel([{ pursuing: true }, { pursuing: true }], [], null) === 0.85);
check('it saturates at 1 and never exceeds it',
  tensionLevel(Array.from({ length: 12 }, () => ({ pursuing: true })), [], null) === 1);
check('a dead pursuer does not count',
  tensionLevel([{ pursuing: true, dead: true }], [], null) === 0);
check('a live kraken always counts', tensionLevel([], [{ dead: false }], null) === 0.7);
check('a dead kraken does not', tensionLevel([], [{ dead: true }], null) === 0);
check('a live guardian counts', tensionLevel([], [], { dead: false, hp: 3 }) === 0.7);
check('a spent guardian does not', tensionLevel([], [], { dead: false, hp: 0 }) === 0);
check('sources add together',
  tensionLevel([{ pursuing: true }], [{ dead: false }], null) === 0.85);

if (failed) { console.error(`FAILED ${failed}`); process.exit(1); }
console.log(`ok threat-level.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tests/audio/threat-level.test.mjs`
Expected: fails to resolve `../../src/music/threat.js` (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Create `src/music/threat.js`**

```js
// @ts-check
// Turns "what is chasing me" into one number for the music layer. Pure, so it
// tests under plain Node with plain objects and no Web Audio.
//
// The count, not the distance, drives the level: a graded-by-proximity value
// jitters as a creature oscillates around its pursuit radius. All smoothing
// lives in Tension (rise 0.35s, fall 2.5s), so this stays a dumb reporter and
// the long release absorbs any boundary flicker.

const BASE = 0.55;   // one pursuer is already a chase
const STEP = 0.15;   // each additional one leans on it harder

// `creatures` report their own `pursuing` flag. Krakens and the chest Guardian
// are boss encounters — being alive is the same thing as hunting you.
export function tensionLevel(creatures, krakens, guardian) {
  let n = 0;
  if (creatures) for (const c of creatures) if (c && c.pursuing && !c.dead) n++;
  if (krakens) for (const k of krakens) if (k && !k.dead) n++;
  if (guardian && !guardian.dead && guardian.hp > 0) n++;
  return n === 0 ? 0 : Math.min(1, BASE + STEP * n);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node tests/audio/threat-level.test.mjs`
Expected: `ok threat-level.test.mjs (12 checks)`

- [ ] **Step 5: Give every creature the field**

In `src/entities/creatures.js`, in the `Creature` base constructor, after the `snareT` line:

```js
    this.snareT = 0;   // >0 while netted/stunned: frozen and harmless
    // Read ONLY by the music layer, to decide whether a chase is happening.
    // Never branch gameplay on this.
    this.pursuing = false;
```

- [ ] **Step 6: Set it in each pursuer's own `update()`**

Nine edits, each at the point where the pursuit decision already gets made. Do not change any movement maths.

`Octopus.update` — replace the `if (dist < 230) {...}` line's leading condition by hoisting it:

```js
    const chasing = dist < 230;
    this.pursuing = chasing;
    if (chasing) { this.x += (dx / dist) * this.speed * dt; this.y += (dy / dist) * this.speed * dt; this.baseY = this.y; }
```

`Angler.update` — same shape:

```js
    const chasing = dist < 260;
    this.pursuing = chasing;
    if (chasing) { this.x += (dx / dist) * this.speed * dt; this.y += (dy / dist) * this.speed * dt; this.baseY = this.y; }
```

`Barracuda.update` — the windup and the dash are the frightening part; patrol is not. Add as the last line of the method:

```js
    this.pursuing = this.state === 'windup' || this.state === 'dash';
```

Also add `this.pursuing = false;` immediately after the existing `if (this.snareT > 0) { this.state = 'patrol'; return; }` guard, before the `return`, so a stunned barracuda goes quiet:

```js
    if (this.snareT > 0) { this.state = 'patrol'; this.pursuing = false; return; }   // stunned: no dash
```

`Moray.update` — only the lunge counts. Change the snare guard and add a line:

```js
    if (this.snareT > 0) { this.pursuing = false; return; }
```

and as the last line of the method:

```js
    this.pursuing = this.state !== 'hidden';
```

`Grouper.update` — it guards, it does not chase across the map:

```js
    const inTerritory = Math.hypot(diver.x - this.ax, diver.y - this.ay) < P.territory;
    this.pursuing = inTerritory;
```

`Sentinel.update` — the same, but a woken sentinel holds the guard:

```js
    const guarding = this.awake || inTerritory;
    this.pursuing = guarding;
```

`GiantSquid.update` — it never disengages, so gate on range or it would hold the layer open across a whole reef. Add after the `d` calculation:

```js
    this.pursuing = d < 600;
```

`Piranha.update` and `Parasite.update` — both dart at the diver constantly; gate them the same way. Add after the `d` calculation in each:

```js
    this.pursuing = d < 400;
```

- [ ] **Step 7: Run the creature suite and the type check**

Run:

```bash
node tests/creatures/*.test.mjs 2>/dev/null; for f in $(find tests/creatures tests/entities -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: every creature test still passes (movement is unchanged), typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/music/threat.js src/entities/creatures.js tests/audio/threat-level.test.mjs
git commit -m "feat(music): derive a threat level from what is actually pursuing"
```

---

### Task 2: The pulse layer

**Files:**
- Create: `src/music/timing.js`
- Create: `src/music/tension.js`
- Modify: `src/music/index.js` (move `eventTimes` out, re-export it)
- Test: `tests/audio/music-tension.test.mjs`

**Interfaces:**
- Consumes: `noteFreq` from `src/music/palettes.js`, palettes shaped as in `PALETTES`.
- Produces: `PATTERNS` (array of `{ id, stepSeconds, steps }`), `degreeFreq(palette, deg) -> number`, and `class Tension { constructor(ctx, dry, send); setLevel(t); schedule(from, to, palette); stop() }`, all from `src/music/tension.js`. `eventTimes` keeps its existing import path from `src/music/index.js`.

**Why `timing.js` exists:** `index.js` will import `Tension`, and `Tension` needs `eventTimes`. Importing it back out of `index.js` makes a cycle. Moving the function to its own module and re-exporting it from `index.js` breaks the cycle without breaking the existing test import.

- [ ] **Step 1: Move `eventTimes` into its own module**

Create `src/music/timing.js` with the function moved verbatim out of `src/music/index.js`, comment and all:

```js
// @ts-check
// Scheduling maths shared by the score and the tension layer. Kept in its own
// module so tension.js can use it without importing index.js, which imports
// tension.js back.

// The event times inside [from, to) that follow `prev` at `interval` spacing.
// Pure, and the reason scheduling never drifts: callers advance a window against
// ctx.currentTime instead of chaining setTimeout.
export function eventTimes(prev, interval, from, to) {
  const out = [];
  if (interval <= 0) return out;
  for (let t = prev + interval; t < to; t += interval) if (t >= from) out.push(t);
  return out;
}
```

In `src/music/index.js`, delete the `eventTimes` definition and its comment, and replace the import block at the top with:

```js
import { PALETTES, chordFreqs } from './palettes.js';
import { eventTimes } from './timing.js';
import { Tension } from './tension.js';

// Re-exported so existing importers of the engine keep working unchanged.
export { eventTimes };
```

- [ ] **Step 2: Run the existing music tests to confirm the move broke nothing**

Run: `for f in tests/audio/*.test.mjs; do node "$f" || echo "FAIL $f"; done`
Expected: the three existing files still pass. `music-graph.test.mjs` imports `eventTimes` from `index.js` and must be unaffected. This will fail to resolve `./tension.js` until Step 4 — that is expected, and is why Step 4 follows immediately.

- [ ] **Step 3: Write the failing test**

Create `tests/audio/music-tension.test.mjs`. Copy the `stubCtx`, `of` and `reaches` helpers verbatim from `tests/audio/music-graph.test.mjs` (lines 14–52) — these files duplicate helpers deliberately so each runs alone.

```js
// The threat layer, proved against the same stub AudioContext the other music
// tests use. What matters here is that it reaches the bus (so the music toggle
// mutes it), that a zone change does NOT kill it, and that it stays silent and
// free when nothing is chasing.
// Run: node tests/audio/music-tension.test.mjs

import { Music } from '../../src/music/index.js';
import { Tension, PATTERNS, degreeFreq } from '../../src/music/tension.js';
import { PALETTES } from '../../src/music/palettes.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// <<< paste stubCtx / of / reaches here from music-graph.test.mjs >>>

// --- Pitch derives from whatever palette is current --------------------------
{
  const sacral = degreeFreq(PALETTES.sacral, 0);
  const horror = degreeFreq(PALETTES.horror, 0);
  check('the pulse takes its key from the palette', sacral !== horror);
  check('degree 0 sits an octave below the palette root',
    Math.abs(sacral - PALETTES.sacral.root / 2) < 0.001);
  check('degrees past the scale wrap up an octave',
    degreeFreq(PALETTES.sacral, PALETTES.sacral.scale.length) > sacral);
}

// --- Routing: through the music bus, so J mutes it ---------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  check('Music owns a tension layer', !!m.tension);
  check('the tension layer reaches the bus', reaches(m.tension.gain, m.bus));
  check('the tension layer reaches the destination', reaches(m.tension.gain, ctx.destination));
  check('the tension layer reaches the reverb', reaches(m.tension.gain, m.reverb));
  check('it starts silent', m.tension.gain.gain.value === 0);
}

// --- Silence is free ---------------------------------------------------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  const before = ctx._nodes.length;
  t.schedule(0, 10, PALETTES.dread);
  check('nothing is scheduled while the level is zero', ctx._nodes.length === before);
}

// --- Raising the level schedules notes ---------------------------------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  t.setLevel(1);
  const before = of(ctx, 'osc').length;
  t.schedule(0, 4, PALETTES.dread);
  check('a raised level schedules pulse notes', of(ctx, 'osc').length > before);
  check('every pulse oscillator is started and stopped',
    of(ctx, 'osc').every((o) => o._started && o._stopped === false || o._started));
}

// --- Variants: a fresh chase does not repeat the last pattern ----------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  check('there are several patterns to choose from', PATTERNS.length >= 3);
  const seen = [];
  for (let i = 0; i < 6; i++) { t.setLevel(0); t.setLevel(1); seen.push(t._pattern.id); }
  let repeats = 0;
  for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) repeats++;
  check('a new chase never reuses the pattern the last one ended on', repeats === 0);
  check('the patterns genuinely differ in tempo',
    new Set(PATTERNS.map((p) => p.stepSeconds)).size === PATTERNS.length);
}

// --- The chase survives a zone change (decision 2) ---------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  m.setTension(1);
  const level = m.tension.gain.gain.value;
  m.setPalette('sacral');
  check('setPalette leaves the tension level alone', m.tension.gain.gain.value === level);
  check('setPalette does not stop the layer', m.tension.level === 1);
  m.stop();
}

// --- stop() cleans up --------------------------------------------------------
{
  const ctx = stubCtx();
  const t = new Tension(ctx, ctx.destination, ctx.destination);
  t.setLevel(1);
  t.schedule(0, 4, PALETTES.dread);
  t.stop();
  check('stop() drops the level to zero', t.gain.gain.value === 0);
  check('stop() releases every note', t._notes.length === 0);
}

if (failed) { console.error(`FAILED ${failed}`); process.exit(1); }
console.log(`ok music-tension.test.mjs (${passed} checks)`);
```

- [ ] **Step 4: Create `src/music/tension.js`**

```js
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
const PEAK = 0.085;   // per-note gain at full level
const MAX_NOTES = 64; // ~15s of pulse; older ones are long finished

// Three patterns, differing mostly in tempo — that is what reads as urgency.
// `steps` are scale DEGREES into whatever palette is current, so the pulse is
// always in key; `null` is a rest, which still advances the step.
export const PATTERNS = [
  { id: 'drive', stepSeconds: 0.30, steps: [0, null, 2, 0, 4, null, 2, null] },
  { id: 'hunt', stepSeconds: 0.24, steps: [0, 0, 3, null, 0, 2, null, 4] },
  { id: 'stalk', stepSeconds: 0.375, steps: [0, null, null, 4, 2, null] },
];

// A degree an octave below the palette root — low and driving, under the pads.
// Degrees past the end of the scale wrap up an octave, as elsewhere.
export function degreeFreq(palette, deg) {
  const n = palette.scale.length;
  const octave = Math.floor(deg / n);
  return noteFreq(palette.root, palette.scale[((deg % n) + n) % n] + 12 * (octave - 1));
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

  // Called every frame with the raw target from threat.js. Idempotent.
  setLevel(target) {
    const t = Math.max(0, Math.min(1, target));
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
    filter.frequency.setValueAtTime(1400, when);
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
```

- [ ] **Step 5: Wire the layer into `Music`**

In `src/music/index.js`:

In the constructor, immediately after the `this.dry` block (the layer needs `dry` and `send` to already exist):

```js
    // The threat layer. It hangs off dry/send like any voice, so it reaches the
    // bus and the existing music mute covers it with no new plumbing — but it
    // keeps its own note list, so setPalette() cannot fade a chase out.
    this.tension = new Tension(ctx, this.dry, this.send);
```

Add a method next to `setDepth`:

```js
  // Called every frame by the dive with the level from threat.js.
  setTension(t) { this.tension.setLevel(t); }
```

At the end of `_tick()`, after the motif loop:

```js
    this.tension.schedule(now, horizon, this.palette);
```

As the first line of `stop()`, before `this.playing = false`:

```js
    this.tension.stop();
```

Leave `setPalette()` completely untouched — that is what the "survives a zone change" test asserts.

- [ ] **Step 6: Run the test and confirm it passes**

Run: `node tests/audio/music-tension.test.mjs`
Expected: `ok music-tension.test.mjs (…checks)`

- [ ] **Step 7: Run the rest of the audio suite and the type check**

Run:

```bash
for f in tests/audio/*.test.mjs; do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: all four files pass, typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/music/timing.js src/music/tension.js src/music/index.js tests/audio/music-tension.test.mjs
git commit -m "feat(music): a threat pulse that overlays the score instead of replacing it"
```

---

### Task 3: Wire tension into the dive

**Files:**
- Modify: `src/audio.js`
- Modify: `src/minigames/reef/index.js`
- Test: `tests/audio/music-tension.test.mjs` (extend)

**Interfaces:**
- Consumes: `tensionLevel` from Task 1, `Music#setTension` from Task 2.
- Produces: `Audio#setTension(t)`, guarded like every other facade method.

- [ ] **Step 1: Add the facade method**

In `src/audio.js`, next to `setPalette`:

```js
  setTension(t) { if (this.music) this.music.setTension(t); }
```

- [ ] **Step 2: Call it from the dive**

In `src/minigames/reef/index.js`, add to the import that already pulls from the music module (near the existing `import { paletteFor } from '../../music/palettes.js';`):

```js
import { tensionLevel } from '../../music/threat.js';
```

In `update(dt)`, directly after the existing `this.audio.setDepth(...)` line:

```js
    // The score's threat layer: what is actually hunting you right now.
    this.audio.setTension(tensionLevel(this.creatures, this.krakens, this.chestGuardian));
```

- [ ] **Step 3: Add a facade guard test**

Append to `tests/audio/music-tension.test.mjs`, before the summary line:

```js
// --- The facade never throws without a context (audio must not break a dive) --
{
  const { Audio } = await import('../../src/audio.js');
  const a = new Audio();
  let threw = false;
  try { a.setTension(1); } catch (e) { threw = true; }
  check('setTension is safe before ensure()', !threw);
}
```

- [ ] **Step 4: Run the test and the suite**

Run:

```bash
node tests/audio/music-tension.test.mjs
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: everything passes, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/audio.js src/minigames/reef/index.js tests/audio/music-tension.test.mjs
git commit -m "feat(music): drive the threat layer from what is hunting the diver"
```

---

### Task 4: Shading — dark rooms and a steeper deep

**Files:**
- Modify: `src/music/index.js`
- Modify: `src/audio.js`
- Modify: `src/minigames/reef/index.js`
- Test: `tests/audio/music-palette-switch.test.mjs` (extend)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Music#setShade(s)`, `Audio#setShade(s)`, `Game#_inDark() -> boolean` on the reef.

**Background:** `_cutoff()` is read **only** when a chord is created, so changing depth today darkens the *next* chord, up to 20s away in the temple. Dark rooms would inherit that lag and be useless. Storing the per-note filter reference fixes both.

- [ ] **Step 1: Write the failing tests**

Append to `tests/audio/music-palette-switch.test.mjs`, before its summary line:

```js
// --- Shade and depth reach the pads that are ALREADY playing ------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  m._tick();
  const filters = ctx._nodes.filter((n) => n.kind === 'filter');
  check('chord notes keep their filter reference',
    m._voices.length > 0 && m._voices.every((v) => !!v.filter));
  const before = filters.map((f) => f.frequency.value);
  m.setShade(1);
  const after = m._voices.map((v) => v.filter.frequency.value);
  check('shade ramps the filters that are already sounding',
    after.every((v, i) => v < before[i] || before[i] === undefined));
  check('shade is clamped to 0..1', (m.setShade(4), m.shade === 1));
  check('shade is clamped below too', (m.setShade(-4), m.shade === 0));
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
  check('past the threshold the curve steepens',
    (mid - deep) > (shallow - mid));
  m.stop();
}

// --- Shade thins the bells ----------------------------------------------------
{
  const ctx = stubCtx();
  const m = new Music(ctx, ctx.destination);
  m.start('beauty');
  const lit = m._motifInterval();
  m.setShade(1);
  check('a dark room makes the bells sparser', m._motifInterval() > lit);
  m.stop();
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tests/audio/music-palette-switch.test.mjs`
Expected: FAIL on `setShade is not a function` / `_motifInterval is not a function`.

- [ ] **Step 3: Implement shading in `src/music/index.js`**

Add near the other module constants:

```js
const DEEP_THRESHOLD = 0.6;   // where the water starts closing in
const DEEP_STEEPEN = 2.2;     // how much harder it closes past that point
```

In the constructor, next to `this.depth = 0;`:

```js
    this.shade = 0;   // 0 in open water, 1 in an unlit dark room
```

Store the filter on each voice — in `_chordAt`, change:

```js
        const rec = { osc, g };
```

to:

```js
        const rec = { osc, g, filter };
```

Replace `_cutoff()` and add the curve and the ramp beside it:

```js
  // Depth's own response, steepened past the threshold so the deep audibly
  // closes in. Deliberately NOT a second knob — depth already drives cutoff and
  // reverb send, and a separate deep trigger would double-count the same signal.
  _deepCurve() {
    const t = this.depth;
    return Math.min(1, t <= DEEP_THRESHOLD ? t : DEEP_THRESHOLD + (t - DEEP_THRESHOLD) * DEEP_STEEPEN);
  }

  _cutoff() {
    const p = this.palette;
    // Depth darkens the pad; an unlit dark room darkens it further.
    return p.filterBase + p.filterDepth * (1 - this._deepCurve()) * (1 - 0.6 * this.shade);
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

  // 0 in open water, 1 in an unlit dark room.
  setShade(s) {
    this.shade = Math.max(0, Math.min(1, s));
    if (!this.playing) return;
    this._rampFilters();
  }
```

Update `setDepth` to use the curve and to reach the live pads:

```js
  setDepth(t) {
    this.depth = Math.max(0, Math.min(1, t));
    if (!this.playing) return;
    const p = this.palette;
    this.send.gain.setTargetAtTime(p.sendLevel * (0.7 + 0.5 * this._deepCurve()), this.ctx.currentTime, 0.5);
    this._rampFilters();
  }
```

In `_tick()`, replace `const interval = 60 / p.motifPerMinute;` with:

```js
    const interval = this._motifInterval();
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node tests/audio/music-palette-switch.test.mjs`
Expected: `ok music-palette-switch.test.mjs (…checks)`

- [ ] **Step 5: Add the facade method and the dive's dark test**

In `src/audio.js`, next to `setTension`:

```js
  setShade(s) { if (this.music) this.music.setShade(s); }
```

In `src/minigames/reef/index.js`, add a helper next to `_applyMusic()`:

```js
  // Inside an unlit dark room. The same test the dark-cave HUD hint uses — kept
  // here so it has one home now that the score reads it too.
  _inDark() {
    if (this.zone !== 'reef' || !this.darkZones || !this.darkZones.length) return false;
    if (this.flareT > 0 || (this.torchOn && this.shockBattery > 0)) return false;
    return this.darkZones.some((z) => Math.hypot(this.diver.x - z.x, this.diver.y - z.y) < z.r);
  }
```

Call it in `update(dt)`, directly after the `setTension` line added in Task 3:

```js
    this.audio.setShade(this._inDark() ? 1 : 0);
```

Then replace the duplicated condition in the dark-cave HUD hint (around `src/minigames/reef/index.js:2478`) so the test lives in exactly one place. The existing line reads:

```js
    if (this.flareT <= 0 && !torchLit && this.darkZones && this.darkZones.some((z) => Math.hypot(this.diver.x - z.x, this.diver.y - z.y) < z.r) && this.zone === 'reef') {
```

Replace it with:

```js
    if (this._inDark()) {
```

The preceding `const torchLit = ...` line becomes unused — delete it.

- [ ] **Step 6: Run everything**

Run:

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: all green, typecheck exits 0. Pay attention to any reef/HUD test that exercised the dark-cave hint.

- [ ] **Step 7: Commit**

```bash
git add src/music/index.js src/audio.js src/minigames/reef/index.js tests/audio/music-palette-switch.test.mjs
git commit -m "feat(music): dark rooms shade the pads, and depth bites harder past the threshold"
```

---

### Task 5: Sea-life ambience

**Files:**
- Create: `src/music/impulse.js`
- Create: `src/sealife.js`
- Modify: `src/music/index.js` (use the shared impulse)
- Modify: `src/audio.js`
- Modify: `src/minigames/reef/index.js`
- Test: `tests/audio/sealife.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `makeImpulse(ctx, seconds) -> AudioBuffer` from `src/music/impulse.js`; `bandFor(depth) -> 'shallow'|'deep'`, `poolFor(zone, depth) -> Array<[string, number]>`, `pickVoice(pool, r) -> string|null`, and `class SeaLife { constructor(ctx, destination); start(); setZone(z); setDepth(t); stop() }` from `src/sealife.js`; `Audio#setZone(z)`.

- [ ] **Step 1: Write the failing test**

Create `tests/audio/sealife.test.mjs`. Copy `stubCtx` and `reaches` verbatim from `tests/audio/music-graph.test.mjs`.

```js
// Sea-life ambience: pure atmosphere. The load-bearing assertions here are that
// it hangs off the MASTER gain and not the music bus — the world mute (M)
// silences it, the music toggle (J) must not — and that its selection table
// cannot correlate with anything dangerous.
// Run: node tests/audio/sealife.test.mjs

import { SeaLife, bandFor, poolFor, pickVoice, VOICES } from '../../src/sealife.js';
import { Music } from '../../src/music/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// <<< paste stubCtx / reaches here from music-graph.test.mjs >>>

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
  check('muting the music leaves sea life connected',
    (music.setMuted(true), reaches(sl.gain, master)));
}

// --- The scheduler must not hold Node open ----------------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  sl.start();
  check('a timer is running', !!sl._timer);
  check('the timer is unref()\'d', sl._timer._unrefCalled === true || typeof sl._timer.unref !== 'function');
  sl.stop();
  check('stop() clears the timer', sl._timer === null);
}

// --- It actually makes a sound when its turn comes up ------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  sl.setZone('reef'); sl.setDepth(0);
  const before = ctx._nodes.length;
  sl._fire('whale');
  check('a whale call builds nodes', ctx._nodes.length > before);
  const afterWhale = ctx._nodes.length;
  sl._fire('clicks');
  check('a click burst builds nodes', ctx._nodes.length > afterWhale);
  const afterClicks = ctx._nodes.length;
  sl._fire('groan');
  check('a groan builds nodes', ctx._nodes.length > afterClicks);
  const afterGroan = ctx._nodes.length;
  sl._fire('crackle');
  check('crackle builds nodes', ctx._nodes.length > afterGroan);
  check('an unknown voice is simply ignored',
    (() => { const n = ctx._nodes.length; sl._fire('kraken-roar'); return ctx._nodes.length === n; })());
}

// --- An unknown zone is silent, not an error --------------------------------
{
  const ctx = stubCtx();
  const sl = new SeaLife(ctx, ctx.destination);
  sl.setZone('nowhere');
  const before = ctx._nodes.length;
  sl._nextAt = -1;
  sl._tick();
  check('an unknown zone schedules nothing', ctx._nodes.length === before);
}

if (failed) { console.error(`FAILED ${failed}`); process.exit(1); }
console.log(`ok sealife.test.mjs (${passed} checks)`);
```

The stub's `setInterval` is Node's real one, so `unref` exists; add `_unrefCalled` tracking is unnecessary — the check above tolerates either. Leave it as written.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tests/audio/sealife.test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `../../src/sealife.js`.

- [ ] **Step 3: Extract the impulse generator**

Create `src/music/impulse.js`, moving the body of `Music._impulse` verbatim:

```js
// @ts-check
// A generated impulse response: stereo noise under an exponential decay. Cheap
// to build, no asset, and it is what gives the score its space. Shared by the
// score and the sea-life bed, which needs its own reverb because it hangs off
// the master gain rather than the music bus.
export function makeImpulse(ctx, seconds) {
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
```

In `src/music/index.js`, add `import { makeImpulse } from './impulse.js';`, delete the `_impulse` method entirely, and change the constructor line to:

```js
    this.reverb.buffer = makeImpulse(ctx, 6);
```

- [ ] **Step 4: Create `src/sealife.js`**

```js
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
    this._voicesOut = [];

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
    // Browsers have no unref; under Node (the tests) a live interval would hold
    // the process open forever, so release it from the event loop where it exists.
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
      g.gain.linearRampToValueAtTime(0.02, when + 0.002);
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
    lp.frequency.setValueAtTime(120 + Math.random() * 120, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.07, now + dur * 0.4);
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
      g.gain.linearRampToValueAtTime(0.012, when + 0.001);
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
```

- [ ] **Step 5: Wire it into the facade and the dive**

In `src/audio.js`, add the import beside the `Music` one:

```js
import { SeaLife } from './sealife.js';
```

In the constructor, beside `this.music = null;`:

```js
    this.sealife = null;
```

In `ensure()`, after the `this.music` lines:

```js
    // Part of the world, not part of the score: hung off master so the world
    // mute covers it and the music toggle does not.
    this.sealife = new SeaLife(this.ctx, this.master);
    this.sealife.start();
```

In `setDepth`, after the existing `if (this.music) ...` line:

```js
    if (this.sealife) this.sealife.setDepth(t);
```

Add beside `setPalette`:

```js
  setZone(z) { if (this.sealife) this.sealife.setZone(z); }
```

In `src/minigames/reef/index.js`, in `_applyMusic()`, add a second line:

```js
  _applyMusic() {
    this.audio.setPalette(paletteFor(this.zone, this.reefTheme && this.reefTheme.music));
    this.audio.setZone(this.zone);   // the sea-life bed varies by zone too
  }
```

- [ ] **Step 6: Run the test and the whole suite**

Run:

```bash
node tests/audio/sealife.test.mjs
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: all green, typecheck exits 0. If the suite hangs, the `unref()` in `SeaLife.start()` is missing.

- [ ] **Step 7: Commit**

```bash
git add src/sealife.js src/music/impulse.js src/music/index.js src/audio.js src/minigames/reef/index.js tests/audio/sealife.test.mjs
git commit -m "feat(audio): a sparse bed of off-screen sea life under the world mute"
```

---

### Task 6: Build stamp, docs, and the listening pass

**Files:**
- Modify: `src/version.js`
- Modify: `docs/platform/architecture.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code-facing.

- [ ] **Step 1: Bump the build stamp**

In `src/version.js`, set:

```js
export const BUILD = 'music-tension-2026-09-01';
```

The date suffix is not optional — a stale value on a device is how you tell the browser is serving cached scripts.

- [ ] **Step 2: Document the two new systems**

In `docs/platform/architecture.md`, extend the existing music section with a short subsection covering: the tension axis being orthogonal to `paletteFor`; why the pulse layer lives outside `Music._voices`; that `pursuing` is write-by-creature / read-by-audio and gameplay must not branch on it; and that sea life hangs off `master` rather than the music bus, which is what puts it under M and not J.

In `README.md`, extend the music bullet to mention the chase layer and the sea-life bed.

- [ ] **Step 3: Full verification**

Run:

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: every file prints its `ok` line, no `FAIL` lines, typecheck exits 0. Record the actual counts — do not claim a number you did not read.

- [ ] **Step 4: Listening pass in a real browser**

The music is **not live** — `origin/main` has no `src/music/`. Serve the branch locally:

```bash
python3 -m http.server 8000
```

Then, in Chrome, verify by ear:

1. Start a dive. The score plays as before; no pulse in open water.
2. Let an Octopus or Angler close in — a driving pulse should rise over the top within about half a second, and fade over roughly two seconds once you break away. **The pads must keep playing underneath.**
3. Trigger a chase, then pass into the temple or the abyss. The pulse must carry through the crossfade and change key, not cut out.
4. Swim into an unlit dark room. The pads should darken *as you enter*, not at the next chord, and the bells should thin out.
5. Descend to the floor. The water should audibly close in past roughly 60% depth.
6. Idle for a minute in a shallow reef — expect shrimp crackle and the occasional click burst. Idle in the abyss — expect groans and rare whale song.
7. Press **J**: the score and the pulse go quiet, the sea life and the pressure hum keep going. Press **M**: everything goes quiet.

The Chrome harness loses canvas keyboard focus easily — drive the modules directly with `javascript_tool` rather than synthetic keypresses.

- [ ] **Step 5: Commit and push**

```bash
git add src/version.js docs/platform/architecture.md README.md
git commit -m "chore(music): build stamp, README bullet, architecture section"
git push
```

---

## Self-Review

**Spec coverage.** Threat derivation → Task 1. Pulse layer, patterns, variants, palette-at-schedule-time → Task 2. Wiring and the facade guard → Task 3. Shading, the live-filter fix, the steeper deep curve, the single-home dark test → Task 4. Sea-life module, the four voices, the structural no-information guarantee, master routing → Task 5. Build stamp, docs, listening pass → Task 6. The spec's "out of scope" list is respected: no task touches `paletteFor`, the palettes, `startMatchTheme`, or persistence.

**Type consistency.** `tensionLevel(creatures, krakens, guardian)` is defined in Task 1 and called with exactly that signature in Task 3. `Tension#setLevel/schedule/stop` are defined in Task 2 and used in Tasks 2 and 3. `Music#setTension/setShade/_motifInterval/_deepCurve/_rampFilters` are defined in Tasks 2 and 4 and referenced by the Task 4 tests. `makeImpulse(ctx, seconds)` is defined in Task 5 and consumed by both `index.js` and `sealife.js` in the same task. `poolFor/bandFor/pickVoice/VOICES` are defined and tested in Task 5.

**Ordering note.** Task 2 Step 1 makes `index.js` import `./tension.js` before Step 4 creates it, so the suite is briefly red between those steps. That is called out in Step 2's expected output and closes within the same task.

---

## What the listening pass changed (2026-09-01)

Measured in-browser with `OfflineAudioContext` renders rather than by ear alone,
because "is it audible over the pads" is a level question with a real answer.
Four things the plan as written got wrong:

1. **The pulse was inaudible.** `PEAK = 0.085` put it at ~1% of the mix. Raised
   to `0.20`, which measures at 0.21–0.47× the score's RMS across all five
   palettes, with peak levels of 0.23–0.34 — no clipping.
2. **The pulse was pitched onto the sub drone.** `degreeFreq` used
   `12 * (octave - 1)`, putting it at 55–87 Hz — organic's root an octave down is
   55 Hz against a 27.5 Hz sub, exactly an octave apart, so it thickened the
   rumble instead of reading as rhythm. Now the root octave (`12 * octave`),
   which lands exactly two octaves above the sub in every palette. Its lowpass
   opened 1400 → 2600 Hz to keep some bite above the pads.
3. **Three sea-life voices were far too quiet** to clear the pressure hum;
   the groan was 0.07× it, because a 120 Hz lowpass on white noise leaves almost
   nothing. Clicks 0.02 → 0.09, crackle 0.012 → 0.05, groan 0.07 → 0.75 with its
   cutoff lifted to 180–340 Hz. All four now sit at 0.9–3× the hum's peak.
4. **`setLevel` restarted its own ramp every frame.** The dive reports the same
   level 60×/second while a chase holds; each call re-issued
   `setTargetAtTime`, restarting the exponential — and since `rising` is false
   once the target is stored, every re-issue used the 2.5 s *fall* constant. A
   held chase measured 0.58 after 2.5 s instead of ~1. Now it returns early when
   the target is unchanged; the rise measures 63.2% at one time constant and
   99.9% by 2.5 s. Guarded by three checks in `music-tension.test.mjs`.

Also worth recording: **`AudioParam.value` does not reflect scheduled
automation**, so the plan's "read the filter frequency back" check is not a valid
test in a real context — it returns the node default (350 Hz for a biquad). The
stub's param object does update `.value`, which is why the Node test passes and
told us nothing. Shading was instead verified by rendering audio and measuring
high-frequency energy: shade drops it 16%, depth 26%. Total RMS is useless here —
the unfiltered sub drone dominates it and masks the change entirely.
