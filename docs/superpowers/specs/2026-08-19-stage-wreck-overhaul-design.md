# Stage Wreck Overhaul — Design Spec

**Date:** 2026-08-19
**Status:** Approved for planning
**Supersedes/extends:** `2026-08-18-platformer-minigame-design.md` (v16 platformer stages)

## Problem

Two issues surfaced in playtesting the cave-entrance platformer stages:

1. **Ladders are untraversable (blocking bug).** In Ship Room 1 the ascent
   ladder's bottom rung stops one tile above the floor (a floor-standing diver
   sits entirely in the empty row below the lowest rung, so pressing *up* grabs
   nothing — confirmed by driving the real `Stage` physics), and its top rung is
   walled off by a solid deck tile directly above, so even a mounted climber
   can't step onto the deck. An audit of all 6 rooms shows this is systematic.
   It slipped through because the flood-fill reachability test only ever gated
   each theme's **final** room, and finals are *descended* (spawn at top), where a
   blocked ladder top doesn't matter. The **ascent** rooms were never verified.

2. **Visuals are too basic.** The stage renderer draws a flat gradient, flat
   colored tiles, and line-drawn ladders. The user wants each stage to read as a
   richly art-directed **sunken ship**, with atmospheric depth and backgrounds.

## Goals

- Every room is provably traversable (spawn → exit and cache reachable),
  enforced by a test that drives the real physics, for **all** rooms.
- Each stage looks like a specific, art-directed part of a shipwreck, with
  layered parallax depth and ambient motion — all hand-coded on canvas.
- No regression to the sealed `Stage` physics/logic contract or existing tests.

## Non-Goals

- No change to how stages are *entered* from the reef (`stageentrance.js`,
  the snapshot zone-stack, air-sealing, hit/respawn rules) beyond what room
  redesign requires.
- No new build step and no dependencies (project-wide constraint).
- No online/scoring work (tracked separately).

## Global Constraints

- **No build step, no dependencies.** Vanilla ES modules; everything procedural
  on the 2D canvas. Assets are code, not files.
- **`Stage` engine stays canvas-free and Node-testable.** All rendering lives in
  `src/render/stage.js` (and any new render modules it imports); `src/stage/*`
  imports no canvas/DOM.
- **Collision glyphs are frozen:** `#` solid, `H` ladder, `^` spike, `<` retreat
  door, `>` advance/exit door, `S` spawn, `o` loot, `$` cache, `x`/`E` movers.
  Physics reads only these. Decoration must never change collision.
- **Logical playfield is 900×600; rooms are `STAGE.cols`×`STAGE.rows` = 30×20 @
  `STAGE.tile` = 30px.** Body AABB is 20×28. Floor is row 19.
- All existing `tests/stage/*.test.mjs` and `tests/game/*.test.mjs` stay green.

## The Ladder Traversal Contract

Physics is correct; the level geometry must satisfy this contract, and a test
must enforce it:

- **Bottom:** an ascent ladder's lowest rung is at the **floor-adjacent row**
  (row 18) so a floor-standing body (which occupies only row 18) overlaps a rung
  and can mount by pressing up.
- **Top / dismount:** a ladder that must be **ascended** to a deck passes
  *through* that deck — the deck tile in the ladder's column becomes a rung
  (`H`, a gap in the deck) — and extends **one rung above the deck surface**, so
  the climber tops out with feet at the deck surface and the flanking deck tiles
  (solid) give a clean sideways step-off. No solid tile sits directly above an
  ascent ladder's top rung in its own column.
- **Descent ladders** (spawn above, drop onto/into them) need a reachable top
  (walk off the platform edge onto the rungs) and any landing at the bottom.
- Every room has a **critical path** from `S` to the exit `>` (and, in the final
  room, to the cache `$`) composed only of: walk on solid tops, mount/climb/
  dismount ladders per the above, and falls the body survives.

**Enforcement:** `tests/stage/traversal.test.mjs` drives the real `Stage` for
every room of every theme with a scripted input sequence (walk/climb/jump) that
follows the intended critical path, and asserts the run reaches the exit (and
cache in finals) without death. This replaces the finals-only flood-fill as the
authoritative traversability gate. The old flood-fill test may remain for the
finals but is no longer the sole guard.

## Room Set

**Ship — "THE WRECK": a 5-room descent through a galleon.** Enter through the
breached main deck; descend deck by deck to the captain's treasure. Descent-
biased so most ladders are forgiving drops; the one or two ascents obey the
contract. Room identities:

1. **Main Deck (breach)** — splintered top deck, ship's wheel, railings; drop in.
2. **Gun Deck** — a row of cannons, powder kegs (the sliding-barrel hazard).
3. **Crew Hold** — hammocks, swinging lantern, hanging chains; a patroller.
4. **Cargo Hold** — stacked crates, spikes (broken cargo), the barrel slider.
5. **Captain's Vault** — cabin with the treasure cache `$` and the exit `>`.

**Lair — "THE LAIR": a 3-room shipwreck-in-a-sea-cave.** A wreck that went down
inside a flooded cavern — rock walls, wreckage timbers, riveted metal, neon
seams/arcs. Redraw the existing 3 rooms to the contract with this identity.
(Its current finals-only reachability held, but Room 2's stub ladders are broken
and must be fixed to the contract too.)

Exact ASCII for every room is specified in the implementation plan; each is
verified by the traversal test.

## Rendering Architecture

Replace the flat `drawStageScene` with a **layered composite**, baking static
layers to an offscreen canvas once per room so only moving layers redraw:

- **`StageScene` (new, `src/render/stage.js` or a new `src/render/stagescene.js`):**
  holds an offscreen canvas of baked static art, rebuilt on room change
  (detected by `stage.roomIndex` / theme identity). `drawStageScene(ctx, stage, t)`
  keeps its signature; internally it lazy-bakes and composites.

Layer order (back → front):

1. **Deep backdrop (baked):** themed depth gradient + godrays/caustics
   (technique reused from the main-game `Background`).
2. **Far parallax (baked, slow horizontal drift):** distant hull ribs, broken
   masts, a listing galleon silhouette (reuse/adapt `props.js drawWreck`).
3. **Play plane / structure (baked):** the collision tiles rendered as
   art-directed wreck structure via **autotiling** (a tile's look derives from
   its solid/ladder neighbors): plank caps with barnacles & rivets on exposed
   deck tops, framed timber inside, brass-bolted beam edges; themed per palette.
4. **Actors & interactables (live):** movers (themed kegs/arcs), loot (coins/
   gems), cache (open chest spilling light), doors (framed hatchways with light),
   the diver (`drawDiverFoot`).
5. **Foreground overlays (live):** drifting silt + rising bubbles, shadowy
   **background fish shoals** (reuse creature sprites, e.g. Piranha, tinted/
   dark), swaying hanging kelp/chains, and a vignette.

**Ladders (`H`)** render themed: ship = knotted rope rigging / brass rungs;
lair = riveted steel with a faint neon glow. Ladders are static → baked into
layer 3, with any glow/shimmer as a cheap live overlay if needed.

**Performance:** baking makes per-frame cost ≈ one drawImage of the baked layer
+ the live actor/overlay draws (small, bounded particle counts). Bake only on
room change. Keep total particles/shoal fish to fixed pools.

## Data Model Changes

- **Palette extension** (`themes.js`): add material colors used by autotiling and
  decor — e.g. `plank`, `plankHi`, `brass`, `rivet`, `neon`, `glow`, `silt`.
  Existing keys (`bg1,bg2,solid,solidEdge,ladder,hazard,door,loot,cache,accent`)
  stay; renderer falls back to them where a new key is absent.
- **Per-room `decor` list** (optional, in each room's theme entry): non-colliding
  decorations placed by tile coordinate, e.g.
  `{ k:'porthole', c, r }`, `{ k:'wheel', c, r }`, `{ k:'chain', c, r }`,
  `{ k:'mast', c, r }`, `{ k:'kelp', c, r }`, `{ k:'lantern', c, r }`,
  `{ k:'cannon', c, r }`, `{ k:'crate', c, r }`. Decor is data; the parser and
  physics ignore it entirely (it lives beside `rooms`, not inside the ASCII), so
  the traversal test is unaffected. The renderer draws decor in the appropriate
  layer (most baked into layer 3; kelp/chain into the live foreground for sway).
- Because `themes.js` currently stores each theme's rooms as a bare array, the
  theme shape extends to allow an optional parallel `decor` array indexed by room
  (`theme.decor?.[roomIndex]`), keeping `rooms` a pure ASCII array for the parser.

## Themed Element Catalogue (art direction)

- **Decks/structure:** waterlogged oak planks, iron brackets, brass bolts,
  barnacle clusters, cracks; lair swaps oak for wet rock + riveted plate + neon.
- **Ladders:** rope rigging w/ knots (ship) or riveted rungs w/ neon (lair).
- **Hazards:** powder kegs / swinging barrels (ship), crackling energy arcs
  (lair) — themed by existing `hazardGlyph`.
- **Loot/cache:** glinting coins/gems (`o`), an open treasure chest spilling
  warm light (`$`).
- **Doors:** framed wooden hatch (retreat `<`) and a lit doorway/exit (`>`).
- **Decor props:** ship's wheel, portholes (some cracked, leaking light),
  hanging chains, swinging lantern, cannons, crates, kelp curtains, a compass
  rose on the cabin floor.

## Testing & Verification

- **Unit (authoritative):** `tests/stage/traversal.test.mjs` — real-physics
  critical-path run per room; assert exit + cache reachable, no death.
- **Regression:** all existing `tests/stage/*` and `tests/game/*` stay green;
  parser/physics untouched. A small test asserts `decor` never overlaps a
  collision glyph is **not** needed (decor is separate data) — instead assert the
  renderer tolerates missing palette keys and missing `decor`.
- **Visual:** render each room in-browser via Chrome MCP; screenshot and iterate
  on the look against real frames. (The temporary `window.game` hook is added for
  verification and removed before every commit, per the project workflow.)

## Build Approach

Architectural → spec (this doc) → implementation plan → **subagent-driven
development** on a feature branch:

- **Early tasks fix traversal first** (redraw rooms to the contract + the
  traversal test) so the stage is playable before art lands.
- **Then the rendering pipeline** (baking + layers), **then autotiled structure**,
  **then decor + foreground overlays + themed actors**, each independently
  testable/reviewable.
- Final whole-branch review on the most capable model; then present the merge
  decision (finishing-a-development-branch).

## Risks

- **Autotiling complexity** vs. time — mitigate by starting with a small
  neighbor-mask ruleset (top-exposed vs interior vs edge) and layering detail.
- **Per-frame cost** — mitigate by baking; cap particle/shoal pools.
- **Room redesign breaking feel** — the traversal test guarantees *reachability*,
  not *fun*; in-browser playtest each redesigned room.
