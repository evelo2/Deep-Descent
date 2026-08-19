# Stage Wreck Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the untraversable platformer ladders and re-skin the stages as art-directed sunken-ship scenes with layered parallax depth.

**Architecture:** Level geometry is corrected to a ladder traversal contract and locked by a real-physics traversal test covering *every* room. Rendering is rebuilt as a layered composite where static art (backdrop, parallax silhouettes, autotiled structure) is baked to an offscreen canvas once per room and only ambient/actor layers redraw each frame. Decoration is separate data the physics never sees.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D. No build step, no dependencies. Node (no framework) for unit tests via `node tests/**/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-19-stage-wreck-overhaul-design.md`

## Global Constraints

- **No build step, no dependencies.** Everything procedural on the 2D canvas; assets are code.
- **`src/stage/*` stays canvas-free / Node-testable.** All rendering lives in `src/render/*`.
- **Collision glyphs are frozen:** `#` solid, `H` ladder, `^` spike, `<` retreat door, `>` advance/exit door, `S` spawn, `o` loot, `$` cache, `x` slide-mover, `E` patrol-mover. Physics reads only these.
- **Rooms are exactly 30 cols × 20 rows** (`STAGE.cols`×`STAGE.rows`), tile 30px. Floor is row 19. Body AABB 20×28. `parseRoom` hard-codes `rows: STAGE.rows`, so a room array that is not exactly 20 rows silently turns the real floor into a pit — every room MUST be 20 rows.
- **Ladder traversal contract:** every ladder's top rung is **one row above the deck surface it serves** and passes **through** that deck (the deck tile in the ladder column is a rung `H`, i.e. a gap), with solid deck tiles flanking it; an ascent/descent ladder's far end reaches the **floor-adjacent row (18)** or lands on a solid deck. No solid tile sits directly above a mountable ladder's top rung in its own column.
- **Cache `$` and exit `>` on a floor walk must be at row 18** (the row a floor-standing body occupies), not row 17.
- No changes to stage *entry* (`stageentrance.js`, zone-stack, air-seal, hit/respawn) beyond what room data requires.
- All existing `tests/stage/*.test.mjs` and `tests/game/*.test.mjs` stay green.
- Temporary `window.game`/`window.input` hooks used for in-browser verification are removed before every commit (grep guard).

---

## File Structure

- `src/stage/themes.js` — **modified.** SHIP grows to 5 rooms, LAIR redrawn to 3; palettes extended; optional per-room `decor` arrays added. Rooms replaced with the verified ASCII in Task 1.
- `tests/stage/traversal-harness.mjs` — **new.** Real-physics autopilot (drives `Stage` through waypoints). Imported by the traversal test; filename lacks `.test.` so the runner does not execute it directly.
- `tests/stage/traversal.test.mjs` — **new.** Drives every theme/room through its critical-path waypoints; asserts exit (and cache in finals) reached, no death. Authoritative traversability gate.
- `src/render/stagescene.js` — **new.** `StageScene` class: offscreen bake of static layers (backdrop, parallax, autotiled structure, ladders, static decor), rebuilt on room change; exposes `composite(ctx, stage, t)`.
- `src/render/stage.js` — **modified.** `drawStageScene` delegates static layers to `StageScene` and draws live layers (actors, movers, loot, cache, doors, foreground silt/bubbles/shoals/kelp, vignette). `drawStageHud` unchanged except palette-driven colors.
- `src/render/stageart.js` — **new.** Pure draw helpers for themed structure (autotiled plank/rock/brass/rivet/neon tiles), ladders (rope/rigging vs riveted), hazards (keg/arc), loot/cache (coins/chest), doors (hatch), and decor props (porthole, wheel, cannon, chain, kelp, lantern, mast). Each takes `(ctx, ...args, palette, t)`.
- `src/config.js` — **modified.** `STAGE` may gain small rendering knobs (particle counts, parallax factors) if needed; no gameplay constant changes.

---

