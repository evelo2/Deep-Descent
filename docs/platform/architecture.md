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

## 9. The manifest layer (P11.1)

The MiniGame contract in §3.1 types the *runtime* half of the seam — `enter`,
`update`, `render`, `exit`. P11.1 adds the **declarative half**: each minigame's
`manifest.js`, a plain object of pure data (identity, capabilities, entry
points, control legend, help pages, declared goals) plus one function — a
`module` thunk that lazily imports the runtime. The shape is typed as
`MiniGameManifest` / `MiniGameEntry` in `src/core/contract.js`; the rules a
manifest must satisfy are enforced by `validateManifest`/`assertManifest` in
`src/core/manifest.js` (contract version, slug id, semver, known capabilities,
non-empty unique entries, the `module` thunk, purity — no function anywhere
else in the object — and the namespacing rule below). `Core.register(minigame,
manifest)` calls `assertManifest` at registration, so a broken manifest fails
loudly at boot rather than at some later frame. Registering *without* a
manifest is still supported and yields the full, unrestricted Host — the
manifest layer is additive, not a hard requirement of the contract.

**The catalogue.** `src/minigames/catalogue.js` statically imports every
minigame's manifest into `CATALOGUE` — nothing else. Because a manifest is
pure data, the shell gets a boot-time view of every minigame (for menus, help
screens, the Trophy Wall, unlock gating) **without loading a single engine**;
each manifest's `module` thunk keeps the actual code behind a lazy `import()`
that nothing calls yet (see below). `manifestById(id)` looks one up;
`validateCatalogue(list)` runs `validateManifest` over the whole list plus the
cross-manifest checks no single manifest can make: unique minigame ids, and no
goal id claimed twice. That last check keeps three separate maps — one each
for badge ids, stat keys, and track ids — rather than one collapsed id space,
because badges/stats/tracks are separate id spaces in `meta/`: the `legacy`
manifest legitimately declares both a stat key `dives` and a track id `dives`
for the same thing, and collapsing them into one space would flag that as a
false-positive collision.

Two real manifests exist today: `src/minigames/legacy/manifest.js` (id
`legacy`, the reef dive and every zone inside it — including `reef`, which is
an *internal* zone of `legacy`, not a minigame in its own right) and
`src/minigames/match3/manifest.js` (id `match3`, Treasure Chest Madness). The
`legacy` → `home` + `reef` split, which would give the reef its own manifest,
is out of scope until P11.5.

**Grandfathered ids.** Contract v1's namespacing rule requires every declared
goal id to read `<minigameId>:<key>`, so two minigames can never collide on a
badge/stat/track id by accident. Ids that shipped *before* P11.1 are exempt:
`src/core/grandfathered-ids.js` exports `GRANDFATHERED`, a frozen allow-list of
the exact 50 ids that predate the manifest layer — 18 badges, 16 stat keys, 16
tracks, pinned against the live tables in `meta/badges.js`,
`meta/progressive.js` and `meta/stats.js` by
`tests/core/grandfathered-ids.test.mjs`. The exemption is by *frozen id list*,
not by which manifest declares them — `legacy` and `match3` **both** ship bare
ids today (`hoardcleared`, `comboartist`, `m3Pearls`, …), so an early design
that only exempted the `legacy` manifest would have been wrong. The reason
these particular ids can never be renamed or namespaced is that they are live
data: they're the literal keys under `deepdescent.badges.v1` and
`deepdescent.stats.v1` in every player's `localStorage`, and the badge/track-tier
ids are also registered Steam achievement ids on the partner site. Renaming or
namespacing any of them would orphan real player progress. Nothing may be
added to `GRANDFATHERED` — every goal declared from P11.1 onward, including
new match-3 goals, must be namespaced.

