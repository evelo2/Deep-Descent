# Underwater Music — Design

**Status:** approved in chat 2026-08-31. Supersedes nothing; the match-3 theme
(`startMatchTheme`) is out of scope and stays exactly as it is.

## Problem

There is no music in the dive. `Audio._startAmbient()` (`src/audio.js:31`) is a
single buffer of white noise, lowpassed at 220 Hz, at gain 0.12, looped forever;
`setDepth(t)` nudges that one gain between 0.10 and 0.24. No harmony, no melody,
no movement. The only melodic content in the game belongs to match-3.

There is also **no reverb anywhere in the audio graph** — every voice connects
more or less straight to the destination. That is the main reason the game sounds
thin rather than full: an underwater score is mostly space, and there is none.

## Goal

An eerie, modern, rich underwater score that reacts to where the player is: five
palettes, selected by the reef's own theme and overridden by the special zones.

## Constraints

- **No build step, no asset files.** `assets/` is empty and `audio.js` opens with
  "No asset files" — a deliberate project value. The score is synthesised.
- **No new persisted key.** Mute is not persisted today; the music toggle matches
  that, so the frozen `deepdescent.*` set is untouched.
- Everything must survive `npm run typecheck` and the plain-Node test suite,
  which has no Web Audio implementation.

## Why procedural rather than a recorded track

A produced track would need composing and licensing, which is outside what can be
built here, and it would break the no-assets property. Ambient/drone is also the
one genre where synthesis genuinely wins: with aleatoric motifs the score never
audibly repeats, and it can respond continuously to depth and zone in a way a
loop cannot.

## Architecture

**New `src/music.js`** exporting `class Music`, owned by `Audio`. Keeping it out
of `audio.js` is deliberate: that file is 134 lines of stateless one-shot SFX,
while the music engine is long-lived, scheduled and stateful.

`Audio` gains `startMusic()`, `setPalette(id)`, `setMusicMuted(m)`, and forwards
its existing `setDepth(t)`. No caller outside `audio.js` learns a new interface
except the reef, which calls `setPalette`.

### Signal graph

Built once, on `ensure()`, after the user gesture:

```
voices ──┬── dry ──────────────────┐
         └── send → Convolver ─────┴→ musicBus → master → destination
```

- **Convolution reverb.** `ConvolverNode` fed a procedurally generated impulse
  response: stereo noise shaped by an exponential decay, 4–8 s depending on
  palette. Generated in a buffer at construction, so no asset and no fetch.
- **Pad voices.** Each chord note is 4 oscillators detuned a few cents apart,
  summed through a lowpass whose cutoff rides a slow LFO. The detune is where
  richness comes from; the drift is what keeps it from sounding static.
- **Sub drone.** A 40–55 Hz sine with a slow gain swell. Felt more than heard,
  and most of what "full" means on decent speakers.
- **Aleatoric motifs.** Sparse bell tones drawn at random from the palette's
  scale, weighted to the reverb send, randomly panned via `StereoPannerNode`.
  The randomness is why the score never audibly loops.

### Scheduling

A ~200 ms timer schedules events against `ctx.currentTime` up to ~0.5 s ahead
(standard Web Audio lookahead). **This must not copy `startMatchTheme`'s raw
`setTimeout` chain** — timer drift is inaudible on a bouncy 150 ms jingle and
very audible on sustained harmony.

## The palettes

Plain data: scale, root, chord progression, chord duration, pad waveform, detune
spread, filter range, sub frequency, motif rate, reverb length. Being data is the
point — tuning by ear must be fast.

| id | Character | Applies to |
|---|---|---|
| `beauty` | Consonant modal pads, gentle bells, wide stereo | kelp, neon |
| `dread` | Minor with a suspended second, sub-heavy | volcanic, frozen |
| `horror` | Dissonant clusters, tritone, metallic motifs | haunted, junk, **abyss** |
| `sacral` | Slow fifths and octaves, choral, very long tail | temple |
| `organic` | Close, dry, low, pulsing — a heartbeat room | belly |

### Selection

`paletteFor(zone, themeKey)` is a pure function and the only place the mapping
lives:

- `zone === 'abyss'` → `horror`; `'temple'` → `sacral`; `'belly'` → `organic`.
- Otherwise the reef's palette, from a new `music` field on the six entries of
  `REEF_THEMES` (`src/minigames/reef/index.js:64`), so the score matches the reef
  the player can see and read the name of.
- Unknown zone or theme falls back to `dread` rather than throwing. Audio must
  never be able to break a dive.

Zone changes crossfade over ~2 s, and so does sailing on to a new reef (a fresh
`_newReefName()` roll can change the palette). `stage` and `whirlpool` are short
interludes and keep whatever is playing.

### Lifetime

The score starts when a dive starts and stops on death or return to the menu,
where the existing ambient bed plays alone. It is never running on the title
screen.

## Depth reactivity

The existing `setDepth(t)` call (`reef/index.js:1390`, already wired) drives the
music too: descending lowers the pad filter cutoff, brings the sub drone up in the mix,
raises the reverb send and thins the motif rate. This is what makes the score feel written
for this game rather than dropped into it.

## The music toggle

Music mutes independently of SFX by cutting `musicBus` alone.

- `KEYMAP.music = ['KeyJ']`. M is mute and N launches match-3; J is arbitrary and
  easy to change — it is the one binding here with no mnemonic.
- Gamepad **L3** (button 10, currently unmapped, mirroring torch on R3).
- Touch button beside the existing mute at `x=404, y=8, w=46, h=34`.
- `controls.js` gains a `music` PROMPTS entry so the legend, the hint strip and
  the help screen stay truthful across keyboard, Steam Deck and ROG schemes.
- Not persisted, matching mute.

## Testing

Web Audio does not exist in Node, so the split is deliberate: everything
decidable is pure and tested, and only "does it sound good" is left to ears.

- **`paletteFor(zone, themeKey)`** — every `REEF_THEMES` key resolves to a real
  palette; each zone override wins; unknown input falls back instead of throwing.
  Iterating the real `REEF_THEMES` means adding a seventh theme without music
  fails the suite.
- **Palette table integrity** — every palette carries every required field, scales
  are well-formed, ranges are sane (filter within audible, sub below 80 Hz).
- **Harmony math** — `noteFreq(root, semitones)` against known frequencies, and
  chord construction from scale degrees.
- **Scheduler math** — the lookahead window advances monotonically and never
  schedules an event in the past.
- **Graph construction** against a stub `AudioContext` that records node creation
  and `connect` calls — the same recording-double trick `tests/render/*` already
  uses for canvas. Proves the convolver is in the send path, the bus reaches
  master, muting music leaves SFX routed, and `stop()` disconnects rather than
  leaking oscillators.

New tests live in `tests/audio/`. All new files under `src/` opt into
`// @ts-check`.

## Out of scope

- The match-3 theme (`startMatchTheme`/`stopMatchTheme`) — untouched.
- Menu music. The title screen keeps the existing ambient bed.
- A volume slider or any settings UI.
- Persisting either mute or the music toggle.
- Replacing the noise ambient bed: it stays, as the pressure hum under the score.

## Risk

The engine can be built and made coherent, but it cannot be evaluated without
hearing it. Composition by ear is the substance of ambient music, so the first
implementation is a starting point that will need a tuning pass on chord
voicings, rates and mix. The palettes are plain data specifically to make that
pass cheap.
