# DiverWorld Engine — Slice 1 (design)

**Date:** 2026-08-22
**Status:** approved (sections 1–3 signed off in brainstorming)
**Phase:** platform migration, new **Phase 3** (reordered ahead of whirlpool extraction)
**Spec for:** the implementation plan that follows (migration-plan.md Phase 3 steps)

## Why this exists (the reorder)

The migration plan's original Phase 3 ("extract Whirlpool") says the whirlpool
should be extracted *"using `host.world` (diver-world)"* — but `host.world`, the
DiverWorld engine, was not scheduled until **Phase 6**, whose own aim is to
*"factor the diver + cave + physics + shared-HUD primitives … Removes duplication
left after extraction."* The plan was therefore internally inconsistent on
ordering: Phase 3 wanted to *use* an engine that Phase 6 *builds*.

**Decision (approved):** reorder — stand up the DiverWorld engine *first*, but as
its own **incrementally-phased workstream** rather than one giant late refactor.
The engine is born from the whirlpool's needs (this slice), then each later
extraction (other zones, then the reef) grows it; the old Phase 6 dissolves into
"the engine is now consolidated." This slice is **slice 1**.

Renumbered phases: **P3** = DiverWorld engine slice 1 (this doc) · **P4** =
extract Whirlpool against `host.world` (old P3) · **P5+** = remaining zone/reef
extractions, each growing the engine · old P6 dissolves · types/new-minigame
shift down.

## Goal of slice 1

Make `host.world` a **real, engine-owned** surface for the smallest genuinely
shared part of the diver world — the kinematic + vital core — with **zero
behavior change** and **all 57 test files green**.

## What the engine owns (slice 1 surface)

`src/core/world/index.js` → `makeDiverWorld({ viewport })` returns:

| Member | Kind | Meaning |
|---|---|---|
| `diver` | state (object) | the diver entity |
| `camX`, `camY` | state (number) | camera position |
| `air`, `airMax` | state (number) | oxygen / tank size |
| `placeDiver(x, y, vx)` | op | set diver pos/vel, center camera clamped to viewport (exact body of today's `Game._placeDiver`) |

`viewport` is the live logical viewport (`WORLD`, exposing `W`/`H` and the world
extents `WW`/`WH` used by the camera clamp). The engine reads it live (never
caches W/H — see the responsive-viewport constraint).

### Deliberately NOT in slice 1 (and why)

`score`, `carried`/`carriedPearls`, `_bankLoot`, `_snapshotReef`/`_restoreReef`,
toasts (`puName/puCol/puT`), `shake`/`flash`. These are **run / reef / router
concerns, not diver-world-engine concerns**:

- The whirlpool banks into the **reef run**; when it becomes a real MiniGame
  (P4) it returns salvage/score via `MiniGameResult` → `Core.creditResult`
  (already built in P2), instead of poking `Game.score`.
- Saving/restoring the reef while a sub-game runs is the **Core router's** job
  (P4), not the engine's.

This split makes P4 cleaner, not more deferred.

## The seam: instance-accessor delegation

`camX`/`air`/etc. are **primitives** used across hundreds of `game.js` lines, so
Phase 2's "share one object by reference" trick (which worked because meta bags
are objects) cannot share them directly. Mechanism:

1. `Game` constructor gains an optional `world` arg (mirrors P2's optional
   `services` arg — additive, last position).
2. **When `world` is present**, the *first thing* the constructor does (before any
   `this.camX = …` / `this.diver = …` / `this.air = …` assignment, which begin at
   `game.js:143`) is define **instance** accessor properties for
   `diver`/`camX`/`camY`/`air`/`airMax` via `Object.defineProperty(this, name,
   { get, set, configurable, enumerable })` that read/write `this._world[name]`.
   Every existing `this.air -= x`, `this.camX += …`, `this.diver.x` line then
   stays **byte-identical** yet routes to engine-owned state. The subsequent
   constructor assignments (`this.diver = new Diver()`, etc.) populate the engine
   through the setters.
3. **When `world` is absent** (the fallback path — no test constructs `new Game`,
   but this keeps the old contract): no accessors are defined; `Game` uses plain
   own fields exactly as today.
4. `_placeDiver(x, y, vx)` delegates to `this._world.placeDiver(x, y, vx)` when
   `world` is present, else runs its current body. Identical logic → no behavior
   change.

### Why the 57 stub tests survive

Every game test drives `Game.prototype.<method>.call(stub)` on a **plain object
literal**, never `new Game(...)`. Instance accessors are defined **on the
instance in the constructor**, so they are never installed on those stubs — the
stubs keep using their own plain fields (`tests/game/sub-armor.test.mjs` literally
sets `air: 80, airMax: 100` and supplies its own `_placeDiver(){}`). This is why
the accessors are instance-level, not prototype-level: a prototype accessor would
fire for every stub and dereference a missing `_world`.

## Wiring

`src/main.js`: `const world = makeDiverWorld({ viewport: WORLD });` → pass into
`makeHost({ …, world })` (the P1 host already forwards an optional `world`) and
into `createLegacyMiniGame({ …, world })`, which forwards it as the new `Game`
constructor arg. `host.world` is now the same engine the game's diver rides.

`src/minigames/legacy/index.js`: accept optional `world`, pass it to
`new Game(ctx, input, audio, particles, background, services, world)`.

## Testing & verification

- **Unit (TDD):** `tests/core/world.test.mjs` drives `makeDiverWorld()` directly:
  exposes `diver`/`camX`/`camY`/`air`/`airMax`; `placeDiver(x, y, vx)` sets diver
  `x/y/vx` (and `vy=0`, `invuln` per the current body) and clamps the camera to
  `[0, WW-W] × [0, WH-H]`. Pure — no `Game`, no DOM.
- **Seam proof (browser):** confirm `game.diver === host.world.diver` and that
  `host.world.air` tracks in-game air during a dive (mirrors how P2 browser-proved
  `game.meta === economy.state`). Plus a full whirlpool dive plays identically
  (3 lives, banking, bail-out) and the reef/other zones are unchanged.
- **Gate:** full 57-file suite green; fresh-port browser check; console banner
  reads `platform-p3`; `--no-ff` merge to `main`.

## Interfaces produced (later slices/phases rely on these)

- `makeDiverWorld({ viewport }) → world` with `{ diver, camX, camY, air, airMax,
  placeDiver(x,y,vx) }`.
- `host.world` present and engine-owned.
- `new Game(ctx, input, audio, particles, background, services?, world?)` — the
  `world` seam arg.

## Risks & mitigations

- **Accessor defined after a plain assignment would be lost** → define all
  accessors at the very top of the constructor, before `game.js:143`. (Test gate:
  browser seam proof + suite.)
- **Snapshot/restore key lists** (`game.js:2018/2025`) don't include
  `diver/camX/camY/air` → accessors don't perturb reef snapshotting.
- **Hot-path accessor cost** (air/camX in the update loop) → negligible for a
  canvas game; not optimized.

## Out of scope

Router/handoff, MiniGameResult flow for whirlpool, and any cave/physics/HUD
factoring — those are P4 and later engine slices.