## Task 1: Fix traversal — verified rooms + real-physics traversal test

This task alone fixes the reported blocking bug. It replaces the room data and adds the authoritative test. **Do this first; the stage is playable after it.**

**Files:**
- Modify: `src/stage/themes.js` (SHIP.rooms → 5 verified rooms; LAIR.rooms → 3 verified rooms)
- Create: `tests/stage/traversal-harness.mjs`
- Create: `tests/stage/traversal.test.mjs`

**Interfaces:**
- Consumes: `Stage` from `src/stage/stage.js`; `STAGE` from `src/config.js`; `THEMES`/`getTheme` from `src/stage/themes.js`.
- Produces: `makeStage(rows, opts)` and `runRoom(rows, waypoints, opts)` from the harness (used only by the test).

- [ ] **Step 1: Create the traversal harness** `tests/stage/traversal-harness.mjs`

```js
// Real-physics traversal autopilot. Drives the actual Stage engine through a
// single room following waypoints, proving the critical path is walkable+
// climbable. Verifies GEOMETRY: movers are stripped (dodging a moving hazard is
// gameplay, not geometry); static spikes (^) and pits stay lethal.
import { Stage } from '../../src/stage/stage.js';
import { STAGE } from '../../src/config.js';

const T = STAGE.tile;
const DT = 1 / 60;

export function makeStage(rows, { palette = { accent: 'gem' }, stripMovers = true } = {}) {
  if (rows.length !== STAGE.rows) throw new Error(`room must have exactly ${STAGE.rows} rows, got ${rows.length}`);
  const bad = rows.map((r, i) => (r.length !== STAGE.cols ? `row ${i} len ${r.length}` : null)).filter(Boolean);
  if (bad.length) throw new Error(`room rows must be ${STAGE.cols} chars: ${bad.join(', ')}`);
  const st = new Stage({ rooms: [rows], palette, hazardGlyph: 'barrel', name: 'T', key: 't' });
  st.doorGrace = 0;
  if (stripMovers) st.rooms.forEach((rm) => { rm.movers = []; });
  return st;
}

const centreCol = (b) => Math.floor((b.x + b.w / 2) / T);
const topRow = (b) => Math.floor(b.y / T);

// Waypoints: {to}, {walkClimb:{to,dir,climbY}}, {climbTo}, {jump:{moveX}}, {hold:{frames,moveX,climbY}}
export function runRoom(rows, waypoints, { budgetPerWp = 400, palette } = {}) {
  const st = makeStage(rows, { palette });
  const b = st.body;
  let died = false, reachedExit = false, reachedCache = false;
  const step = (cmd) => {
    const ev = st.update(DT, cmd);
    if (ev.died) died = true;
    if (ev.exited === 'complete') reachedExit = true;
    if (st.room.cache && st.room.cache.taken) reachedCache = true;
  };
  for (const wp of waypoints) {
    let f = 0, done = false;
    while (f++ < budgetPerWp && !done && !died) {
      let cmd = { moveX: 0, jump: false, climbY: 0 };
      if (wp.to != null) {
        const target = wp.to * T + T / 2;
        if (Math.abs((b.x + b.w / 2) - target) < 2) { done = true; }
        else cmd.moveX = (b.x + b.w / 2) < target ? 1 : -1;
      } else if (wp.walkClimb != null) {
        cmd.moveX = wp.walkClimb.dir; cmd.climbY = wp.walkClimb.climbY || 0;
        if (centreCol(b) === wp.walkClimb.to) done = true;
      } else if (wp.climbTo != null) {
        cmd.climbY = topRow(b) === wp.climbTo ? 0 : (wp.climbTo < topRow(b) ? -1 : 1);
        if (topRow(b) === wp.climbTo) done = true;
      } else if (wp.jump != null) { cmd = { moveX: wp.jump.moveX || 0, jump: true, climbY: 0 }; done = true; }
      else if (wp.hold != null) { cmd = { moveX: wp.hold.moveX || 0, climbY: wp.hold.climbY || 0, jump: false }; if (f >= (wp.hold.frames || 30)) done = true; }
      step(cmd);
    }
    if (died) break;
  }
  return { reachedExit, reachedCache, died };
}
```

