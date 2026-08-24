# Deep Descent → Platform Architecture (Design)

**Status:** approved direction (2026-08-22). Design reference for the migration
plan in `migration-plan.md`. No code beyond the baseline flag has been written
against this yet.

---

## 1. Why

Deep Descent is moving from a hobby game to a **paid Steam product** that will
grow into a **collection of minigames** over time. Each minigame will
increasingly bring its own mechanics — some are lightweight variations on the
diver world, some are fully independent engines. The long-lived asset is the
**core lifecycle + a shared meta-progression spine**, with minigames plugged in
behind a stable contract and loaded on demand.

Two product decisions (confirmed) drive the design:

- **Spectrum of independence:** minigames range from *diver-world modes* (share
  the core diver + physics, swap objective/hazards — like today's special zones)
  to *bring-your-own-engine* games (a puzzle, a rhythm game — share only the
  shell). The contract must serve both.
- **One economy across all:** currency (Salvage/gold/pearls), lifetime stats,
  achievements, and unlocks earned in *any* minigame feed *one* wallet and
  progression. This shared spine is the product's moat — it makes a *collection*,
  not a folder of demos.

## 2. Current state (the starting point)

- Vanilla ES modules, HTML5 Canvas, Web Audio. No build step, no dependencies.
  Runs directly from source; auto-deploys to GitHub Pages on push to `main`.
- **43 source files, ~10,900 lines.** `src/game.js` is a **3,600-line god-object**
  that holds the menu/lifecycle, the reef "main game", AND five special zones —
  whirlpool, abyss/sub trench, temple, whale belly, platformer stage — each with
  its own `_enterX/_updateX/_drawX/_exitX` and state, all sharing `this`.
- **52 plain-`node` test files** (`node file.test.mjs`, custom `check()`), no
  framework. A DOM stub lets tests import `game.js`.
- Meta modules are **already storage-injectable and modular**: `meta/salvage.js`,
  `meta/badges.js`, `meta/stats.js`, `meta/progressive.js` — ~80% of the way to
  being Core services.
- A `desktop/` Electron wrapper (Steam) already exists and *copies* raw source
  (no transpile), with a `src/platform/steam.js` seam for achievements.

**Key insight:** the five special zones are already *proto-minigames* — just
tangled into one file. The migration is mostly **extraction**, not a rewrite.

## 3. Target architecture

```
┌──────────────────────────────────────────────────────────────┐
│  CORE / SHELL  (owns the true lifecycle)                      │
│   • boot, menu, pause, the run/session router                 │
│   • META-SPINE services (the moat):                           │
│       economy (wallet: salvage/gold/pearls)                   │
│       progression (lifetime stats → progressive badges)       │
│       achievements (→ Steam via platform/steam.js)            │
│       shop / unlocks                                          │
│   • shared services: audio, input, particles, viewport, rng   │
│   • optional shared DiverWorld engine (diver + cave + physics)│
│   • Host: the object handed to each minigame (facade of ↑)    │
└───────────────┬──────────────────────────────────────────────┘
                │ loads (eager or lazy import()) + runs one at a time
   ┌────────────┼───────────────┬───────────────────────┐
   ▼            ▼               ▼                       ▼
MiniGame     MiniGame        MiniGame                MiniGame
(reef)       (whirlpool)     (trench/sub)            (future: puzzle,
uses host.world  uses host.world  uses host.world      brings own engine,
+ host.economy   + host.economy   + host.economy       host.economy only)
```

### 3.1 The MiniGame contract (the seam)

Every minigame implements one small interface. Capabilities are **opted into**
via the `host` — that's what serves the spectrum:

```js
/**
 * @typedef {Object} MiniGame
 * @property {string} id
 * @property {{name:string, blurb?:string}} meta
 * @property {() => Promise<void>} [load]   // optional async: lazy-load heavy engine/assets
 * @property {(host: Host, opts?: object) => void} enter
 * @property {(dt: number, input: InputState) => void} update
 * @property {(ctx: CanvasRenderingContext2D) => void} render
 * @property {() => MiniGameResult} exit    // returns rewards to credit
 */

/**
 * @typedef {Object} MiniGameResult
 * @property {number} [salvage]  @property {number} [gold]  @property {number} [pearls]
 * @property {number} [score]
 * @property {object} [stats]    // deltas for progression.record()
 * @property {string[]} [achievements]
 * @property {'won'|'lost'|'bailed'} outcome
 */
```

- **Lightweight mode** (whirlpool, trench): `enter` grabs `host.world` — the
  shared diver + cave + physics — and just defines objective/hazards. Cheap.
- **Bring-your-own-engine** (future): ignores `host.world`, runs its own
  update/render; touches only shell services + `host.economy`. Same contract.

### 3.2 The Host (what the Core lends each minigame)

```js
/**
 * @typedef {Object} Host
 * @property {Economy} economy          // earn/spend the ONE wallet
 * @property {Progression} progression  // record lifetime stats
 * @property {Achievements} achievements // unlock (→ Steam, no-op on web)
 * @property {AudioService} audio
 * @property {ParticleService} particles
 * @property {Viewport} viewport         // W/H, live-resizable
 * @property {() => number} rng          // seedable
 * @property {DiverWorld} [world]        // present for diver-world minigames only
 */
```

The Host is a **facade** over Core services — minigames never reach Core
internals, and the Core can change internals without breaking minigames. This is
the boundary where types earn their keep first (see §5).

### 3.3 The meta-spine services (the moat)

Promoted from today's `meta/*` modules, exposed through the Host so *every*
minigame feeds one economy/progression:

```js
host.economy.earn({ salvage, gold, pearls })   // credit the shared wallet
host.economy.balance()                          // read
host.progression.record(statsDelta)             // → progressive badges
host.achievements.unlock(id)                     // → Steam
```

Result flow: `minigame.exit()` returns a `MiniGameResult`; the **Core** credits
wallet + progression + achievements uniformly — one code path, every minigame.

### 3.4 The shared DiverWorld engine

The diver + cave + physics + shared HUD bits that diver-world minigames build
on, factored out of `game.js` into `core/world/`. Bring-your-own-engine
minigames simply don't request it.

## 4. Migration strategy — Strangler-fig (chosen)

Rejected: big-bang rewrite (throws away working, tested code) and new-only
(leaves the 3,600-line file forever + spine can't reach the old game).

**Strangler-fig:** stand up Core + contract *beside* `game.js`; then peel each
piece into a MiniGame module one at a time. Every step ships, is independently
tested, and shrinks `game.js`. The game stays playable and sellable throughout.
Detailed phase order + test gates live in `migration-plan.md`.

## 5. Language & build posture

- **No build step today; keep it until a real trigger.** ES modules already do
  lazy `import()` natively, so "engines loading on demand" needs no bundler to
  start.
- **Type the boundary first.** Author the `MiniGame` / `Host` / `MiniGameResult`
  contracts as JSDoc + a `types.d.ts`, checked with `tsc --noEmit` (no emit, no
  transpile, browser runs untouched `.js`, tests unchanged). Types matter most
  at the seam where independent modules must agree.
- **Add esbuild + full TS only when the first bring-your-own-engine minigame**
  wants lazy-load/minify. At that point the build step is justified on its own
  merits and full TS is a small delta. Not before.
- The "no build step" ethos was a hobby virtue; for a commercial collection it is
  now a **deliberate decision retired on first real need**, not a law.

## 6. Non-goals / guardrails

- No behavioral change to the shipped game during extraction — each phase must be
  provably identical to the baseline (`baseline/v1.0-pre-platform`, `src/version.js`).
- No new runtime dependencies for the web build until §5's trigger.
- The test suite stays green at every phase; no phase merges red.

## 7. Known-good baseline

`src/version.js` (`VERSION='1.0.0'`, `BUILD='pre-platform'`) + git tag
`baseline/v1.0-pre-platform` mark the last verified-good monolith. Every phase is
diffed/verified against it. See `migration-plan.md` for the resumable, phased
task breakdown with test gates and /compact + /clear checkpoints.

## 8. Development process — context-checkpoint discipline (`/clear` + `/compact`)

This is a **standing practice for all work in this repo** (new minigames,
features, refactors) — not just the finished platform migration. It keeps each
unit of work in a tight, cheap context and makes sessions resumable from cold.

**One work-unit ≈ one context.** A "work-unit" is a phase of a plan, or a
self-contained feature/minigame slice that ships on its own branch. Drive it to a
clean seam, then reset context before the next one.

**At each clean seam, run a 🧹 CHECKPOINT before moving on:**

1. Full test suite green + browser-verify on a **fresh port** (ES-module cache
   gotcha — always a new port or hard-refresh).
2. Commit → `--no-ff` merge to `main` → push. Bump `src/version.js` `BUILD` if the
   work is phase-marked.
3. **Update the docs of record** (the driving plan/spec: tick boxes, add a
   one-line "Landed: <commit> — <note>") and **update memory** (`MEMORY.md` + the
   relevant note) with the new state.
4. Then reset context:
   - **`/clear` — BETWEEN work-units, at a clean seam** (work merged + docs +
     memory updated). *Preferred.* The plan + this architecture doc + git fully
     reconstruct context, so a cold start is cheap and keeps each unit tight.
   - **`/compact` — MID work-unit**, when context is large but you are *not* at a
     clean seam yet (e.g. halfway through a slice). Preserves the working thread
     without a full reset.

**Rule of thumb:** aim to `/clear` at each work-unit boundary; reach for
`/compact` only when a single unit outgrows its context before it reaches a seam.

**Make plans resumable from a cold `/clear`.** Any multi-step plan should carry a
short "Context Recovery — read first" preamble (what to read, how to find the
resume point, how to confirm green) so a fresh session can continue with only the
plan + this doc + git. `migration-plan.md` is the worked exemplar of this shape.
