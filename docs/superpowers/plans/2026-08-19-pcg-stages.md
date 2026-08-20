# PCG Platformer Stages — Spec + Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Playable/testable push per phase.

**Goal:** Procedurally generate the platformer stage rooms (replacing the hand-authored Ship-5/Lair-3 rooms) using the Mario-AI model: **constructive chunk generator + a sound solver as the validator + generate-and-test**. Infinite, always-completable, art-directed stages. Roadmap item 4; research in memory `pcg-stages-design`.

**Architecture:** Reuse what exists — the tile-grid room format, the `Stage` physics, the ladder-traversal contract, and the real-physics traversal harness. The one genuinely new piece is a **sound reachability solver** that answers "can spawn reach the exit (and cache) without forced death?" — used to gate generated rooms. Generation stitches rooms from a library of validated segments; every candidate is solver-checked and regenerated if it fails.

**Tech:** Vanilla ES modules, Canvas. No build step, no deps. Node tests via `node tests/**/*.test.mjs`. Solver/generator are canvas-free (`src/stage/*`), Node-testable.

## Global Constraints
- No build step, no deps. Solver + generator live in `src/stage/*` (canvas-free, Node-testable).
- Rooms stay EXACTLY 30 cols × 20 rows; glyphs frozen (`#`/`H`/`^`/`<`/`>`/`S`/`o`/`$`/`x`/`E`). Physics/parser (`stage.js`/`config.js`) UNTOUCHED.
- The ladder-traversal contract holds (ladder top rung one row above its deck, passes through as a gap; floor-adjacent bottom; cache/exit on row 18).
- **The solver MUST be SOUND**: if it says "solvable," the room is truly beatable by the real physics. Over-conservative (rejecting some solvable rooms) is fine — we regenerate. A false "solvable" that ships an unbeatable room is NOT acceptable.
- All existing `tests/**` stay green; `traversal.test.mjs` (real-physics) remains the ground-truth gate.

## Design

### The solver (validator) — `src/stage/solver.js`
A **conservative tile-graph reachability** over the movement model (NOT full real-physics search — too slow for generate-and-test). Nodes = positions the body can occupy at rest / on a ladder; edges = moves the real physics DEFINITELY supports:
- **Stand**: a cell is "standable" if the tile below is solid `#` OR a ladder `H` (ladder tops are walkable — matches the shipped one-way-platform physics) and the cell itself is non-solid.
- **Walk**: standable → adjacent standable cell (col±1, same row), if not blocked by a solid.
- **Fall**: walk off an edge → descend to the first standable cell below; a fall that lands on a spike `^` or exits the bottom (pit) is DEATH → not an edge (excluded).
- **Climb**: on a ladder column, move up/down between ladder cells; mount from a floor-adjacent ladder cell; dismount at the top onto a flanking standable deck.
- **Jump**: standing → cells within the physics jump arc (height from `STAGE.jump`/gravity, horizontal from `STAGE.walk`), CONSERVATIVELY under-approximated (only clearly-reachable jump targets) so soundness holds.
BFS from `S`; the room is solvable iff `>` is reachable AND (if a `$` exists) `$` is reachable, with no forced traversal of a spike/pit. `export function solvable(rows) -> { reachExit, reachCache, ok }`.
**Validation (Phase 1 acceptance):** the solver classifies all 8 shipped hand-authored rooms as solvable, and a set of deliberately-broken rooms (walled-off exit, exit-behind-spikes-only, floating unreachable cache) as UNsolvable. Cross-check: any room the solver calls solvable, the real-physics traversal harness can also complete (spot-check with an auto-pathfinder derived from the solver's path).

### The chunk generator — `src/stage/chunkgen.js`
A library of **validated segments** (each a partial 30-wide slice with defined connection points): spawn-deck, ladder-descent, switchback, spike-gauntlet, cannon-deck, cache-vault, gap-jump. Assemble a room by stacking/placing segments top→bottom respecting the contract: `S` at the top, `>`/`$` on row 18/19, ladders connect decks per the contract, movers/spikes placed per difficulty. `export function generateRoom(opts) -> rows` (opts: theme, difficulty/reef, seed via injected rng).

### Generate-and-test — integration
`export function makeStageRooms(theme, reef, rng, count) -> rows[]`: for each room, `generateRoom` → `solvable` → keep if ok, else regenerate (bounded retries; fall back to a hand-authored seed room if retries exhaust — never ship an unsolvable room). Wire into `themes.js`/`Stage` so a stage's rooms are generated on entry (difficulty scaled by reef). Keep 1-2 hand-authored rooms as fallback seeds.

## Phases

### Phase 1 — The sound solver (`src/stage/solver.js`) + validation
- Implement `solvable(rows)` (conservative tile-graph reachability, per the model above).
- TEST `tests/stage/solver.test.mjs`: all 8 shipped rooms (import from themes.js) classified solvable (reachExit + reachCache where `$` present); a battery of hand-crafted BROKEN rooms classified unsolvable (walled exit; exit only past a spike wall; unreachable floating cache; spawn sealed). Soundness spot-check: for each shipped room the solver says ok, the existing traversal harness also completes it (they already pass, so consistency).
- **Deliverable:** a validated, Node-tested solver. No gameplay change yet.

### Phase 2 — The chunk generator (`src/stage/chunkgen.js`)
- Build the segment library + `generateRoom(opts)`; each segment authored to the contract.
- TEST: `generateRoom` output is always 30×20, one `S`, an `>` (and `$` in a final room), and — chained with Phase 1 — `solvable()` passes for a large sample across seeds/difficulties (loop N seeds, assert ok rate high; any failure logged).
- **Deliverable:** a generator that produces mostly-solvable rooms.

### Phase 3 — Generate-and-test + integration
- `makeStageRooms(...)` (generate→solve→retry→fallback). Wire into stage entry so rooms are generated per visit, difficulty by reef; keep a couple of hand-authored fallback seeds.
- Extend `traversal.test.mjs` (or a new gen test): generate many stages across reefs, assert EVERY shipped room is `solvable()` (the generate-and-test guarantee) and 20-rows/30-cols.
- In-browser: play generated stages across a few reefs; confirm completable + varied.
- **Deliverable:** live procedurally-generated, always-completable stages.

## Risks
- Solver soundness — mitigate by conservative edges + validating against the 8 known-good rooms and known-bad rooms, and keeping the real-physics traversal harness as the ground truth.
- Generation producing mostly-unsolvable rooms (wasted retries) — mitigate by authoring segments that compose validly by construction; measure the ok-rate in tests.
- Never ship an unsolvable room — the generate-and-test fallback to a hand-authored seed guarantees it.

## Compression
- Reuse the tile-grid format, `Stage` physics, the traversal harness (as the ground-truth cross-check), and the ladder-traversal contract. The solver is the one new core piece.