- [ ] **Step 2: Replace `SHIP.rooms` in `themes.js`** with these 5 verified rooms (exact — do not re-flow):

```js
  rooms: [
    [ // 1/5 Main Deck — breach; climb down the rigging to the hull floor, walk to the hatch.
      '..............................','..............................','..o...........................',
      '.S..H.........................','####H.........................','....H.........................',
      '....H.........................','....H.........................','....H.......o.....o...........',
      '....H....#########............','....H.........................','....H.........................',
      '....H.........................','....H...............o.........','....H..........#########......',
      '....H.........................','....H.........................','....H.........................',
      '....H.....................>...','##############################',
    ],
    [ // 2/5 Gun Deck — switchback: down the fore ladder, across the deck, down the aft ladder.
      '..............................','...o.....o....................','.S..H.........................',
      '####H##.......................','....H.........................','....H....o....................',
      '....H.........................','....HE...H....................','.########H###.................',
      '.........H....................','.........H.......o............','.........H....................',
      '.........H....................','.........H....................','.........H....................',
      '.........H....................','.........H....................','.........H....................',
      '.........H...............>....','##############################',
    ],
    [ // 3/5 Crew Hold — descend to the berth deck; a patroller stalks the floor.
      '..............................','.....o........................','.S...H........................',
      '#####H##......................','.....H........................','.....H........................',
      '.....H......o.....o...........','.....H...#########............','.....H........................',
      '.....H........................','.....H........................','.....H........................',
      '.....H....................o...','.....H..............#######...','.....H........................',
      '.....H........................','.....H........................','.....H........................',
      '.....H........E..........>....','##############################',
    ],
    [ // 4/5 Cargo Hold — switchback past a sliding barrel; broken crates bristle with spikes.
      '..............................','...o.........o................','.S..H.........................',
      '####H##.......................','....H.........................','....H....o....................',
      '....H.........................','....H.x..H....................','.########H###.................',
      '.........H....................','.........H....................','..####...H....................',
      '..^^^....H....o...............','.........H....................','.........H....................',
      '.........H....................','.........H....................','.........H....................',
      '.........H...............>....','##############################',
    ],
    [ // 5/5 Captain's Vault — descend to the cabin; grab the cache ($), then the exit (>).
      '..............................','..o........o..................','.S..H.........................',
      '####H##.......................','....H.........................','....H....############.........',
      '....H.........................','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H.......$............>....','##############################',
    ],
  ],
```

- [ ] **Step 3: Replace `LAIR.rooms` in `themes.js`** with these 3 verified rooms (exact):

```js
  rooms: [
    [ // 1/3 Cave Mouth — a wreck spilled into a flooded cavern; climb down to the exit.
      '..............................','...o..........................','.S..H.........................',
      '####H##.......................','....H.........................','....H.........................',
      '....H.....o...................','....H..######.................','....H.........................',
      '....H.........................','....H.........................','....H..............o..........',
      '....H............#######......','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H...................>.....','##############################',
    ],
    [ // 2/3 Flooded Gallery — switchback between rock ledges and wreckage.
      '..............................','......o......o................','.S....H.......................',
      '######H##.....................','......H.......................','......H....o..................',
      '......H.......................','......Hx.....H................','.##########H####..............',
      '...........H..................','...........H......o...........','...........H..................',
      '...........H..................','...........H..................','...........H..................',
      '...........H..................','...........H..................','...........H..................',
      '...........H.............>....','##############################',
    ],
    [ // 3/3 Neon Vault — the drowned strongroom; take the cache ($) then the exit (>).
      '..............................','...o.......o..................','.S..H.........................',
      '####H##.......................','....H.........................','....H....############.........',
      '....H.........................','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H.........................','....H.........................','....H.........................',
      '....H......$............>.....','##############################',
    ],
  ],
```

