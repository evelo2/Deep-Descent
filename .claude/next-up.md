# Next up — Deep Descent

## Where we are

**The underwater score is finished and LIVE.** PR #4 merged to `main` on
2026-09-01 (merge commit `2903503`); the Pages deploy succeeded and the live
build stamp is `music-tension-2026-09-01`, verified against `src/version.js`.
That shipped both the five-palette score *and* its follow-up: a threat pulse
that overlays the score during a chase, dark-zone shading of the pads, and a
sparse bed of off-screen sea life.

`main` is clean, 0/0 with origin, 101 test files pass, `npm run typecheck`
exits 0. **Nothing is in flight.** This is a fresh start, not a resumption.

Spec: `docs/superpowers/specs/2026-09-01-music-tension-and-ambience-design.md`
Plan (incl. a "what the listening pass changed" section):
`docs/superpowers/plans/2026-09-01-music-tension-and-ambience.md`

## Next step — ask the user which, don't assume

There is no single obvious next task. Four real candidates, roughly ordered by
how much they're owed:

1. **Finish P11.2 shell chrome.** Parked at **Task 1 of 7 done** on branch
   `feat/p11-2-shell-chrome` (`031647f`, pushed 2026-09-01, no PR, unmerged —
   it is unfinished, do not merge it as-is). Next is **Task 2: crash
   containment in the Core**. **Read the plan's "Locked decisions" section
   first — it is the ONLY record of those seven design answers**
   (`docs/superpowers/plans/2026-08-28-p11-2-shell-chrome.md`).
2. **The P11.1 browser pass**, still never done: menu → About → dive →
   Guardian Chest → match-3 → back.
3. **Tune the new music triggers by ear now that it's live.** The pursuit gates
   for GiantSquid / Piranha / Parasite (600 / 400 / 400 px in
   `src/entities/creatures.js`) are *reasoned, not tuned* — those three never
   disengage, so an ungated flag would hold the chase layer open across a whole
   reef. If the pulse nags on a quiet dive, that's the dial.
4. **Depth Valve balance.** Nobody has ever bought one mid-dive (needs reef 3
   + 400g); `VALVE.holdDepthM = 240` is a guess. NOTE: the 2026-08-23 balance
   backlog is NOT outstanding — both its items shipped that same day
   (`ad03c00`, `73bae68`); only the MEMORY.md index line was stale.

## Watch-outs

- **Every push to `main` deploys to the live site automatically** (~20s, no
  manual step). There is no staging. Confirm with
  `curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD`
  and **bump `BUILD` in `src/version.js` every deploy**.
- **Web Audio cannot be verified by the Node stub.** A real `AudioParam.value`
  does not reflect scheduled automation (it reads the node default, 350 Hz for
  a biquad) while the stub updates it immediately; total RMS hides filter
  changes behind the sub drone. Measure a real `OfflineAudioContext` render.
  Now written up in CLAUDE.md's Known gotchas.
- **Per-frame audio setters must return early when unchanged**, or re-issuing
  `setTargetAtTime` restarts the ramp 60x/second and it never lands.
- **`pursuing` on creatures is write-by-creature, read-by-audio only.** Nothing
  in gameplay may branch on it.
- **Three incompatible assertion styles** in `tests/` — 62 name-first
  `check(name, cond)`, 23 cond-first `check(cond, msg)`, 16 `assert` + `done()`
  (recounted 2026-09-01 across all 101 files). Mixing the two `check` forms
  **silently always-passes**. Copy the style of the file you are editing.
- **The game object is NOT on `window`** — instrument `Audio.prototype` via
  `import('/src/audio.js')` instead (ES modules are singletons per URL).
- `feat/underwater-music` still exists locally and on origin; it is merged and
  safe to delete whenever.
