# Next up — Deep Descent

## Where we are

Everything is shipped, live and verified. `main` is clean, 0/0 with origin,
**102 test files pass, `npm run typecheck` exits 0**, and the live build stamp
is `valve-stats-2026-09-02`, matching `src/version.js`. **Nothing is in
flight** — this is a fresh start, not a resumption.

Landed 2026-09-02 (`2bd8bc7`, deployed and verified live): **Depth Valve
purchase telemetry.** Two lifetime counters in `src/meta/stats.js` —
`legacy:valveOffered` (the run reached reef 3 and opened a shop without already
owning one) and `legacy:valveBought` — so `bought / offered` is the attach rate.
Measuring against `dives` would not have answered the question, because most
runs end before the gate reef and were never offered one. Both are 0-or-1 per
run since `hasValve` resets each run.

These are the **first namespaced stat keys**; `tests/core/grandfathered-ids.test.mjs`
rejected the bare names on the first run, which is the contract working. No
progressive track binds them, so they mint no Steam achievement ids and draw
nothing on the Trophy Wall. Read them with
`JSON.parse(localStorage['deepdescent.stats.v1'])`.

This closed the evidence gap behind the 2026-09-01 rebalance
(`VALVE.holdDepthM` 240 → 150, `93ffcce`).

## Next step — ask the user which, don't assume

No single obvious successor. Four candidates:

1. **Playtest and read the new counters.** The most natural follow-on, but it
   needs real dives past reef 3 — the counters started at zero on 2026-09-02, so
   there is nothing to read yet. Two things are still unjudged by felt play:
   whether the valve now actually gets bought, and the music pursuit gates for
   GiantSquid / Piranha / Parasite (600 / 400 / 400 px in
   `src/entities/creatures.js`). Those three never disengage, so an ungated flag
   would hold the chase layer open across a whole reef; if the pulse nags on a
   quiet dive, that is the dial.
2. **Finish P11.2 shell chrome.** Parked at **Task 1 of 7 done** on branch
   `feat/p11-2-shell-chrome` (`031647f`, pushed, no PR, unmerged — it is
   unfinished, do NOT merge it as-is). Next is **Task 2: crash containment in
   the Core**. **Read the plan's "Locked decisions" section first — it is the
   ONLY record of those seven design answers**
   (`docs/superpowers/plans/2026-08-28-p11-2-shell-chrome.md`).
3. **The P11.1 browser pass**, still never done: menu → About → dive →
   Guardian Chest → match-3 → back.
4. **Surface the valve counters in-game** (About screen), if reading them from
   the console proves annoying. Small; explicitly deferred on 2026-09-02 as
   not obviously wanted.

## Watch-outs

- **Every push to `main` deploys to the live site automatically** (~20s, no
  manual step). There is no staging. **Bump `BUILD` in `src/version.js` every
  deploy** and confirm with
  `curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD`.
- **Adding a stat key**: copy the valve counters' shape — `STAT_KEYS`, emit from
  the reef's `_runDelta()`, declare in the owning manifest's `goals.stats`. The
  `:` is inert downstream and old saves backfill to 0 through `sanitize()`, so
  no migration. Never add to `src/core/grandfathered-ids.js` — it throws.
- **Side effects belong in `_openShop`, not `_shopItems`.** That builder runs
  every frame while the shop is drawn; the offer counter is set on open.
- **Web Audio cannot be verified by the Node stub.** A real `AudioParam.value`
  does not reflect scheduled automation (it reads the node default, 350 Hz for
  a biquad) while the stub updates it immediately; total RMS hides filter
  changes behind the sub drone. Measure a real `OfflineAudioContext` render.
- **Per-frame audio setters must return early when unchanged**, or re-issuing
  `setTargetAtTime` restarts the ramp 60x/second and it never lands.
- **`pursuing` on creatures is write-by-creature, read-by-audio only.** Nothing
  in gameplay may branch on it.
- **Balance constants need value tests, not just shape tests** — and a counter
  to tell you whether the tune changed behaviour. `valve-air.test.mjs` had 30
  checks that passed happily at either 240 or 150.
- **Three incompatible assertion styles** in `tests/` — 62 name-first
  `check(name, cond)`, 24 cond-first `check(cond, msg)`, 16 `assert` + `done()`
  (recounted 2026-09-02 across all 102 files). Mixing the two `check` forms
  **silently always-passes**. Copy the style of the file you are editing.
- **The game object is NOT on `window`** — instrument via
  `import('/src/audio.js')` etc. (ES modules are singletons per URL). Driving a
  local `python3 -m http.server` + Playwright and importing the real modules in
  the page is a cheap, high-value boot check before pushing to `main`.
- **Playwright MCP writes `.playwright-mcp/` artifacts into the repo** — it is
  not gitignored, so check `git status` before `git add -A`.
- `feat/underwater-music` is merged and safe to delete whenever.
- Unrelated: `playwright-mcp` (pid varies) runs from `~/Projects/vulcan` and
  backs the browser tooling — leave it alone.