**Capability enforcement.** A manifest's `capabilities` array declares which
gated Host services (`economy`, `progression`, `achievements`, `world` —
`GATED_CAPABILITIES` in `manifest.js`) a minigame actually uses; everything
else on the Host (`audio`, `input`, `particles`, `viewport`, `rng`,
`open`/`close`) is ungated shell infrastructure, always present. Enforcement
lives in `restrictHost(host, capabilities)` (`src/core/host.js`). It is
written as an **inverted** loop: it copies every own key of the full Host
*except* gated capabilities the manifest didn't declare, rather than building
the restricted host from a hardcoded allow-list. This is deliberate — an
allow-list is a second source of truth that has to be kept in sync with
`makeHost` by hand, and a service added to `makeHost` later but forgotten in
the allow-list would be silently *dropped* for every manifested minigame
instead of silently *granted*. Inverting it means new ungated services are
included automatically, and only the four named capabilities are ever gated.
`Core.register` precomputes each minigame's restricted host and
`Core._hostFor(id)` serves it on `boot`/`open`; `Core.manifestFor(id)` and
`Core.versions()` (which now prefers manifest identity — `name`/`version`, and
surfaces `icon`/`blurb` — falling back to the runtime module's fields) round
out the manifest-aware surface.

Enforcement can't stop at `Core._hostFor`, though. `src/main.js` builds each
minigame's restricted host at **construction** time — `restrictHost(host,
legacyManifest.capabilities)` and `restrictHost(host,
match3Manifest.capabilities)`, passed into `createLegacyMiniGame`/`makeMatch3`
before `core.register` ever runs — and hands the *restricted* host into each
minigame's constructor. This matters because both minigames close over the
host they were built with rather than trusting the one `enter()` hands them
later: the legacy game hands its constructor host straight to `new Game(...)`,
and match3 closes over the host in `makeMatch3`'s params, so its
`enter(_host, ctx)` ignores the host argument outright. Restricting only the
argument to `enter` would therefore be cosmetic — the minigame would still be
holding the unrestricted host it was constructed with. Restricting at
construction is what makes the capability gate real.

**Not yet wired: the `module` thunk.** Every manifest declares `module: () =>
import('./index.js')`, and P11.1 unit-tests that the thunk *resolves* to the
right runtime module — but nothing calls it as the launch path yet.
Registration is still eager: `main.js` constructs both `legacy` and `match3`
directly (`createLegacyMiniGame`, `makeMatch3`) and hands the built instances
to `core.register`, exactly as before this phase. Lazy-loading a minigame's
engine from its manifest's `module` thunk — so an engine's code doesn't even
download until a player opens it — is P11.3. Declaring the goal shape here
(`goals.stats`/`goals.badges`/`goals.tracks`) is similarly forward-looking:
P11.1 only describes goals for menus/Trophy Wall rendering later; the live
`meta/*` tables remain the runtime source of truth for scoring until P11.4
wires `progression.registerGoals` and namespaced stat plumbing through.

## 10. The score (`src/music/`)

`src/music/` owns the dive's music and nothing else owns any of it.

- **`palettes.js`** is pure data plus pure maths — the five palettes
  (`beauty`, `dread`, `horror`, `sacral`, `organic`), `paletteFor(zone, musicId)`,
  `noteFreq` and `chordFreqs`. It imports nothing and touches no Web Audio, so
  it is fully testable under plain Node. **`paletteFor` is the only place the
  zone/theme → palette mapping lives**; a zone with its own score (abyss,
  temple, belly) wins, otherwise the reef theme's `music` field decides, and
  anything unrecognised falls back rather than throwing.
- **`index.js`** holds `class Music`: one fixed graph (voices → dry + a send
  into a convolver whose impulse response is *generated*, both summing into a
  `bus`), the pad/sub/motif voices, and a lookahead scheduler that places events
  against `ctx.currentTime`. It never chains `setTimeout`, and it never fetches
  an asset — `assets/` stays empty.

`Audio` (`src/audio.js`) owns the single `Music` instance, built in `ensure()`
once the master gain exists, and exposes `startMusic`/`stopMusic`/`setPalette`/
`toggleMusicMuted` plus a `setDepth` that forwards to both the ambient bed and
the score. Because the score sums into its own `bus`, muting music leaves SFX
untouched — that is the whole reason the bus exists.

The reef calls `_applyMusic()` and only `_applyMusic()`: on dive start, at the
end of `_newReefName()`, and immediately after every `this.zone = '…'`
assignment. Adding a zone means adding one call there; adding a reef theme means
giving it a `music` field, which `tests/audio/palettes.test.mjs` enforces by
iterating the real `REEF_THEMES`.