- [ ] **Step 4: Write the traversal test** `tests/stage/traversal.test.mjs`

```js
// Authoritative traversability gate: drives the REAL Stage physics through every
// room of every theme along its intended critical path and asserts the exit
// (and cache in finals) is reachable without death. Run: node tests/stage/traversal.test.mjs
import { runRoom } from './traversal-harness.mjs';
import { THEMES } from '../../src/stage/themes.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const exitCol = (rows) => { for (const r of rows) { const i = r.indexOf('>'); if (i >= 0) return i; } return -1; };
const grab = (col) => ({ walkClimb: { to: col, dir: 1, climbY: 1 } });
const descend = (rows, lad, edge) => [{ to: edge }, grab(lad), { climbTo: 17 }, { to: exitCol(rows) }];
const switchback = (rows, l1, e1, mid, l2, e2) => [{ to: e1 }, grab(l1), { climbTo: mid }, { to: e2 }, grab(l2), { climbTo: 17 }, { to: exitCol(rows) }];

// Critical-path waypoints per theme/room (indices match themes.js order).
const PATHS = {
  ship: [
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
    (r) => switchback(r, 4, 3, 7, 9, 8),
    (r) => descend(r, 5, 4),
    (r) => switchback(r, 4, 3, 7, 9, 8),
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
  ],
  lair: [
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
    (r) => switchback(r, 6, 5, 7, 11, 10),
    (r) => [{ to: 3 }, grab(4), { climbTo: 17 }, { to: exitCol(r) }],
  ],
};

for (const theme of THEMES) {
  const paths = PATHS[theme.key];
  check(`${theme.key}: PATHS covers all rooms`, paths && paths.length === theme.rooms.length);
  theme.rooms.forEach((rows, i) => {
    const res = runRoom(rows, paths[i](rows), { palette: theme.palette });
    const needCache = rows.some((r) => r.includes('$'));
    check(`${theme.key} room ${i + 1}: reaches exit`, res.reachedExit);
    check(`${theme.key} room ${i + 1}: no death on the critical path`, !res.died);
    if (needCache) check(`${theme.key} room ${i + 1}: reaches cache`, res.reachedCache);
  });
}

console.log(`traversal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 5: Run the traversal test — expect PASS.**

Run: `node tests/stage/traversal.test.mjs`
Expected: `traversal: N passed, 0 failed` (N covers 8 rooms × 2–3 asserts + coverage checks).

- [ ] **Step 6: Update `tests/stage/parse.test.mjs` for the new room counts, then run the full stage + game suites.**

`parse.test.mjs` currently asserts **`${th.key} has 3 rooms` → `th.rooms.length === 3`** for *every* theme (line ~16). Ship now has 5. Replace that single assertion with a per-theme expected count, e.g.:

```js
const EXPECT_ROOMS = { ship: 5, lair: 3 };
assert(`${th.key} has ${EXPECT_ROOMS[th.key]} rooms`, th.rooms.length === EXPECT_ROOMS[th.key]);
```

Leave the rest of `parse.test.mjs` unchanged — its per-room 20-rows/30-cols/one-S checks and its lenient flood-fill (which treats only `#` as blocking and ignores gravity/ladders — the reason it passed the broken rooms) still apply and should pass on the new open rooms. The new `traversal.test.mjs` is the authoritative gate; the flood-fill stays as a cheap structural check.

Run: `node tests/stage/*.test.mjs && node tests/game/*.test.mjs`
Expected: no failures.

- [ ] **Step 7: In-browser smoke** — with the temporary `window.game` hook, enter a Ship stage and confirm you can climb the first ladder and reach the hatch. Remove the hook. Commit.

```bash
git add src/stage/themes.js tests/stage/traversal-harness.mjs tests/stage/traversal.test.mjs
git commit -m "fix(stage): traversable rooms + real-physics traversal test (Ship 5 / Lair 3)"
```

