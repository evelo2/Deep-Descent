# Music Tension Layer & Sea-Life Ambience — Design

**Status:** approved in chat 2026-09-01. Builds directly on
`2026-08-31-underwater-music-design.md` and is purely additive to it — no palette,
no existing voice, and no existing behaviour changes meaning. Depends on branch
`feat/underwater-music` (PR #4), which is not yet on `main`.

## Problem

The five-palette score reacts to *place* — the reef's theme and the special
zones — and to depth. It does not react to *situation*. A shark closing on you
and an empty stretch of open water sound identical, and the score has no rhythmic
content at all: chords hold 9–20 seconds and motifs fire at random. There is
also no life in the water. The only ambience is a single band of lowpassed noise
standing in for pressure.

Two requests follow from that: "more tracks, similar theme, but some upbeat
fast", and "whale call, dolphin clicks and other 'sea' noises".

## Goal

A situational layer that rides *on top of* the existing score when the dive gets
dangerous or dark, and a sparse bed of off-screen sea life that makes the water
feel inhabited without ever telling the player anything.

## Locked decisions

These were settled in brainstorming and are the reason several obvious cheaper
designs are rejected below.

1. **Upbeat is a situational layer, not new reef themes.** Triggered by a
   predator locking on, by dark zones, and by depth. Several variants per state
   so it does not audibly repeat.
2. **Threat overlays, never replaces.** The temple keeps its sacral pads and its
   identity; a chase adds a driving pulse over the top and fades when the lock
   breaks. A full crossfade was rejected: at `CROSSFADE = 2` seconds it lands
   after the scare is already over.
3. **Sea-life ambience is pure atmosphere.** Off-screen, sparse, varying by depth
   and zone, carrying **no** information. It must never be readable as a warning.
4. **Ambience follows the master mute (M), not the music toggle (J).** It is part
   of the world, like the pressure hum.

## Constraints

Inherited from the score's design and unchanged: no build step, no asset files,
everything synthesised. Must survive `npm run typecheck` and the plain-Node test
suite, which has no Web Audio implementation. No new persisted key — the frozen
`deepdescent.*` set is untouched.

Two further constraints come from the existing engine:

- **`setPalette()` fades every voice in `Music._voices` and rebuilds the sub.**
  Anything living in that array dies on a zone change. The tension layer must
  own its own lifecycle, outside it.
- **`Music.start()`'s interval is `unref()`'d** so it cannot hold Node's event
  loop open under test. Every new scheduler needs the same treatment or the
  suite hangs.

## Architecture

Three new per-frame signals join the existing `setDepth`, all idempotent:

```
reef.update(dt)  ──►  audio.setTension(t)  ──►  music.tension.setLevel(t)
                 ──►  audio.setShade(s)    ──►  music.setShade(s)
                 ──►  audio.setZone(zone)  ──►  sealife.setZone(zone)
```

Tension is an **axis orthogonal to the palette**, not a competitor to it.
`paletteFor(zone, musicId)` keeps its existing precedence and remains the single
place the palette mapping lives; `_applyMusic()` stays a one-liner and gains a
sibling. There is therefore no precedence question to resolve between them.

The three triggers of decision 1 resolve into **two mechanisms**, because they
are not the same kind of thing:

| Trigger | Mechanism |
|---|---|
| Predator locked on | Additive pulse layer (`src/music/tension.js`) |
| Dark zone, unlit | Shading of the existing base — cutoff and motif rate |
| Depth | Steeper curve on the **existing** depth response |

Depth deliberately gets no new knob. `setDepth` already drives cutoff and reverb
send continuously; a separate deep trigger would double-count the same signal.
Past a threshold the existing curve simply steepens, so the deep audibly closes
in without a second mechanism. `shade` therefore means *dark* only.

### Rejected alternatives

- **A `pulse` block on each palette (data-only).** Cheapest diff, and the
  tempting one. It fails both decisions 1 and 2: the pulse would live in
  `_voices` and so die at every zone change, and variants are per-*state* while
  palettes are per-*place*, so encoding them per-palette duplicates the same
  variants five times.
- **A single `tension` scalar that dark and depth also raise.** Simpler surface,
  but it breaks decision 3 by proxy — if darkness sounds like a chase, the player
  learns to read the pulse as a warning, and a dark room with nothing in it lies
  to them. It would also make the deep permanently upbeat, which is backwards.
- **A second `Music` instance.** Duplicate convolver, duplicate bus, duplicate
  mute plumbing, for no gain.

## Component: threat derivation

Creatures gain one field, `pursuing`, set inside their own `update()` at the
point where the pursuit decision already gets made. Roughly eight one-line
additions in `src/entities/creatures.js`, plus the kraken and the chest Guardian,
which count as pursuing whenever alive.

**`pursuing` is written only by the creature and read only by audio. Nothing in
gameplay may branch on it.** That constraint keeps it from drifting into a
behaviour flag, and it means a wrong value can never affect a dive.

A reef-level distance scan was the alternative and is worse: it fires on a
Grouper you happen to stand near but which is not guarding, and it *misses* the
Barracuda `windup` → dash, the scariest moment in the game. The creature knows;
the reef should not guess.

The reef makes one pass and reports a raw target:

```
tension = pursuers === 0 ? 0 : min(1, 0.55 + 0.15 * pursuers)
```

Stepping by pursuer count rather than by proximity is deliberate: a
graded-by-distance level jitters as a creature oscillates around its radius. All
smoothing lives in the tension module — rise ≈0.35 s, fall ≈2.5 s — so the reef
stays a dumb reporter and the long release both absorbs boundary flicker and
supplies decision 2's "fades when the lock breaks".

## Component: the pulse layer

`src/music/tension.js`, `// @ts-check`. A `Tension` class owning its own nodes
and its own `_notes` array, deliberately **not** in `Music._voices`.

`Music` constructs it, forwards `setLevel`, calls
`tension.schedule(now, horizon, this.palette)` from the existing `_tick()`, and
calls `tension.stop()` from `stop()`. It reuses the already-exported, already
tested `eventTimes()` helper for its window maths. It routes dry-heavy into
`music.dry` with only a small `send`: reverb on a chase makes it mushy and slow,
the opposite of the intent. Routing through `dry`/`send` means it reaches `bus`,
so the existing music mute (J) covers it with no new plumbing.

Because the palette arrives as a **parameter at schedule time** rather than being
held, a zone change mid-chase re-derives the next note from the new palette. The
pulse carries straight through the crossfade and changes key underneath itself.
Decision 2 falls out of the architecture rather than being coded for.

**Patterns.** `PATTERNS` is an array of `{ id, stepSeconds, steps }`, where each
step is a scale *degree* into whatever palette is current (or `null` for a rest),
so the pulse is always in key. Three patterns, differing mainly in `stepSeconds`
(≈0.24 / 0.30 / 0.375 — different tempos read as different urgency). One is
picked on each rise from silence and never repeats twice running. Three patterns
across five palettes is fifteen audibly distinct chases for about twenty lines of
data, satisfying decision 1 without a combinatorial table.

Nothing is scheduled while the level is below ~0.01, so the layer costs nothing
on a quiet dive.

## Component: shading, and one existing wart it fixes

`_cutoff()` is read **only when a chord is created**. Changing depth today
therefore does not darken the pad you are currently hearing; it darkens the next
one, which in the temple (`chordSeconds: 20`) is up to twenty seconds away.
Entering a dark room would inherit the same lag and be useless.

`_chordAt` already builds a `filter` per note and discards the reference
(`const rec = { osc, g }`). Storing it as `{ osc, g, filter }` lets `setShade`
and `setDepth` ramp every live filter with `setTargetAtTime`, so the water
darkens as you swim into the dark rather than at the next chord change. The
change is additive to the voice record; the graph tests assert connections, not
record shape. This also sharpens the existing depth response, which has the same
latency bug today.

Shade then does two things, both scalings of existing values and neither adding
a voice:

- cutoff: the `filterDepth` term scaled by `1 - 0.6 * shade`
- bells: `motifPerMinute` scaled by `1 - 0.5 * shade`

Darker and sparser. The source is the dark-zone test already computed at
`src/minigames/reef/index.js:2478` — inside a dark zone, no flare burning, no lit
torch — extracted into a helper so it has one home.

## Component: sea-life ambience

`src/sealife.js`, a sibling to `src/music/`, constructed in `audio.ensure()` and
connected to **`audio.master`**, not to `music.bus`.

That routing *is* decision 4: master mute (M) silences it, the music toggle (J)
does not, and `stopMusic()` in the menu leaves it running — exactly like the
pressure hum it sits beside. It carries its own slow scheduler (~1 s tick, since
events are tens of seconds apart), `unref()`'d like `Music`'s.

Four procedural voices, no assets:

| Voice | Sound | Where |
|---|---|---|
| Whale song | slow 3–6 s glide, 60–200 Hz, heavy reverb, rare | deep, belly |
| Dolphin clicks | burst of 6–20 tiny filtered impulses over ~0.5 s, panned | shallow |
| Distant groan | filtered-noise swell | abyss, deep |
| Shrimp crackle | sparse tiny clicks — the real sound of a reef, and the cheapest thing here | shallow reef |

There are no whales or dolphins in the fauna roster (`src/entities/spawn.js`, 16
kinds; the whale is a *zone* you swim inside). Off-screen atmosphere is therefore
the only honest way to place these sounds, and they must not be wired to entities.

**Decision 3 is enforced structurally rather than by discipline.** Selection is a
weighted table keyed by `(zone, depthBand)`, fired on a randomised interval,
panned randomly, never positioned at the diver and never reachable from a spawn
or damage event. There is no code path by which a sound can correlate with a
threat, so it cannot become readable as one.

## Error handling

Audio must never be able to break a dive — the rule the score already follows via
`paletteFor`'s fallback. Every new entry point is null-guarded at the `Audio`
facade in the existing style (`if (this.music) ...`), so a missing context or a
failed node is silent rather than fatal. An unknown zone falls through to an
empty ambience table, which schedules nothing.

## Testing

`tests/audio/` uses **name-first `check(name, cond)`** against a stub
`AudioContext`, with helpers duplicated per file so each runs standalone. New
files follow that exactly — the repo has three incompatible assertion styles and
mixing the two `check` forms silently always-passes.

- `tests/audio/music-tension.test.mjs` — the layer reaches `bus` (so J mutes it);
  `setPalette()` leaves it playing; consecutive activations pick different
  patterns; nothing is scheduled at level 0; the timer is `unref()`'d.
- `tests/audio/sealife.test.mjs` — connects to `master` and **not** to
  `music.bus`, the direct test of decision 4; the weighted table yields only
  kinds valid for the band; the scheduler is `unref()`'d.
- `tests/audio/music-palette-switch.test.mjs` — extended for the live-filter
  shade and depth ramps.
- Threat derivation is pure arithmetic over a creature list and is tested without
  Web Audio at all.

A listening pass in a real browser on `localhost:8000` is required before this is
called done, as it was for the score. The music is **not live** — `origin/main`
has no `src/music/` and the live stamp is `depth-gauge-2026-08-31` — so the
branch must be served locally. The Chrome harness loses canvas keyboard focus
easily; drive the modules directly with `javascript_tool` rather than synthetic
keypresses.

## Out of scope

Match-3's `startMatchTheme` is untouched. No new palettes. No changes to
`paletteFor`. No persistence. No new mute toggle — the two that exist (M and J)
already cover both new systems by routing alone.
