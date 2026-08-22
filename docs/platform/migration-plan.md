# Platform Migration — Phased Implementation Plan

> **For agentic workers:** implement phase-by-phase. Steps use checkbox (`- [ ]`)
> syntax. This plan is **self-contained**: it is designed to be resumed from a
> cold context (after `/clear`) using only this file + `architecture.md` + git.

**Goal:** Convert the monolithic Deep Descent into a **Core shell + pluggable
MiniGame modules sharing one meta-progression spine**, via strangler-fig
extraction — without a rewrite, keeping the game shippable and green at every step.

**Architecture:** See `docs/platform/architecture.md` (the spec this plan
implements). Core owns lifecycle + economy/progression/achievements + shared
services + an optional DiverWorld engine; each minigame implements a small
`MiniGame` contract and receives a `Host` facade.

**Tech Stack:** Vanilla ES modules, Canvas, Web Audio. No build step yet (added
only at Phase 8's trigger). Tests: plain `node file.test.mjs` + `check()`.

**Spec:** `docs/platform/architecture.md`

---

## Global Constraints (bind every phase)

- **No behavioral change** to the shipped game during extraction. Each phase must
  be provably identical to `baseline/v1.0-pre-platform` (tag) / `src/version.js`.
- **Suite green at every phase.** No phase merges red. Run the full suite before
  every commit: `for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done`
- **No new web-build runtime dependencies** until the Phase 8 trigger.
- **Ship pipeline** (unchanged): implement on a `feat/platform-pN-*` branch →
  full suite green → browser-verify on a **fresh port** (ES-module cache gotcha:
  always use a new port or hard-refresh) → commit → `--no-ff` merge to `main` →
  push (auto-deploys).
- **Bump `src/version.js` `BUILD`** at each phase (`platform-p1`, `platform-p2`, …)
  so the deployed build self-identifies (console banner).
- Follow existing code idioms; keep files focused. When `game.js` shrinks, do not
  add cleverness — move code, keep behavior.

---

## Context Recovery — READ FIRST after any `/clear`

You are resuming a long migration. Do this before writing code:

1. Read `docs/platform/architecture.md` (target design) and this file.
2. `git log --oneline -15` and check `src/version.js` `BUILD` — tells you the last
   landed phase.
3. Find the first phase below whose tasks are not all `- [x]`. That is your
   resume point. A phase whose box is checked is DONE — do not redo it.
4. Confirm green: run the full suite (command above).
5. **Expand the next phase to bite-sized steps** (Phases 2+ are specified at
   deliverable level on purpose — see "Detail-on-demand" below), then execute.

**Detail-on-demand:** Phase 1 is fully bite-sized (the exemplar). Phases 2–8 are
specified as deliverables + test gates + interfaces. At the START of each of
those phases (right after a `/clear`), first expand that phase's tasks into
bite-sized TDD steps in this file, commit that expansion, then implement. This
keeps the plan accurate (later phases depend on earlier extraction outcomes)
without front-loading guesses.

---

## Checkpoint Protocol (the /compact + /clear discipline)

Between phases and at long-phase midpoints, run a **🧹 CHECKPOINT**:

1. Full suite green + browser-verify (fresh port).
2. Commit → merge `--no-ff` to `main` → push.
3. **Update this file:** tick the phase's `- [x]` boxes and add a one-line
   "Landed: <commit> — <note>" under the phase heading.
4. Update memory (`MEMORY.md` + the platform memory note) with the new state.
5. Then:
   - **`/compact`** — MID-phase, when context is large but you're not at a clean
     seam yet (e.g. halfway through extracting a zone). Preserves the thread.
   - **`/clear`** — BETWEEN phases, at a clean seam (phase merged + docs updated).
     Preferred: the plan + architecture doc + git fully reconstruct context, so a
     cold start is cheap and keeps each phase's context tight and cheap.

**Rule of thumb:** one phase ≈ one context. Aim to `/clear` at each phase
boundary; `/compact` only if a single phase outgrows its context.

Recommended checkpoints are marked **🧹 CHECKPOINT → /clear** (or `/compact`)
at each phase end below.

---

## Phase 0 — Baseline flag + docs  ✅ (this turn)

- [x] `src/version.js` (VERSION/BUILD/KNOWN_GOOD_BASELINE) + boot banner in `main.js`
- [x] `docs/platform/architecture.md` (design) + `docs/platform/migration-plan.md` (this)
- [x] git tag `baseline/v1.0-pre-platform` on the merge commit
- [x] Suite green; merged to `main`

**🧹 CHECKPOINT → /clear.** Resume at Phase 1 from a cold context.

---

## Phase 1 — Core + Host + contract; wrap the game as one legacy MiniGame

**Aim:** Stand up the platform *around* the untouched game. The Core boots,
builds a `Host`, and delegates to the current game via the `MiniGame` contract —
**zero behavioral change**. This de-risks everything: the platform exists and the
game runs through it before anything is extracted.

**Landed:** `feat/platform-p1` → main — Core+Host+contract stood up; whole game
wrapped as the `legacy` MiniGame; `main.js` boots + drives the RAF loop through
`Core.update/render`. Zero behavior change (browser-verified vs baseline: menu,
dive, HUD, gameplay identical; banner logs; no console errors). Suite 54/54
(added `tests/core/host.test.mjs` + `tests/core/core.test.mjs`). `BUILD='platform-p1'`.

**Files:**
- Create `src/core/contract.js` — JSDoc typedefs for `MiniGame`, `Host`, `MiniGameResult` (doc-only; no runtime).
- Create `src/core/host.js` — `makeHost({audio, input, particles, viewport, rng, economy, progression, achievements, world})` returning the facade.
- Create `src/core/core.js` — `Core` with `register(minigame)`, `boot()`, `update(dt)`, `render(ctx)`; owns the active-minigame pointer and the result→credit flow (stubbed to no-op credit in P1).
- Create `src/minigames/legacy/index.js` — wraps the existing `Game` as a `MiniGame` (`enter/update/render/exit` delegate to the current `Game` instance).
- Modify `src/main.js` — build Core, register the legacy minigame, boot through Core instead of driving `Game` directly.
- Test: `tests/core/contract.test.mjs`, `tests/core/host.test.mjs`, `tests/core/core.test.mjs`.

**Interfaces produced (later phases rely on these exact names):**
- `Core.register(mg)`, `Core.boot(id)`, `Core.update(dt)`, `Core.render(ctx)`, `Core.creditResult(result)`
- `makeHost(services) → Host`
- `MiniGame`, `Host`, `MiniGameResult` typedefs in `core/contract.js`

- [x] **Step 1** — Write `tests/core/host.test.mjs`: `makeHost({...stubs})` exposes `economy/progression/achievements/audio/particles/viewport/rng`; `world` is present only when passed.
- [x] **Step 2** — Run it; expect FAIL (no module). `node tests/core/host.test.mjs`
- [x] **Step 3** — Implement `src/core/contract.js` (typedefs) + `src/core/host.js`.
- [x] **Step 4** — Run host test; expect PASS.
- [x] **Step 5** — Write `tests/core/core.test.mjs`: register a fake minigame, `boot('fake')` calls its `enter(host)`; `update/render` delegate; a fake `exit()` result is passed to `creditResult` (spy).
- [x] **Step 6** — Run it; expect FAIL.
- [x] **Step 7** — Implement `src/core/core.js` to pass. Keep `creditResult` a no-op-with-hook in P1.
- [x] **Step 8** — Run core test; expect PASS.
- [x] **Step 9** — Implement `src/minigames/legacy/index.js` wrapping `Game` (construct/hold the instance; delegate `enter/update/render`; `exit` returns `{outcome}`).
- [x] **Step 10** — Rewire `src/main.js`: build services → `makeHost` → `new Core` → `register(legacy)` → `boot('legacy')`; RAF loop calls `core.update/render`.
- [x] **Step 11** — Full suite green.
- [x] **Step 12** — Browser-verify on a fresh port: menu, a dive, a zone, game-over all behave **identically** to baseline; console shows the version banner; no errors.
- [x] **Step 13** — Bump `BUILD='platform-p1'`; commit.

**🧹 CHECKPOINT → /clear.** (This phase touches boot + a new layer; verify hard.)

---

## Phase 2 — Promote the meta-spine to Core services

**Landed:** `feat/platform-p2` — `core/economy.js` (wallet over `meta/salvage.js`),
`core/progression.js` (badges+stats+tiers over `meta/{badges,stats,progressive}.js`),
`core/achievements.js` (Steam bridge over `platform/steam.js`) stand up as
Host-exposed services. `Core.creditResult` is now the real uniform credit path
(salvage→earn, stats→recordRun, ids→unlock; skips `credited` report-only results).
The legacy `Game` sources its meta state objects FROM the services (same refs), so
`game.js` internals are byte-identical yet the wallet/progression are Core-owned and
shared — browser-proved `game.meta === economy.state` (+ badges/stats/progress),
earning via the service is visible to the game, persistence keys unchanged (the four
baseline `.v1` keys), a real dive plays identically, banner reads `platform-p2`, no
console errors. Suite 57/57 (added economy/progression/achievements tests + extended
core.test). `BUILD='platform-p2'`.

**Aim:** `salvage.js`/`badges.js`/`stats.js`/`progressive.js` become the
Host-exposed `economy`/`progression`/`achievements` services; the legacy game
credits rewards **through the Host** instead of its own internals. One economy,
reachable by any future minigame.

**Deliverables:** `src/core/economy.js`, `src/core/progression.js`,
`src/core/achievements.js` (thin services over the existing storage-injectable
meta modules — reuse, don't rewrite). `Core.creditResult` now really credits.
Legacy minigame's `exit()` returns a real `MiniGameResult` (salvage/stats/etc.).

**Test gates:** new service unit tests; persistence identical to baseline
(same localStorage keys/format); existing salvage/badges/stats/progressive tests
stay green. Browser: a full run still banks Salvage, awards badges/tiers, unlocks
Steam (web no-op) exactly as before.

### Design notes (locked before implementing — see the constraints they satisfy)

Two facts about the current code bind the design:

1. **No test constructs `new Game(...)`** — every game test drives
   `Game.prototype.<method>.call(stub)` on a hand-built stub. So the `Game`
   *constructor* is free to change, but rewiring `_gameOver`/`_bankLoot`/shop
   *internals* to call `this.economy.earn(...)` would break those stubs (they
   carry no `economy`/`progression`). Internals therefore stay byte-identical.
2. **The legacy game persists mid-run** (banking salvage, shop spends, pearls) and
   **awards badges/tiers at game-over for immediate on-screen display.** Nothing
   calls the legacy `exit()` during normal play (the inter-minigame router lands
   in P3+), so the legacy game *cannot* defer crediting to `Core.creditResult` —
   it must credit inline, exactly as today.

**The seam that satisfies both:** the services become the **owner** of the loaded
meta state; `Game` *sources its state objects from the services* (same object
references) in its constructor. Every existing inline mutation + `saveSalvage`/
`saveBadges`/… call in `game.js` is then unchanged, yet the wallet/progression are
now Core-owned and reachable by any future minigame via `host.economy.state` etc.
This is the moat (one shared economy) delivered with zero behavior change.

`Core.creditResult(result)` becomes the **real uniform credit path** used by
*future* minigames (and unit-tested now): given a `MiniGameResult` it credits
`economy.earn` + `progression.recordRun` + `achievements.unlock`. The legacy game
self-credits inline, so its `exit()` returns a **report-only** result
(`{outcome, score, reef, credited:true}`) and `creditResult` skips anything marked
`credited` — no double-count. (Tightening the legacy internals to call service
methods happens naturally as `game.js` shrinks in P3–P5.)

**Service surfaces (thin wrappers over the existing meta modules — reuse):**
- `makeEconomy({store}) →` `{ state, balance(), save(), earn({salvage}),`
  `bankReefRelic(reef), consumeReefRelic(reef), availableSkips() }`
  (over `meta/salvage.js`; `state` is the loaded salvage bag).
- `makeProgression({store}) →` `{ badges, stats, progress, rank(),`
  `recordRun({runStats, runDelta}) → {newBadges, freshTiers} }`
  (over `meta/badges.js` + `meta/stats.js` + `meta/progressive.js`; mirrors the
  exact award order in today's `_gameOver`).
- `makeAchievements({unlock}) →` `{ unlock(id) }` (over `platform/steam.js`;
  `unlock` injectable for tests, defaults to `unlockAchievement`).

**Steps (TDD — write the test, watch it fail, implement, watch it pass):**

- [x] **Step 1** — `tests/core/economy.test.mjs`: `makeEconomy({store})` loads via
  `loadSalvage` (same key/format), `balance()` reads `state.salvage`, `earn({salvage})`
  adds + persists (round-trips through the same store), reef-relic passthroughs work.
- [x] **Step 2** — Run it → FAIL. Implement `src/core/economy.js`. Run → PASS.
- [x] **Step 3** — `tests/core/progression.test.mjs`: `makeProgression({store})` loads
  badges/stats/progress; `recordRun({runStats, runDelta})` awards badges, folds stats,
  awards tiers, persists all three (same keys), and returns `{newBadges, freshTiers}`;
  a second identical `recordRun` returns empty badge/tier lists but the stat delta is
  applied again (matches `addRun` semantics — caller guards double-calls, as `_gameOver`
  already does). `rank()` reflects earned count.
- [x] **Step 4** — Run it → FAIL. Implement `src/core/progression.js`. Run → PASS.
- [x] **Step 5** — `tests/core/achievements.test.mjs`: `makeAchievements({unlock:spy})`
  forwards `unlock(id)` to the injected fn; defaults wire to `unlockAchievement`.
- [x] **Step 6** — Run it → FAIL. Implement `src/core/achievements.js`. Run → PASS.
- [x] **Step 7** — Extend `tests/core/core.test.mjs`: with a host carrying spy
  economy/progression/achievements, `creditResult({salvage, stats:{delta,summary},
  achievements:[id]})` credits each once; `creditResult({credited:true, salvage})`
  credits nothing (report-only); `creditResult(undefined)` is a no-op.
- [x] **Step 8** — Run it → FAIL. Implement `Core.creditResult`. Run → PASS.
- [x] **Step 9** — `game.js` constructor: accept an optional `services` arg; when
  present, `this.meta = services.economy.state`, `this.badgeState =
  services.progression.badges`, `this.statState = services.progression.stats`,
  `this.progressState = services.progression.progress`; else load directly (fallback
  preserves the no-services path). **No other line of `game.js` changes.**
- [x] **Step 10** — `minigames/legacy/index.js`: accept `{economy, progression,
  achievements}`, pass them to `new Game(...)` as the `services` arg; `exit()` returns
  `{outcome: game.won ? 'won' : (game.state === 'playing' ? 'bailed' : 'lost'), score:
  game.score, reef: game.reef, credited: true}`.
- [x] **Step 11** — `main.js`: build `economy/progression/achievements` via the three
  factories, pass into `makeHost` (replacing the P1 `null`s) **and** into
  `createLegacyMiniGame`.
- [x] **Step 12** — Full suite green (all 54 prior + the new service/core tests).
- [x] **Step 13** — Browser-verify on a **fresh port**: a full run banks Salvage, the
  shop spends, reef-relics bank/cash, game-over awards badges + progressive tiers with
  toasts, the Trophy Wall + rank render — all **identical** to baseline. Console banner
  reads `platform-p2`; no errors. (Verify persistence keys unchanged in DevTools →
  Application → Local Storage.)
- [x] **Step 14** — Bump `BUILD='platform-p2'`; commit.

**🧹 CHECKPOINT → /clear.**

---

## Phase 3 — Extract Whirlpool as the first real MiniGame

**Aim:** Move `_updateWhirlpool/_whirlpoolHit/_whirlHud/_enter/_exit` + whirl
state out of `game.js` into `src/minigames/whirlpool/` implementing `MiniGame`,
using `host.world` (diver-world) + `host.economy`. The reef game hands off to it
via the Core router; on exit it returns rewards through the result flow.

**Why first:** the whirlpool is the most self-contained zone (its own update/draw
path, no cave/miner) — smallest safe extraction to prove the pattern.

**Test gates:** new `tests/minigames/whirlpool.test.mjs` (port + extend the
existing `whirlpool-lives` logic); `game.js` no longer references whirl internals;
browser-verify the whirlpool plays identically (3 lives, banking, bail-out).

**🧹 CHECKPOINT → /clear.**

---

## Phase 4 — Extract the remaining zones (one slice per sub-phase)

Repeat the Phase-3 pattern, **one zone per checkpoint** (each its own branch +
merge + `/clear`):

- [ ] **4a** — Trench / abyss + mini-sub (`minigames/trench/`). Carries sub armor,
  net-only, eject, exit-air. Reuses `host.world`.
- [ ] **4b** — Temple (`minigames/temple/`). Vault treasures, gate, exit.
- [ ] **4c** — Platformer stage (`minigames/stage/`). Uses the `stage/` chunkgen +
  decor already modular; wrap its update/draw.
- [ ] **4d** — Whale belly (`minigames/whale/`).

Each: extract → `game.js` shrinks → new module test → browser-verify identical →
checkpoint. **/clear between each.**

---

## Phase 5 — Extract the reef as the main diver-world MiniGame

**Aim:** The core reef loop becomes `minigames/reef/` implementing `MiniGame`.
`game.js` is now reduced to (or replaced by) the **Core shell** — menu, router,
services — holding no gameplay. This is the payoff: the god-object is gone.

**Test gates:** the largest verification — full playthrough parity vs baseline
(reef → each zone → bank → sail → next reef → game-over → badges). Suite green.

**🧹 CHECKPOINT → /clear.**

---

## Phase 6 — Formalize the shared DiverWorld engine

**Aim:** Factor the diver + cave + physics + shared-HUD primitives that the
diver-world minigames use into `src/core/world/`, with a clean surface
(`host.world`). Removes duplication left after extraction.

**Test gates:** diver-world minigames still play identically; new `core/world`
unit tests for the extracted surface.

**🧹 CHECKPOINT → /clear.**

---

## Phase 7 — Type the boundary (JSDoc + `tsc --noEmit`)

**Aim:** Lock the contract with types where drift hurts most. **No build step, no
runtime change.**

**Deliverables:** `src/core/contract.d.ts` (or JSDoc typedefs made authoritative);
a dev-only `tsconfig.json` (`checkJs`, `noEmit`, `strict` to taste) added as a
`devDependency` on the *tooling* side only (never shipped to the web build);
`npm run typecheck` script. Add `// @ts-check` to `core/*` + `minigames/*/index.js`
first, widen opportunistically.

**Test gates:** `npm run typecheck` clean; runtime + web deploy untouched; suite green.

**🧹 CHECKPOINT → /clear.**

---

## Phase 8 — First NEW minigame + the build-step trigger

**Aim:** Prove the platform by building a small **new** minigame against the
contract. If it's a *diver-world mode*, it needs nothing new. If it's a
*bring-your-own-engine* game wanting lazy-load/minify, this is the trigger to:

- Add **esbuild** (fast, minimal) as the web bundler + adopt full **TypeScript**
  (small delta now that the boundary is typed).
- Update `desktop/` sync to consume the bundle; update the GitHub Pages deploy to
  publish the build output.

**Decision gate (do not skip):** only pull in esbuild+TS if a real minigame needs
it. A pure diver-world addition does not — keep the no-build posture until then.

**🧹 CHECKPOINT → /clear.**

---

## Self-review (done at authoring)

- Coverage: every architecture.md section maps to a phase (contract→P1, spine→P2,
  extraction→P3–5, DiverWorld→P6, types→P7, build trigger→P8).
- No behavioral change is a hard global constraint with a per-phase parity gate.
- Detail-on-demand is explicit so later-phase guesses aren't baked in prematurely.
- /compact vs /clear guidance is concrete and per-phase.