---

## Task 2: Layered renderer scaffold with per-room baking (visual parity first)

Introduce the layered architecture without changing the look yet — move existing static drawing into a baked offscreen layer, keep live layers live, verify pixel-parity-ish. This isolates the architecture change from the art change.

**Files:**
- Create: `src/render/stagescene.js`
- Modify: `src/render/stage.js`

**Interfaces:**
- Produces: `class StageScene { constructor(); composite(ctx, stage, t); }` — internally holds an offscreen `OffscreenCanvas` or a detached `<canvas>` (`document.createElement('canvas')`, 900×600), a `bakedKey` (string of `theme.key + ':' + roomIndex`), and `_bake(stage)` that redraws static layers when the key changes.
- Consumes: existing tile/loot/cache/door/diver drawing (moved out of `drawStageScene`).

- [ ] **Step 1:** Create `StageScene` with an offscreen canvas and `composite(ctx, stage, t)` that: if `bakedKey` changed, calls `_bake(stage)` (draws background gradient + static tiles + ladders into the offscreen), then `ctx.drawImage(offscreen,0,0)`, then draws live layers (loot, cache, movers, diver) exactly as `drawStageScene` does today.
- [ ] **Step 2:** Refactor `drawStageScene(ctx, stage, t)` to lazily instantiate a module-level `StageScene` and call `composite`. Keep `drawStageHud` untouched.
- [ ] **Step 3:** Guard for headless: only create the offscreen canvas when `document` exists; `stagescene.js` must not break Node imports of `stage.js` (it is only reached through `drawStageScene`, which the game calls — no Node test imports the renderer, so a top-level `document` reference is acceptable but prefer lazy creation inside `_bake`).
- [ ] **Step 4:** In-browser: enter a stage, confirm it looks the same as before and room transitions rebake (no stale room art). Confirm no per-frame allocation of the offscreen (bake only on key change) via a `console.count` in `_bake` seen once per room. Remove debug, remove `window.game`, commit.

---

## Task 3: Autotiled wreck structure (the baked play-plane art)

Replace flat `#`/`H` drawing with themed, neighbor-aware structure. This is the headline "art-directed" change for the solid geometry.

**Files:**
- Create: `src/render/stageart.js`
- Modify: `src/render/stagescene.js` (bake calls these), `src/stage/themes.js` (palette keys)

**Interfaces:**
- Produces (in `stageart.js`): `neighborMask(room, c, r)` → bitfield of solid up/down/left/right; `drawStructureTile(ctx, x, y, mask, palette, theme)`; `drawLadderTile(ctx, x, y, capTop, palette, theme)` where `capTop` is true when the tile above is not a ladder (draw the top rounded rung/knot).
- Consumes: `room.grid`, `theme.palette`, `theme.key`.

- [ ] **Step 1:** Add palette keys to both themes: `plank, plankHi, brass, rivet, neon, glow, silt` (Ship warm oak/brass; Lair wet rock/steel/neon). Renderer falls back to `solid`/`solidEdge`/`ladder` where a key is absent.
- [ ] **Step 2:** Implement `neighborMask` + `drawStructureTile`: top-exposed tiles (no solid above) get a lighter plank/rock **cap** with barnacle/rivet speckles; interior tiles get darker framed timber/rock; left/right-exposed edges get a beam/brass-bolt seam. Ship = planks + brass bolts; Lair = rock + riveted steel plates + a thin `neon` seam on exposed edges.
- [ ] **Step 3:** Implement `drawLadderTile`: Ship = two knotted ropes with rungs (rigging); Lair = riveted rails with a faint `neon`/`glow` inner line. Draw a rounded cap/knot when `capTop`.
- [ ] **Step 4:** Wire both into `StageScene._bake` (structure and ladders are static → baked). Remove the old flat tile branch.
- [ ] **Step 5:** In-browser screenshot each of the 8 rooms; confirm decks read as planks/rock and ladders as rigging/rails. Iterate on palette/detail. Remove hooks, commit.

