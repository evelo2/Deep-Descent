# Next up — Deep Descent

## Where we are

Everything is shipped, live and verified. `main` is clean, 0/0 with origin,
**101 test files pass, `npm run typecheck` exits 0**, and the live build stamp
is `valve-balance-2026-09-01`, matching `src/version.js`. **Nothing is in
flight** — this is a fresh start, not a resumption.

Two things landed on 2026-09-01:

1. **The underwater score is complete and live** (PR #4, merge `2903503`) — the
   five-palette score plus a threat pulse that overlays it during a chase,
   dark-zone shading of the pads, and a sparse bed of off-screen sea life.
   Spec/plan: `docs/superpowers/{specs,plans}/2026-09-01-music-tension-and-ambience*`.
2. **Depth Valve rebalanced** (`93ffcce`) — `VALVE.holdDepthM` 240 → 150. At 240
   it was strictly dominated by the Sealed Wetsuit (−35% at every depth from
   reef 1) and nobody ever bought one. Now it saves ~15% by 240 m and ~33% at
   the floor; air on the floor lasts 17.8 s → 26.7 s. Reasoning is in the
   `VALVE` comment in `src/config.js`; `tests/game/valve-air.test.mjs` gained
   balance assertions that pin the curve.

## Next step — ask the user which, don't assume

No single obvious successor. Four candidates:

1. **Finish P11.2 shell chrome.** Parked at **Task 1 of 7 done** on branch
   `feat/p11-2-shell-chrome` (`031647f`, pushed, no PR, unmerged — it is
   unfinished, do NOT merge it as-is). Next is **Task 2: crash containment in
   the Core**. **Read the plan's "Locked decisions" section first — it is the
   ONLY record of those seven design answers**
   (`docs/superpowers/plans/2026-08-28-p11-2-shell-chrome.md`).
2. **The P11.1 browser pass**, still never done: menu → About → dive →
   Guardian Chest → match-3 → back.
3. **Playtest the two 2026-09-01 changes and tune by ear.** Both shipped on
   reasoning plus measurement, not on felt play:
   - Music pursuit gates for GiantSquid / Piranha / Parasite (600 / 400 / 400 px
     in `src/entities/creatures.js`). Those three never disengage, so an
     ungated flag would hold the chase layer open across a whole reef. If the
     pulse nags on a quiet dive, that is the dial.
   - Whether the Depth Valve now actually gets bought.
4. **Track valve purchases in `src/meta/stats.js`.** Not tracked today, so
   "nobody buys it" is anecdote rather than data — and that is exactly how we
   would judge whether change 2 above worked. Small, and it would close the
   evidence gap. (Adding a stat id means namespacing it `<minigameId>:<key>` —
   see CLAUDE.md on the frozen persistence keys.)

## Watch-outs

- **Every push to `main` deploys to the live site automatically** (~20s, no
  manual step). There is no staging. **Bump `BUILD` in `src/version.js` every
  deploy** and confirm with
  `curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD`.
- **Web Audio cannot be verified by the Node stub.** A real `AudioParam.value`
  does not reflect scheduled automation (it reads the node default, 350 Hz for
  a biquad) while the stub updates it immediately; total RMS hides filter
  changes behind the sub drone. Measure a real `OfflineAudioContext` render.
  Written up in CLAUDE.md's Known gotchas.
- **Per-frame audio setters must return early when unchanged**, or re-issuing
  `setTargetAtTime` restarts the ramp 60x/second and it never lands.
- **`pursuing` on creatures is write-by-creature, read-by-audio only.** Nothing
  in gameplay may branch on it.
- **Balance constants need value tests, not just shape tests.**
  `valve-air.test.mjs` had 30 checks that passed happily at either 240 or 150 —
  they tested the clamp's shape and never its worth. If you tune a balance
  number, pin the resulting curve.
- **Three incompatible assertion styles** in `tests/` — 62 name-first
  `check(name, cond)`, 23 cond-first `check(cond, msg)`, 16 `assert` + `done()`
  (recounted 2026-09-01 across all 101 files). Mixing the two `check` forms
  **silently always-passes**. Copy the style of the file you are editing.
- **The game object is NOT on `window`** — instrument `Audio.prototype` via
  `import('/src/audio.js')` instead (ES modules are singletons per URL).
- The 2026-08-23 balance backlog is **not** outstanding; both its items shipped
  that same day (`ad03c00`, `73bae68`). Only its MEMORY.md index line was stale.
- `feat/underwater-music` is merged and safe to delete whenever.
- Unrelated: `playwright-mcp` (pid varies) runs from `~/Projects/vulcan` and
  backs the browser tooling — leave it alone. Ten orphaned vitest workers from
  that same project were cleaned up on 2026-09-01; they were never ours.
