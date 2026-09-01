# Next up — Deep Descent

## Where we are
The **five-palette procedural score is built and the user loves it.** Branch
`feat/underwater-music`, **PR #4** — https://github.com/evelo2/Deep-Descent/pull/4
— 7 commits, pushed, **98 tests green, `npm run typecheck` exits 0**, working
tree clean. The plan's required listening pass passed on 2026-09-01; no tuning
was asked for.

`main` itself has NOT moved — PR #4 is still open and unmerged.

## Next step
We were **mid-brainstorm** (architectural path) on the follow-up the user asked
for: *"more tracks, similar theme, but some upbeat fast"* plus *"whale call,
dolphin clicks and other 'sea' noises"*.

Clarifying questions are DONE — **four decisions are locked** (see below). The
next step is the brainstorming skill's **"propose 2–3 approaches"** step for the
overlay architecture, then design sections → spec in
`docs/superpowers/specs/` → `superpowers:writing-plans`.

### Locked decisions — the ONLY record of these
1. **Upbeat is a SITUATIONAL layer, not new reef themes.** Triggers: a predator
   locking on (octopus etc.), dark zones (ominous), and below a depth threshold.
   Needs **several variants per state** so it doesn't repeat.
2. **Threat OVERLAYS, never replaces.** The temple keeps its sacral pads and
   identity; a chase adds a driving pulse on top and fades when the lock breaks.
   Rejected a full crossfade: 2s lands after the scare is over. This also lets
   dark/deep shade the base while threat rides above it.
3. **Sea-life ambience is PURE ATMOSPHERE.** Off-screen, sparse, varies by depth
   and zone, carries **no** information — it must never be readable as a warning.
4. **Ambience follows the master mute (M), not the music toggle (J).** It is part
   of the world, like the pressure hum.

Still undecided: how the pulse layer is actually built, how the overlay composes
with `paletteFor`'s existing precedence, and how many variants per state.

## Watch-outs
- **The music engine has NO rhythm.** Chords hold 9–20s and motifs are random.
  "Upbeat/fast" is unreachable by tuning `chordSeconds` — it needs a genuinely
  new pulse/arpeggio capability. Do not plan it as a data-only change.
- **There are no whales or dolphins in the fauna roster** (`src/entities/spawn.js`,
  16 kinds). The whale is a *zone* you swim inside. Whale song is therefore
  off-screen atmosphere by necessity — do not wire it to an entity.
- **`paletteFor` is the single place the palette mapping lives** and the reef
  calls `_applyMusic()` and nothing else. Keep any new rule there, not scattered.
- **`Music.start()`'s interval is `unref()`'d** so it can't hold Node's event
  loop open in tests. Any new scheduler needs the same treatment or the suite hangs.
- **Three incompatible assertion styles** live in `tests/` (see CLAUDE.md).
  Mixing the two `check()` ones silently always-passes.
- **Run audio work in a real browser before believing it.** Note the Chrome
  harness loses canvas keyboard focus easily — driving modules directly with
  `javascript_tool` is far more reliable than synthetic keypresses.

## Older debts, both still unpaid
1. **Nobody has bought a Depth Valve mid-dive** (needs reef 3 + 400g).
   `VALVE.holdDepthM` = 240 is a guess, not balance.
2. **The P11.1 browser pass** — menu → About → dive → Guardian Chest → match-3 → back.
3. **P11.2 shell chrome** is still parked at Task 2 on branch
   `feat/p11-2-shell-chrome` (`031647f`, local, unpushed). Read that plan's
   **"Locked decisions"** first — it is the only record of those seven answers.