*Acceptance for art steps is visual (screenshot each room) plus: `node tests/stage/*.test.mjs` still green — rendering changes must not touch physics/parser.*

---

## Task 4: Deep backdrop + parallax silhouettes (baked)

**Files:** Create/extend `src/render/stageart.js` (backdrop + silhouette helpers); modify `src/render/stagescene.js`.

**Interfaces:** `drawBackdrop(ctx, palette, t0)` (depth gradient + faint godrays/caustics, technique adapted from `src/render/background.js`); `drawFarWreck(ctx, palette, roomIndex)` (distant hull ribs, broken masts, a listing galleon silhouette adapted from `src/render/props.js drawWreck`), drawn dim and low-contrast behind the structure.

- [ ] **Step 1:** Implement `drawBackdrop` — themed vertical gradient (`bg1`→`bg2`) + 2–3 soft godray wedges + subtle caustic band. Bake as the backmost layer.
- [ ] **Step 2:** Implement `drawFarWreck` — parallax silhouettes (masts/ribs/hull) positioned by `roomIndex` so rooms differ; low alpha, cool tint. Bake above the backdrop, below the structure.
- [ ] **Step 3:** Bake order in `_bake`: backdrop → far wreck → structure → ladders → static decor (Task 7). In-browser screenshot; confirm depth reads without muddying the play plane. Commit.

---

## Task 5: Foreground ambient layer (live) — silt, bubbles, shoals, kelp, vignette

**Files:** Modify `src/render/stage.js` (live layer), extend `src/render/stageart.js`; may reuse a creature sprite for shoals.

**Interfaces:** A small `StageAmbient` holder (fixed-size pools; seed positions deterministically by index — no `Math.random` per frame in a way that breaks determinism is fine here since this is render-only, but keep pools fixed size) with `update(dt)` and `draw(ctx, palette, t)`; drawn AFTER actors. Background fish shoal = a fixed pool of small dark fish drifting on a parallax plane (reuse `drawPiranha` or a simple silhouette, tinted dark/low-alpha).

- [ ] **Step 1:** Silt motes + rising bubbles: fixed pools (e.g. 40 motes, 16 bubbles), wrap around the 900×600 field, parallax drift. Draw with low alpha.
- [ ] **Step 2:** Background fish shoal: a fixed pool (~10–14) of dark fish silhouettes drifting behind the play plane (below actors, above structure? — draw as a distinct mid layer between baked static and actors so they read as "behind" the diver). Tinted by `palette.bg2`.
- [ ] **Step 3:** Hanging kelp/chains sway (foreground, above actors, near edges) + a soft vignette. Keep counts small.
- [ ] **Step 4:** Verify frame cost is dominated by the single baked `drawImage` + bounded live draws (no unbounded loops). In-browser screenshot + watch for jank. Commit.

---

## Task 6: Themed actors — hazards, loot, cache, doors

**Files:** Modify `src/render/stage.js`; extend `src/render/stageart.js`.

**Interfaces:** `drawHazard(ctx, m, theme, palette, t)` (keg with iron bands / crackling arc); `drawCoin(ctx, x, y, palette, t)` and `drawGem`; `drawChest(ctx, x, y, palette, t)` (open chest spilling warm light for `$`); `drawHatch(ctx, x, y, kind, palette, t)` (framed wooden hatch for `<`, lit doorway for `>`).

- [ ] **Step 1:** Replace mover circles with themed hazards keyed by `theme.hazardGlyph` (`barrel`→keg, `arc`→energy arc). Keep the same AABB/position from `room.movers`.
- [ ] **Step 2:** Replace loot dots with glinting coins/gems (accent-driven) and the cache with an open treasure chest spilling a `glow` gradient.
- [ ] **Step 3:** Replace door rectangles with framed hatchways (retreat `<`) and a lit exit doorway (`>`), keeping the existing pulse timing.
- [ ] **Step 4:** In-browser screenshot; confirm actors read against the new structure. Commit.

---

## Task 7: Per-room decor data + rendering

**Files:** Modify `src/stage/themes.js` (add `decor` arrays), `src/render/stagescene.js` (bake static decor), `src/render/stage.js` (live decor: kelp/chain sway), `src/render/stageart.js` (decor prop draws).

**Interfaces:** Theme gains optional `decor: Array<Array<{k,c,r,...}>>` indexed by room. Decor kinds: `porthole, wheel, cannon, crate, chain, kelp, lantern, mast, compass`. Parser/physics never read `decor` (it lives beside `rooms`). `drawDecor(ctx, item, palette, t)` dispatches by `k`. Static decor (porthole, wheel, cannon, crate, mast, compass) is baked; animated decor (chain, kelp, lantern glow) is live foreground.

- [ ] **Step 1:** Add `drawDecor` prop helpers in `stageart.js` (one per kind), each drawn relative to its tile cell.
- [ ] **Step 2:** Author a `decor` list per room giving each its identity: e.g. Ship room 1 = ship's wheel + railings + mast stub; room 2 = a row of cannons + portholes; room 3 = hammocks (chains) + swinging lantern; room 4 = stacked crates; room 5 = compass on the cabin floor + portholes. Lair rooms = wreck timbers + neon conduits + kelp. Verify none is placed where it would visually collide with a rung/exit (decor doesn't affect physics, only looks).
- [ ] **Step 3:** Bake static decor in `_bake` (after structure); draw animated decor in the live foreground. In-browser screenshot each room; confirm each reads as its intended wreck-part. Commit.

---

## Task 8: Palette/theme polish, HUD tint, final integration pass

**Files:** Modify `src/render/stage.js` (`drawStageHud` colors from palette), `src/stage/themes.js` (final palette tuning), any small `src/config.js` knobs.

- [ ] **Step 1:** Ensure `drawStageHud` pulls accent/door/cache colors from `stage.theme.palette` so Ship and Lair HUDs feel distinct.
- [ ] **Step 2:** Final in-browser pass through all 8 rooms (both themes) — screenshot set for the record; tune palettes/parallax for cohesion and legibility (the diver and hazards must stay readable against the art).
- [ ] **Step 3:** Update `docs/DESIGN.md` (new version entry: stage wreck overhaul — traversal contract + layered renderer) and `docs/ROADMAP.md` (mark the platformer polish / backgrounds item). Confirm full suite green: `node tests/**/*.test.mjs`. Remove any `window.game` hooks (grep guard). Commit.

---

## Self-Review Notes (author)

- **Spec coverage:** traversal contract + all-rooms test (Task 1); layered/baked renderer (Task 2); autotiled structure (Task 3); backdrop/parallax (Task 4); foreground silt/bubbles/shoals/kelp (Task 5); themed actors/loot/cache/doors (Task 6); decor data model + per-room identity (Task 7); palette/HUD/docs (Task 8). All spec sections map to a task.
- **Verified content:** all 8 room ASCII blocks in Task 1 were proven traversable by driving the real `Stage` physics through the exact waypoints encoded in the Task 4 test (`traversal.test.mjs`); the same waypoint helpers are reused verbatim, so the embedded test matches the embedded rooms.
- **Type consistency:** `StageScene.composite(ctx, stage, t)` is the single entry the modified `drawStageScene` calls; `stageart.js` helpers all take `(ctx, ...args, palette[, theme][, t])`; `neighborMask`/`drawStructureTile`/`drawLadderTile`/`drawBackdrop`/`drawFarWreck`/`drawHazard`/`drawChest`/`drawHatch`/`drawDecor` names are used identically in producer and consumer tasks.
- **Art acceptance is visual** (screenshot per room) because procedural canvas detail cannot be pre-specified as exact code without doing the implementation; every art task additionally requires the physics/parser tests to stay green, guaranteeing rendering changes never touch gameplay.
```
