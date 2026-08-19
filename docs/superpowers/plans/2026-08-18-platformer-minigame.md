# Cave-entrance Platformer Minigame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Some reef entrances open into a short, themed platformer stage (ship
wreck → ship decks; cave mouth → secret lair) that the diver traverses on foot —
walking, jumping, climbing ladders past avoid-only hazards to a big loot cache —
then returns to the reef.

**Architecture:** A new `zone === 'stage'` inside `state === 'playing'`, wired
through the existing snapshot zone-stack (like `belly`/`temple`). A self-contained,
**input-agnostic** `Stage` class owns all platform state and physics; the `Game`
orchestrator translates `Input` into a small command object, delegates
update/draw while in-stage, and reuses lives/gold/game-over. Stage *content* is
data: ASCII tile-maps + a palette per theme, so adding themes is authoring, not
engineering.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D, Web Audio. No build step, no
runtime dependencies. Node 26 (dev-only) runs the ES modules directly for
unit-testing pure logic; in-browser Chrome-MCP verification covers rendering and
the integrated flow.

**Spec:** `docs/superpowers/specs/2026-08-18-platformer-minigame-design.md`

## Global Constraints

- **No runtime dependencies, no build step.** The game is a static site served as
  plain ES modules. The only new non-source file is a root `package.json`
  containing *exactly* `{ "type": "module" }` — a marker so Node can import the
  `.js` ES modules for tests. It adds zero dependencies and is ignored by the
  static site / GitHub Pages.
- **Logical playfield is fixed 900×600** (`WORLD.W`×`WORLD.H`). In-stage the camera
  is pinned: `camX = camY = 0`; each room is one non-scrolling screen.
- **Tile grid is 30 cols × 20 rows at 30px** (`STAGE.tile = 30`), exactly filling
  900×600. Every room ASCII map MUST be exactly 20 rows of exactly 30 chars.
- **`Stage` is logic-only and canvas-free.** It may import ONLY `../config.js` and
  `./themes.js`. It must NOT import anything that touches the DOM/canvas
  (`render/*`, `sprites.js`), so Node can import it for tests. Rendering lives in
  `src/render/stage.js`.
- **`Stage.update(dt, cmd)` is input-agnostic.** `cmd = { moveX: -1|0|1, jump:
  boolean, climbY: -1|0|1 }`. The `Game` builds `cmd` from `Input`. Tests feed
  `cmd` directly.
- **Debug handle discipline:** in-browser checks temporarily add `window.game =
  game;` in `src/main.js`; it MUST be removed before every commit (grep guard:
  `grep -n "window.game" src/main.js` returns nothing).
- **Commit trailers** per `CLAUDE.md` on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011sjssa1er5E51aTyVxXHao
  ```
- **Existing patterns to mirror** (do not reinvent): special zones spawn at most
  one-per-reef in `_generateWorld` (`src/game.js:239-261`); enter/exit use
  `_snapshotReef(returnX, returnY)` / `_restoreReef()` (`src/game.js:1067-1083`);
  one-shot removal mirrors `_exitWhale` filtering `_enteredWhale` out of `whales`
  (`src/game.js:1099-1103`); `_placeDiver(x,y,vx)` (`src/game.js:1121`); the
  fire-grace guard `this._fireGrace = 0.3` used by `_closeShop` (`src/game.js:361`).

---

## File Structure

**New files**
- `package.json` — `{ "type": "module" }` marker (enables Node ESM for tests).
- `src/config.js` (modify) — add `STAGE` tuning block + export.
- `src/stage/themes.js` — theme data: palette + hazard glyph mapping + entrance
  kind + ASCII room maps. Pure data. Ship and lair themes.
- `src/stage/stage.js` — `Stage` class + `parseRoom()`. Pure logic: parse, physics,
  ladders, movers/hazards, loot, doors, room transitions, death/respawn. Canvas-free.
- `src/entities/stageentrance.js` — `StageEntrance` reef-side entity: position,
  theme ref, `contains(diver)` proximity, and its `draw()` (shipwreck / cave-mouth).
- `src/render/stage.js` — `drawStageScene(ctx, stage, t)` + `drawStageHud(...)`:
  tiles, ladders, hazards, doors, loot, cache, the on-foot diver, and the banner.
- `tests/stage/parse.test.mjs` — parser unit tests (Node).
- `tests/stage/physics.test.mjs` — gravity/walk/jump/collision unit tests (Node).
- `tests/stage/ladders.test.mjs` — ladder/climb unit tests (Node).
- `tests/stage/hazards.test.mjs` — movers/hazards/death/respawn unit tests (Node).
- `tests/stage/flow.test.mjs` — loot/doors/room-transition/cache/exit unit tests (Node).

**Modified files**
- `src/game.js` — imports; `stageEntrances`/`stage`/`_enteredEntrance` fields;
  spawn a stage entrance in the special-zone picker; snapshot/restore key lists;
  `zone === 'stage'` update branch (`_updateStage`) and draw branch
  (`_drawStage`); `_enterStage`/`_exitStage`; reef-side entrance draw + HUD hint;
  a touch `jump` button in `_syncTouchButtons`/`_touchBtn`.
- `src/render/sprites.js` — `drawDiverFoot(ctx, pose, animT)` on-foot poses
  (stand/walk/jump/climb).

---

## Test tooling (read once before Task 1)

There is no test framework in this repo. Pure-logic modules (`Stage`, `parseRoom`,
`themes`) import only `config.js`/`themes.js` and are canvas-free, so they run
under Node directly. Each `tests/stage/*.test.mjs` is a self-contained ES module
that imports the source, runs assertions, prints `ok`/`FAIL` lines, and exits
non-zero on any failure. Use this tiny harness at the top of every test file:

```js
// minimal assert harness — no dependencies
let failed = 0, passed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`ok   - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}`); }
}
function near(a, b, eps = 0.5) { return Math.abs(a - b) <= eps; }
function done() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
```

Run a file with: `node tests/stage/<file>.test.mjs`. Rendering and the full
enter→play→exit flow are verified in-browser via Chrome-MCP (Task 10), following
the repo's freeze-RAF workflow (`window.game = game;`, then `g.update = () => {}`
before screenshots; remove the handle before committing).

---

### Task 1: Project marker, `STAGE` config, and theme data

**Files:**
- Create: `package.json`
- Modify: `src/config.js` (append a `STAGE` export near the other tuning blocks)
- Create: `src/stage/themes.js`
- Test: `tests/stage/parse.test.mjs` (dimension assertions here; parser assertions
  added in Task 2)

**Interfaces:**
- Produces: `STAGE` constant; `THEMES` array of theme objects
  `{ key, name, entrance: 'wreck'|'cavemouth', palette, hazardGlyph, rooms: string[][] }`
  where each `rooms[i]` is an array of exactly 20 strings of exactly 30 chars.
  `getTheme(key)` helper returns a theme by key.

- [ ] **Step 1: Create the Node ESM marker**

Create `package.json` with EXACTLY this content (no more fields — zero dependencies):

```json
{ "type": "module" }
```

- [ ] **Step 2: Add `STAGE` tuning to config**

In `src/config.js`, after the `HARPOON` block (near line 233), add:

```js
// Cave-entrance platformer stages. A themed, few-room platform minigame reached
// through a reef entrance (see src/stage/). Fixed 30×20 tile screen at 30px.
export const STAGE = {
  tile: 30, cols: 30, rows: 20,
  gravity: 1500,      // px/s^2 downward
  maxFall: 640,       // terminal fall speed
  walk: 210,          // horizontal walk speed
  jump: 560,          // jump impulse (upward velocity on press when grounded)
  climb: 150,         // ladder climb speed
  bodyW: 20, bodyH: 28,   // diver-on-foot AABB (fits inside a 30px tile)
  moverSpeed: 72,     // patroller / sliding-hazard speed
  respawnInvuln: 1.1, // brief mercy window after respawning at a room start
  cacheValue: 1200,   // final loot cache payout (richer than a normal reef find)
  coinValue: 60, gemValue: 140,   // per 'o' pickup (alternating by theme accent)
  substep: 1 / 120,   // physics sub-step cap so fast falls never tunnel tiles
  entranceR: 42,      // reef-side entrance proximity radius for contains()
};
```

- [ ] **Step 3: Write the theme data + room maps**

Create `src/stage/themes.js`. Author two themes; every room is exactly 20×30.
Glyph legend (parser in Task 2): `.` empty · `#` solid · `H` ladder · `^` static
spike · `x` sliding hazard · `E` patroller · `o` loot · `<` retreat door (→ reef,
any room) · `>` exit door (→ next room, or completes stage in the final room) ·
`S` start/respawn · `$` final loot cache (final room only).

```js
// Theme data for platformer stages. Pure data: palette + hazard glyph + ASCII
// room maps. Each room is exactly STAGE.rows (20) strings of STAGE.cols (30)
// chars. Rooms are traversed front-to-back; the last room holds the '$' cache.
// See src/stage/stage.js for the glyph legend + parser.

// Ship theme — a large shipwreck entrance; climb the decks in warm wood/brass.
const SHIP = {
  key: 'ship',
  name: 'THE WRECK',
  entrance: 'wreck',
  hazardGlyph: 'barrel',      // rendering hint for movers/spikes
  palette: {
    bg1: '#3a2a1c', bg2: '#1c1109', solid: '#6b4a2b', solidEdge: '#3a2716',
    ladder: '#caa15a', hazard: '#c8662b', door: '#8fe6ff', loot: '#ffcf5c',
    cache: '#ffe9a6', accent: 'gem',
  },
  rooms: [
    [ // Room 1/3 — the lower hold: climb the ladder to the exit up top.
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '......>...o..o................',
      '......########................',
      '...........H..................',
      '...........H.......o..........',
      '...........H....########......',
      '...........H..................',
      '...........H..........o.......',
      '.S...<.....H....E.............',
      '..............................',
      '##############################',
    ],
    [ // Room 2/3 — mid-deck: mind the spikes and the sliding barrel.
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '............o..o..............',
      '.........#########............',
      '................H.............',
      '................H.....>.......',
      '................H..#######.....'.slice(0, 30),
      '......o.........H.............',
      '####........####H.............',
      '....H...........H.............',
      '....H......x....H.............',
      '....H...........H.............',
      '....H..######...H.............',
      '.S..H....^^.....H....o........',
      '....H...........H.............',
      '.<..H...........H.............',
      '##############################',
    ],
    [ // Room 3/3 — captain's hold: grab the cache ($), then the exit completes.
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '.................o....o.......',
      '..............#########.......',
      '..............................',
      '.....o........................',
      '..#######.....................',
      '.........H....................',
      '.........H..........#######...',
      '.........H..........#..$..#...',
      '.........H..........#....>#...',
      '.........H....E.....#######...',
      '.........H....................',
      '....^^...H.........x..........',
      '.S.......H....o...............',
      '.........H....................',
      '.<.......H....................',
      '##############################',
    ],
  ],
};

// Secret-lair theme — a cave mouth; descend into cold rock, metal, neon arcs.
const LAIR = {
  key: 'lair',
  name: 'THE LAIR',
  entrance: 'cavemouth',
  hazardGlyph: 'arc',
  palette: {
    bg1: '#0e1622', bg2: '#05080d', solid: '#2a3947', solidEdge: '#12202b',
    ladder: '#5fe0c8', hazard: '#7ff3ff', door: '#8fe6ff', loot: '#61dcff',
    cache: '#eafcff', accent: 'gem',
  },
  rooms: [
    [ // Room 1/3 — entry shaft: drop past ledges, climb to the exit.
      '..............................',
      '..............................',
      '..............................',
      '.S...<........................',
      '#######.......................',
      '.....H........................',
      '.....H.....o..o...............',
      '.....H....########............',
      '.....H........................',
      '.....H................o.......',
      '.....H............#######.....',
      '.....H........................',
      '.....H....o...................',
      '.....H..######................',
      '.....H.........E..............',
      '.....H..............>.........',
      '.....H............#######.....',
      '.....H........^^..............',
      '.....H........................',
      '##############################',
    ],
    [ // Room 2/3 — the arc gallery: sliding energy hazards between ladders.
      '..............................',
      '..............................',
      '..........o....o..............',
      '.......#########..............',
      '..............................',
      '.S..<.....H...................',
      '########..H...................',
      '.........H....................'.slice(0, 30),
      '.........H.....x..............',
      '.........H..#######...........',
      '.........H..................H.',
      '.........H..........o.......H.',
      '.........H.......#######.....H',
      '.........H..................H.',
      '.....o...H..........x.......H.',
      '..#####..H..................H.',
      '.........H..............>...H.',
      '.........H............#######.',
      '.........H....^^..............',
      '##############################',
    ],
    [ // Room 3/3 — the vault: reach the cache ($), exit completes the stage.
      '..............................',
      '..............................',
      '............o....o............',
      '.........#########............',
      '..............................',
      '.S..<.........................',
      '######........................',
      '.....H........................',
      '.....H.......E................',
      '.....H....#######.............',
      '.....H........................',
      '.....H...............#######..',
      '.....H...............#..$..#..',
      '.....H...............#....>#..',
      '.....H.....x.........#######..',
      '.....H..######................',
      '.....H........o...............',
      '.....H....^^..................',
      '.....H........................',
      '##############################',
    ],
  ],
};

export const THEMES = [SHIP, LAIR];
export function getTheme(key) { return THEMES.find((t) => t.key === key) || THEMES[0]; }
```

> NOTE on the two `.slice(0, 30)` lines: those two source rows are written 30
> chars long already; the `.slice(0, 30)` is a belt-and-braces guard and can be
> dropped once Step 5 confirms every row is exactly 30. Prefer plain 30-char
> string literals — if you retype those rows to exactly 30 chars, remove the
> `.slice`. The Task-1 test will fail loudly if any row is not 30.

- [ ] **Step 4: Write the failing dimension test**

Create `tests/stage/parse.test.mjs`:

```js
import { STAGE } from '../../src/config.js';
import { THEMES, getTheme } from '../../src/stage/themes.js';

let failed = 0, passed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`ok   - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}`); }
}
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

assert('two themes ship+lair', THEMES.length === 2 && THEMES[0].key === 'ship' && THEMES[1].key === 'lair');
assert('getTheme returns lair', getTheme('lair').name === 'THE LAIR');
assert('getTheme falls back', getTheme('nope') === THEMES[0]);
for (const th of THEMES) {
  assert(`${th.key} has 3 rooms`, th.rooms.length === 3);
  for (let i = 0; i < th.rooms.length; i++) {
    const room = th.rooms[i];
    assert(`${th.key} room ${i} has ${STAGE.rows} rows`, room.length === STAGE.rows);
    const badRow = room.findIndex((r) => r.length !== STAGE.cols);
    assert(`${th.key} room ${i} all rows are ${STAGE.cols} chars`, badRow === -1);
    assert(`${th.key} room ${i} has exactly one S`, room.join('').split('S').length - 1 === 1);
    assert(`${th.key} room ${i} has an exit >`, room.join('').includes('>'));
  }
  const last = th.rooms[th.rooms.length - 1];
  assert(`${th.key} final room has a cache $`, last.join('').includes('$'));
}
done();
```

- [ ] **Step 5: Run the test to verify it fails, then passes**

Run: `node tests/stage/parse.test.mjs`
Expected first run: FAIL if any room row is not exactly 30 chars or a required
glyph is missing. Fix the offending rows in `themes.js` (retype to exactly 30
chars; ensure each room has one `S`, at least one `>`, and each final room a `$`)
until: `... passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add package.json src/config.js src/stage/themes.js tests/stage/parse.test.mjs
git commit -m "feat(stage): STAGE config + ship/lair theme data with room maps"
```

---

### Task 2: Room parser (`parseRoom`) + grid model

**Files:**
- Create/modify: `src/stage/stage.js` (add `parseRoom` and glyph helpers; the
  `Stage` class arrives in Task 3)
- Test: `tests/stage/parse.test.mjs` (append parser assertions)

**Interfaces:**
- Consumes: `STAGE` from `config.js`.
- Produces:
  - `parseRoom(rows: string[]) -> Room` where
    ```
    Room = {
      cols, rows,                       // 30, 20
      grid: string[][],                 // grid[r][c] AFTER extraction: only
                                        // '.', '#', 'H', '^', '<', '>' remain;
                                        // 'S','o','$','x','E' are removed to '.'
      start: { x, y },                  // body top-left pixel for spawn/respawn
      loot: Array<{ x, y, w, h, taken }>,      // 'o' pickups, as tile AABBs
      movers: Array<{ x, y, w, h, mode, x0, dir }>, // 'x'=slide,'E'=patrol
      cache: { x, y, w, h, taken } | null,     // '$' final cache tile AABB
    }
    ```
    Pixel conventions: a tile at (col,row) spans `[col*tile, col*tile+tile) ×
    [row*tile, row*tile+tile)`. `start.x = col*tile + (tile - STAGE.bodyW)/2`,
    `start.y = row*tile + (tile - STAGE.bodyH)` (feet at the tile's bottom).
    Loot/cache/mover AABBs are the full 30×30 tile box at that cell.
  - `solidAt(room, col, row) -> boolean` — `grid==='#'`; out-of-bounds left/right/top
    is solid (walls/ceiling), below the bottom row is NOT solid (a pit).
  - `ladderAt(room, col, row) -> boolean` — `grid==='H'`.
  - `spikeAt(room, col, row) -> boolean` — `grid==='^'`.
  - `doorKindAt(room, col, row) -> '<' | '>' | null`.

- [ ] **Step 1: Write the failing parser test (append to parse.test.mjs)**

Append below the dimension assertions (before `done()`), and move `done()` to the
very end:

```js
import { parseRoom, solidAt, ladderAt, spikeAt, doorKindAt } from '../../src/stage/stage.js';

const T = STAGE.tile;
const sample = [
  '##############################', // row0 solid ceiling strip
  '..............................',
  '..S.....o.....................',
  '..#####.......................',
  '.....H........................',
  '.....H....^...................',
  '.....H....E.........$.........',
  '.....H........................',
  '<...........................>.',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '##############################',
];
const room = parseRoom(sample);
assert('parse: cols/rows', room.cols === 30 && room.rows === 20);
assert('parse: S extracted to empty', room.grid[2][2] === '.');
assert('parse: start x centered', near(room.start.x, 2 * T + (T - STAGE.bodyW) / 2));
assert('parse: start y feet at tile bottom', near(room.start.y, 2 * T + (T - STAGE.bodyH)));
assert('parse: one loot', room.loot.length === 1 && near(room.loot[0].x, 8 * T));
assert('parse: loot tile cleared', room.grid[2][8] === '.');
assert('parse: cache present', room.cache && near(room.cache.x, 20 * T) && room.cache.taken === false);
assert('parse: two movers (slide? no, one E one none)', room.movers.length === 1); // only 'E' here
assert('parse: mover is patrol', room.movers[0].mode === 'patrol');
assert('parse: spike stays in grid', spikeAt(room, 10, 5) === true);
assert('parse: solid lookup', solidAt(room, 0, 0) === true && solidAt(room, 5, 5) === false);
assert('parse: side walls solid OOB', solidAt(room, -1, 5) === true && solidAt(room, 30, 5) === true);
assert('parse: pit below bottom not solid', solidAt(room, 5, 20) === false);
assert('parse: ladder lookup', ladderAt(room, 5, 4) === true);
assert('parse: doors', doorKindAt(room, 0, 8) === '<' && doorKindAt(room, 28, 8) === '>');
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/stage/parse.test.mjs`
Expected: FAIL — `parseRoom is not a function` (module has no such export yet).

- [ ] **Step 3: Implement `parseRoom` + lookups**

Create `src/stage/stage.js` (Stage class added in Task 3):

```js
// Platformer stage: parsing + physics for the cave-entrance minigame. LOGIC ONLY
// — no canvas/DOM imports, so Node can run it under test and the Game can drive
// it headlessly. Rendering lives in src/render/stage.js.
import { STAGE } from '../config.js';

const T = STAGE.tile;

// Glyphs that remain in the static grid after extraction (everything the physics
// queries by tile). Dynamic glyphs (S/o/$/x/E) are pulled into lists and their
// cell is cleared to '.'.
const STATIC = new Set(['.', '#', 'H', '^', '<', '>']);

export function parseRoom(rows) {
  const grid = rows.map((r) => r.split(''));
  const loot = [], movers = [];
  let start = null, cache = null;
  const cellBox = (c, r) => ({ x: c * T, y: r * T, w: T, h: T });
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const g = grid[r][c];
      if (STATIC.has(g)) continue;
      if (g === 'S') {
        start = { x: c * T + (T - STAGE.bodyW) / 2, y: r * T + (T - STAGE.bodyH) };
      } else if (g === 'o') {
        loot.push({ ...cellBox(c, r), taken: false });
      } else if (g === '$') {
        cache = { ...cellBox(c, r), taken: false };
      } else if (g === 'x') {
        movers.push({ ...cellBox(c, r), mode: 'slide', x0: c * T, dir: 1 });
      } else if (g === 'E') {
        movers.push({ ...cellBox(c, r), mode: 'patrol', x0: c * T, dir: 1 });
      }
      grid[r][c] = '.';   // clear the dynamic glyph from the static grid
    }
  }
  if (!start) start = { x: T, y: T };   // defensive: every room should have an S
  return { cols: STAGE.cols, rows: STAGE.rows, grid, start, loot, movers, cache };
}

export function solidAt(room, col, row) {
  if (col < 0 || col >= room.cols) return true;   // side walls
  if (row < 0) return true;                        // ceiling
  if (row >= room.rows) return false;              // below floor = pit
  return room.grid[row][col] === '#';
}
export function ladderAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
  return room.grid[row][col] === 'H';
}
export function spikeAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
  return room.grid[row][col] === '^';
}
export function doorKindAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return null;
  const g = room.grid[row][col];
  return g === '<' || g === '>' ? g : null;
}

// Tile-range helpers used by the physics (Task 3+).
export function tileRange(x, y, w, h) {
  return {
    c0: Math.floor(x / T), c1: Math.floor((x + w - 1) / T),
    r0: Math.floor(y / T), r1: Math.floor((y + h - 1) / T),
  };
}
export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/stage/parse.test.mjs`
Expected: PASS — `... passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/stage/stage.js tests/stage/parse.test.mjs
git commit -m "feat(stage): parseRoom + grid lookups (solid/ladder/spike/door)"
```

---

### Task 3: `Stage` core physics — gravity, walk, jump, tile collision

**Files:**
- Modify: `src/stage/stage.js` (add the `Stage` class)
- Test: `tests/stage/physics.test.mjs`

**Interfaces:**
- Consumes: `parseRoom`, `solidAt`, `tileRange` (Task 2); `STAGE` (config).
- Produces:
  - `class Stage` with:
    - `constructor(theme)` — stores `theme`, parses all rooms into `this.rooms`,
      sets `this.roomIndex = 0`, spawns `this.body` at room 0's `start`, sets
      `this.bannerT`, `this.animT`, `this.result = null`.
    - `body = { x, y, w, h, vx, vy, onGround, onLadder, facing, invuln, pose }`.
      `pose ∈ 'stand'|'walk'|'jump'|'climb'` (set for the renderer).
    - `get room()` → `this.rooms[this.roomIndex]`.
    - `update(dt, cmd) -> { loot, died, exited }` (this task returns the physics
      part; loot/died/exited default to `0/false/null` until Tasks 4-6). `cmd =
      { moveX, jump, climbY }`.
    - `_step(dt, cmd)` — a single sub-stepped physics tick (gravity, walk, jump,
      X-then-Y collision).

- [ ] **Step 1: Write the failing physics test**

Create `tests/stage/physics.test.mjs`:

```js
import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function near(a, b, eps = 1.5) { return Math.abs(a - b) <= eps; }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const T = STAGE.tile;
// A tiny hand-built theme: floor across the bottom, a wall column, start mid-air.
function mkStage(roomRows) {
  return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: {}, hazardGlyph: 'barrel', rooms: [roomRows] });
}
const floorRoom = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..S...........................', // start high so it falls
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '............#.................', // a wall column at col12, rows17-18
  '............#.................',
  '##############################',
];
const idle = { moveX: 0, jump: false, climbY: 0 };

// Gravity: body falls and lands on the floor (top of row 19 = y=19*T).
let s = mkStage(floorRoom);
const startY = s.body.y;
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);
assert('falls under gravity', s.body.y > startY);
assert('lands on floor (feet at row19 top)', near(s.body.y + s.body.h, 19 * T));
assert('onGround after landing', s.body.onGround === true);
assert('vy zeroed on landing', near(s.body.vy, 0, 1));

// No tunneling at terminal speed: drop from the top, still lands (never below floor).
s = mkStage(floorRoom);
s.body.y = 0; s.body.vy = STAGE.maxFall;
for (let i = 0; i < 240; i++) s.update(1 / 60, idle);
assert('no tunnel: never passes through floor', s.body.y + s.body.h <= 19 * T + 0.6);

// Walk right into the wall column: stops, does not enter the wall.
s = mkStage(floorRoom);
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);   // land first
for (let i = 0; i < 120; i++) s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 });
assert('walking moved right', s.body.x > 2 * T);
assert('blocked by wall (left of col12)', s.body.x + s.body.w <= 12 * T + 0.6);
assert('pose is walk while moving', s.body.pose === 'walk');

// Jump from the ground gains height then returns.
s = mkStage(floorRoom);
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);
const groundY = s.body.y;
s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
assert('jump gives upward velocity', s.body.vy < 0);
let minY = s.body.y;
for (let i = 0; i < 60; i++) { s.update(1 / 60, idle); minY = Math.min(minY, s.body.y); }
assert('jump reached higher than ground', minY < groundY - T);
assert('cannot jump in mid-air (no double jump)', true); // covered by onGround gate below
// verify double-jump gate: while airborne a jump command does not re-boost upward beyond gravity
s = mkStage(floorRoom);
for (let i = 0; i < 120; i++) s.update(1 / 60, idle);
s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
const vyAfterFirst = s.body.vy;
s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
assert('second jump mid-air ignored', s.body.vy > vyAfterFirst); // vy increased (gravity), not reset to -jump
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/stage/physics.test.mjs`
Expected: FAIL — `Stage is not a constructor`.

- [ ] **Step 3: Implement the `Stage` class core**

Append to `src/stage/stage.js`:

```js
export class Stage {
  constructor(theme) {
    this.theme = theme;
    this.rooms = theme.rooms.map((r) => parseRoom(r));
    this.roomIndex = 0;
    this.result = null;         // set to 'retreat' | 'complete' when leaving
    this.bannerT = 2.2;         // seconds the room banner shows
    this.animT = 0;             // walk/climb animation clock
    const st = this.rooms[0].start;
    this.body = {
      x: st.x, y: st.y, w: STAGE.bodyW, h: STAGE.bodyH,
      vx: 0, vy: 0, onGround: false, onLadder: false, facing: 1,
      invuln: 0, pose: 'stand',
    };
  }

  get room() { return this.rooms[this.roomIndex]; }

  // Advance the stage. Sub-steps the physics so a terminal-speed fall never
  // skips a tile. Returns per-frame events for the Game to apply.
  update(dt, cmd) {
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.animT += dt * (Math.abs(this.body.vx) > 10 || this.body.onLadder ? 1 : 0);
    if (this.body.invuln > 0) this.body.invuln -= dt;
    let remaining = dt;
    const ev = { loot: 0, died: false, exited: null };
    while (remaining > 0) {
      const step = Math.min(STAGE.substep, remaining);
      this._step(step, cmd);
      remaining -= step;
    }
    return ev;   // Tasks 4-6 fill loot/died/exited
  }

  // One physics sub-step: input → intent, gravity, X-then-Y tile collision.
  _step(dt, cmd) {
    const b = this.body;
    // Horizontal intent.
    b.vx = cmd.moveX * STAGE.walk;
    if (cmd.moveX !== 0) b.facing = cmd.moveX > 0 ? 1 : -1;
    // Jump only from the ground (no double jump). Ladder handling: Task 4.
    if (cmd.jump && b.onGround) { b.vy = -STAGE.jump; b.onGround = false; }
    // Gravity.
    b.vy = Math.min(STAGE.maxFall, b.vy + STAGE.gravity * dt);

    // --- X axis ---
    b.x += b.vx * dt;
    this._collideAxis('x');
    // --- Y axis ---
    b.onGround = false;
    b.y += b.vy * dt;
    this._collideAxis('y');

    // Pose (renderer hint).
    if (!b.onGround) b.pose = 'jump';
    else if (Math.abs(b.vx) > 10) b.pose = 'walk';
    else b.pose = 'stand';
  }

  // Resolve the body out of any solid tiles it overlaps along one axis.
  _collideAxis(axis) {
    const b = this.body, room = this.room;
    const rng = tileRange(b.x, b.y, b.w, b.h);
    for (let r = rng.r0; r <= rng.r1; r++) {
      for (let c = rng.c0; c <= rng.c1; c++) {
        if (!solidAt(room, c, r)) continue;
        const tileL = c * T, tileR = c * T + T, tileT = r * T, tileB = r * T + T;
        if (axis === 'x') {
          if (b.vx > 0) b.x = tileL - b.w;
          else if (b.vx < 0) b.x = tileR;
          b.vx = 0;
        } else {
          if (b.vy > 0) { b.y = tileT - b.h; b.onGround = true; }
          else if (b.vy < 0) b.y = tileB;
          b.vy = 0;
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/stage/physics.test.mjs`
Expected: PASS — `... passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/stage/stage.js tests/stage/physics.test.mjs
git commit -m "feat(stage): Stage physics — gravity, walk, jump, tile collision"
```

---

### Task 4: Ladders & climbing

**Files:**
- Modify: `src/stage/stage.js` (`_step` ladder branch; add `ladderAt` import use)
- Test: `tests/stage/ladders.test.mjs`

**Interfaces:**
- Consumes: `ladderAt` (Task 2).
- Produces: climb behavior in `Stage._step` — while the body's center column is a
  ladder tile and `cmd.climbY !== 0`, enter climb mode: `onLadder = true`, gravity
  off, `vy = cmd.climbY * STAGE.climb`, `vx = cmd.moveX * STAGE.walk` still allowed;
  gently center `x` toward the ladder column. Leaving: no ladder overlap, or a
  jump press (jumps off), or no climb input while grounded. `pose = 'climb'` while
  on a ladder.

- [ ] **Step 1: Write the failing ladder test**

Create `tests/stage/ladders.test.mjs`:

```js
import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function near(a, b, eps = 2) { return Math.abs(a - b) <= eps; }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }
const T = STAGE.tile;
function mkStage(rows) { return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: {}, hazardGlyph: 'barrel', rooms: [rows] }); }

// A ladder at col5 from row5 down to the floor; start standing at the ladder base.
const rows = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....H........................',
  '.....S........................', // start on the ladder column, near floor
  '.....H........................',
  '##############################',
];
const T5 = 5 * T + (T - STAGE.bodyW) / 2;

// Climb up: hold climbY=-1 while overlapping the ladder → rises, gravity off.
let s = mkStage(rows);
for (let i = 0; i < 30; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: 0 }); // settle
const yAtBase = s.body.y;
for (let i = 0; i < 60; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: -1 });
assert('climbs upward on ladder', s.body.y < yAtBase - T);
assert('onLadder true while climbing', s.body.onLadder === true);
assert('pose is climb', s.body.pose === 'climb');
assert('x centered on ladder', near(s.body.x, T5, 3));

// Reaching the top (no ladder above row5): leaves climb, gravity resumes.
for (let i = 0; i < 240; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: -1 });
assert('cannot climb above the top ladder tile', s.body.y + s.body.h >= 5 * T - 1);

// Resting on a ladder (climbY=0 while overlapping) holds position (no fall).
s = mkStage(rows);
for (let i = 0; i < 30; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: 0 });
for (let i = 0; i < 30; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: -1 }); // grab ladder mid-way
const restY = s.body.y;
for (let i = 0; i < 60; i++) s.update(1 / 60, { moveX: 0, jump: false, climbY: 0 });
assert('rests on ladder without falling', near(s.body.y, restY, 2));

// Jump off a ladder: a jump press leaves climb mode with upward velocity.
for (let i = 0; i < 1; i++) s.update(1 / 60, { moveX: 0, jump: true, climbY: 0 });
assert('jump off ladder gives upward vy', s.body.vy < 0 && s.body.onLadder === false);
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/stage/ladders.test.mjs`
Expected: FAIL — the body falls (no ladder handling yet); climb assertions fail.

- [ ] **Step 3: Implement ladders in `_step`**

In `src/stage/stage.js`, add `ladderAt` to the imports already used, and modify
`Stage._step`. Replace the jump/gravity section so it reads:

```js
  _step(dt, cmd) {
    const b = this.body;
    // Horizontal intent.
    b.vx = cmd.moveX * STAGE.walk;
    if (cmd.moveX !== 0) b.facing = cmd.moveX > 0 ? 1 : -1;

    // Ladder: if the body's centre column is a ladder tile and the player holds
    // up/down, climb (gravity off). Grabbing also holds position when climbY=0
    // *after* already on the ladder, so you can pause on a rung.
    const cx = Math.floor((b.x + b.w / 2) / T);
    const cyTop = Math.floor(b.y / T);
    const cyBot = Math.floor((b.y + b.h - 1) / T);
    const onLadderTile = ladderAt(this.room, cx, cyTop) || ladderAt(this.room, cx, cyBot);
    if (onLadderTile && (cmd.climbY !== 0 || b.onLadder)) {
      b.onLadder = true;
      b.vy = cmd.climbY * STAGE.climb;
      // Gently centre on the ladder column for a clean climb.
      const target = cx * T + (T - b.w) / 2;
      b.x += (target - b.x) * Math.min(1, dt * 12);
    } else {
      b.onLadder = false;
    }
    // Jump only from the ground OR off a ladder (leaves climb).
    if (cmd.jump && (b.onGround || b.onLadder)) { b.vy = -STAGE.jump; b.onGround = false; b.onLadder = false; }
    // Gravity — suspended while on a ladder.
    if (!b.onLadder) b.vy = Math.min(STAGE.maxFall, b.vy + STAGE.gravity * dt);

    // --- X axis ---
    b.x += b.vx * dt;
    this._collideAxis('x');
    // --- Y axis ---
    b.onGround = false;
    b.y += b.vy * dt;
    this._collideAxis('y');

    // Pose (renderer hint).
    if (b.onLadder) b.pose = 'climb';
    else if (!b.onGround) b.pose = 'jump';
    else if (Math.abs(b.vx) > 10) b.pose = 'walk';
    else b.pose = 'stand';
  }
```

Update the import line at the top of `stage.js` if `ladderAt` is defined later in
the same module — it is defined in this file (Task 2), so no import is needed; it
is in scope. (Confirm `ladderAt`, `solidAt`, `tileRange` are all module-level
functions in this file.)

- [ ] **Step 4: Run to verify pass**

Run: `node tests/stage/ladders.test.mjs`
Expected: PASS. Then re-run `node tests/stage/physics.test.mjs` to confirm no
regression — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stage/stage.js tests/stage/ladders.test.mjs
git commit -m "feat(stage): ladders — climb, rest, and jump-off"
```

---

### Task 5: Movers, hazards, death & respawn

**Files:**
- Modify: `src/stage/stage.js` (`update` fills `died`; add `_updateMovers`,
  `_checkDeath`, `respawn`)
- Test: `tests/stage/hazards.test.mjs`

**Interfaces:**
- Consumes: `spikeAt`, `aabbOverlap`, `solidAt` (Task 2).
- Produces:
  - `_updateMovers(dt)` — advance each mover in `this.room.movers`:
    - `mode:'patrol'` — walk horizontally at `STAGE.moverSpeed`; flip `dir` at a
      wall ahead OR at a platform edge (no solid tile below the next step).
    - `mode:'slide'` — oscillate horizontally between the nearest solid tiles on
      its row (bounces off walls); ignores gravity/edges.
  - `update(...)` now sets `ev.died = true` on the frame the body touches a spike
    tile, a mover AABB, or falls below the floor — but only when `body.invuln <= 0`.
  - `respawn()` — reset the body to `this.room.start`, zero velocity, set
    `body.invuln = STAGE.respawnInvuln`, and reset the current room's movers to
    their spawn columns.

- [ ] **Step 1: Write the failing hazards test**

Create `tests/stage/hazards.test.mjs`:

```js
import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }
const T = STAGE.tile;
function mkStage(rows) { return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: {}, hazardGlyph: 'barrel', rooms: [rows] }); }
const idle = { moveX: 0, jump: false, climbY: 0 };

// Patroller on a platform flips at the edge, never walks off.
const patRoom = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.......E......................', // patroller on the platform below
  '.....########.................', // platform cols5-12, row14
  '..............................',
  '..............................',
  '..S...........................',
  '..............................',
  '##############################',
];
let s = mkStage(patRoom);
const m = s.room.movers[0];
const leftEdge = 5 * T, rightEdge = 12 * T + T;
let minX = m.x, maxX = m.x;
for (let i = 0; i < 600; i++) { s.update(1 / 60, idle); minX = Math.min(minX, s.room.movers[0].x); maxX = Math.max(maxX, s.room.movers[0].x); }
assert('patroller stays on platform (left)', minX >= leftEdge - 1);
assert('patroller stays on platform (right)', maxX + T <= rightEdge + 1);
assert('patroller actually moved', maxX - minX > T);

// Falling into a pit kills the body.
const pitRoom = [
  '..S...........................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................', // no floor at all → pit
];
s = mkStage(pitRoom);
let died = false;
for (let i = 0; i < 240 && !died; i++) died = s.update(1 / 60, idle).died;
assert('falling into a pit reports died', died === true);

// Touching a spike kills; respawn returns the body to start with invuln.
const spikeRoom = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..S....^......................', // spike at col7 on the same floor row18
  '..#######.....................',
  '##############################',
];
s = mkStage(spikeRoom);
const startX = s.room.start.x, startY = s.room.start.y;
let hitDied = false;
for (let i = 0; i < 200 && !hitDied; i++) hitDied = s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 }).died;
assert('walking into a spike reports died', hitDied === true);
s.respawn();
assert('respawn resets to start', Math.abs(s.body.x - startX) < 1 && Math.abs(s.body.y - startY) < 1);
assert('respawn grants invuln', s.body.invuln > 0);
// While invulnerable, an immediate spike overlap does not re-report died.
const again = s.update(1 / 60, idle).died;
assert('invuln suppresses instant re-death', again === false);
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/stage/hazards.test.mjs`
Expected: FAIL — movers don't move / no death reporting yet.

- [ ] **Step 3: Implement movers, death, respawn**

In `src/stage/stage.js`, extend the `Stage` class. Change `update` to call the new
helpers and fill `ev.died`, and add the methods:

```js
  update(dt, cmd) {
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.animT += dt * (Math.abs(this.body.vx) > 10 || this.body.onLadder ? 1 : 0);
    if (this.body.invuln > 0) this.body.invuln -= dt;
    const ev = { loot: 0, died: false, exited: null };
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(STAGE.substep, remaining);
      this._step(step, cmd);
      remaining -= step;
    }
    this._updateMovers(dt);
    if (this.body.invuln <= 0 && this._checkDeath()) ev.died = true;
    return ev;   // loot/exited filled in Task 6
  }

  _updateMovers(dt) {
    const room = this.room, spd = STAGE.moverSpeed;
    for (const m of room.movers) {
      if (m.mode === 'patrol') {
        m.x += m.dir * spd * dt;
        const footRow = Math.floor((m.y + m.h) / T);           // tile row just below
        const aheadCol = Math.floor((m.x + (m.dir > 0 ? m.w : 0)) / T);
        const wallAhead = solidAt(room, aheadCol, Math.floor((m.y + m.h / 2) / T));
        const groundAhead = solidAt(room, aheadCol, footRow);
        if (wallAhead || !groundAhead) {
          m.dir *= -1;
          // nudge back onto the platform so it can't creep off the edge
          m.x += m.dir * spd * dt;
        }
      } else { // slide
        m.x += m.dir * spd * dt;
        const leftCol = Math.floor(m.x / T), rightCol = Math.floor((m.x + m.w) / T);
        const row = Math.floor((m.y + m.h / 2) / T);
        if (solidAt(room, rightCol, row) && m.dir > 0) { m.x = rightCol * T - m.w; m.dir = -1; }
        else if (solidAt(room, leftCol, row) && m.dir < 0) { m.x = (leftCol + 1) * T; m.dir = 1; }
      }
    }
  }

  // True on the frame the body should die: pit, spike tile, or mover overlap.
  _checkDeath() {
    const b = this.body, room = this.room;
    if (b.y > room.rows * T + T) return true;   // fell below the floor
    const rng = tileRange(b.x, b.y, b.w, b.h);
    for (let r = rng.r0; r <= rng.r1; r++)
      for (let c = rng.c0; c <= rng.c1; c++)
        if (spikeAt(room, c, r)) return true;
    for (const m of room.movers) if (aabbOverlap(b, m)) return true;
    return false;
  }

  respawn() {
    const st = this.room.start;
    const b = this.body;
    b.x = st.x; b.y = st.y; b.vx = 0; b.vy = 0;
    b.onGround = false; b.onLadder = false; b.invuln = STAGE.respawnInvuln; b.pose = 'stand';
    // reset movers on this room to their spawn columns
    for (const m of this.room.movers) { m.x = m.x0; m.dir = 1; }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/stage/hazards.test.mjs` → PASS. Re-run
`node tests/stage/physics.test.mjs` and `node tests/stage/ladders.test.mjs` →
both PASS (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/stage/stage.js tests/stage/hazards.test.mjs
git commit -m "feat(stage): movers, spike/pit death, and respawn"
```

---

### Task 6: Loot, doors, room transitions, cache & exit

**Files:**
- Modify: `src/stage/stage.js` (`update` fills `loot`/`exited`; add `_collectLoot`,
  `_checkDoors`)
- Test: `tests/stage/flow.test.mjs`

**Interfaces:**
- Consumes: `aabbOverlap`, `doorKindAt` (Task 2); `STAGE.coinValue`/`gemValue`/
  `cacheValue`.
- Produces (in `update`'s returned `ev`):
  - `ev.loot` — total value grabbed this frame: any `o` tile whose AABB overlaps
    the body (marks `taken`, adds `coinValue` or `gemValue` per the theme accent —
    use `gemValue` when `theme.palette.accent === 'gem'`, else `coinValue`), plus
    `cacheValue` the first time the `$` cache overlaps (marks `cache.taken`).
  - `ev.exited` — `'retreat'` when the body overlaps a `<` door tile; `'complete'`
    when it overlaps a `>` door in the FINAL room; otherwise a `>` door advances
    `roomIndex` and repositions the body at the next room's `start` (and resets the
    banner). Room-advance is internal (no event).

- [ ] **Step 1: Write the failing flow test**

Create `tests/stage/flow.test.mjs`:

```js
import { STAGE } from '../../src/config.js';
import { Stage } from '../../src/stage/stage.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }
const T = STAGE.tile;
function mk(rooms, accent = 'gem') { return new Stage({ key: 't', name: 'T', entrance: 'wreck', palette: { accent }, hazardGlyph: 'barrel', rooms }); }
const idle = { moveX: 0, jump: false, climbY: 0 };

// Loot: standing on a floor with an 'o' right of start; walk into it.
const lootRoom = [
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................',
  '..S...o.......................', // loot at col6, same row as start
  '#######.......................',
  '##############################',
];
let s = mk([lootRoom], 'gem');
let gained = 0;
for (let i = 0; i < 200; i++) gained += s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 }).loot;
assert('grabbing loot yields gem value', gained === STAGE.gemValue);
assert('loot marked taken', s.room.loot[0].taken === true);

// Retreat door: overlapping '<' reports exited='retreat'.
const retreatRoom = [
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................',
  '.<S...........................', // retreat door immediately left of start
  '#######.......................',
  '##############################',
];
s = mk([retreatRoom]);
let exited = null;
for (let i = 0; i < 120 && !exited; i++) exited = s.update(1 / 60, { moveX: -1, jump: false, climbY: 0 }).exited;
assert('overlapping < retreats', exited === 'retreat');

// Exit door advances rooms, then completes in the final room.
const roomA = [
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................',
  '..S....>......................', // exit at col7 (room 0 → room 1)
  '#######.......................',
  '##############################',
];
const roomB = [
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................','..............................',
  '..............................','..............................',
  '..S.$..>......................', // cache at col4, exit at col7 (final room)
  '#######.......................',
  '##############################',
];
s = mk([roomA, roomB]);
// walk right to the exit in room 0
for (let i = 0; i < 120 && s.roomIndex === 0; i++) s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 });
assert('exit door advanced to room 1', s.roomIndex === 1);
assert('body repositioned at room 1 start', Math.abs(s.body.x - s.rooms[1].start.x) < 2);
// walk right: grab cache, then hit the exit → complete
let got = 0, fin = null;
for (let i = 0; i < 200 && !fin; i++) { const e = s.update(1 / 60, { moveX: 1, jump: false, climbY: 0 }); got += e.loot; fin = e.exited; }
assert('cache paid out once', got === STAGE.cacheValue);
assert('final exit completes the stage', fin === 'complete');
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/stage/flow.test.mjs`
Expected: FAIL — loot/doors not wired; `ev.loot`/`ev.exited` stay 0/null.

- [ ] **Step 3: Implement loot + doors in `update`**

In `src/stage/stage.js`, update `update` to collect loot and resolve doors, and add
the helpers:

```js
  update(dt, cmd) {
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.animT += dt * (Math.abs(this.body.vx) > 10 || this.body.onLadder ? 1 : 0);
    if (this.body.invuln > 0) this.body.invuln -= dt;
    const ev = { loot: 0, died: false, exited: null };
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(STAGE.substep, remaining);
      this._step(step, cmd);
      remaining -= step;
    }
    this._updateMovers(dt);
    if (this.body.invuln <= 0 && this._checkDeath()) ev.died = true;
    ev.loot += this._collectLoot();
    ev.exited = this._checkDoors();
    return ev;
  }

  // Grab overlapping 'o' pickups and the '$' cache. Returns value gained.
  _collectLoot() {
    const b = this.body, room = this.room;
    const gemAccent = this.theme.palette && this.theme.palette.accent === 'gem';
    let gained = 0;
    for (const l of room.loot) {
      if (!l.taken && aabbOverlap(b, l)) { l.taken = true; gained += gemAccent ? STAGE.gemValue : STAGE.coinValue; }
    }
    if (room.cache && !room.cache.taken && aabbOverlap(b, room.cache)) { room.cache.taken = true; gained += STAGE.cacheValue; }
    return gained;
  }

  // Resolve door overlaps: '<' retreats; '>' advances a room, or completes if
  // this is the final room. Returns 'retreat' | 'complete' | null.
  _checkDoors() {
    const b = this.body, room = this.room;
    const cx = Math.floor((b.x + b.w / 2) / T);
    const cy = Math.floor((b.y + b.h / 2) / T);
    const kind = doorKindAt(room, cx, cy);
    if (kind === '<') return 'retreat';
    if (kind === '>') {
      if (this.roomIndex >= this.rooms.length - 1) return 'complete';
      this.roomIndex += 1;
      const st = this.room.start;
      b.x = st.x; b.y = st.y; b.vx = 0; b.vy = 0; b.onGround = false; b.onLadder = false;
      this.bannerT = 2.2;
      return null;
    }
    return null;
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/stage/flow.test.mjs` → PASS. Re-run the other three
`tests/stage/*.test.mjs` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stage/stage.js tests/stage/flow.test.mjs
git commit -m "feat(stage): loot, cache, doors, and room transitions"
```

---

### Task 7: On-foot diver sprite poses

**Files:**
- Modify: `src/render/sprites.js` (add `drawDiverFoot`)

**Interfaces:**
- Consumes: `PAL` (already imported in sprites.js), `TAU` (module-local constant).
- Produces: `drawDiverFoot(ctx, pose, animT)` — draws the diver upright at the
  origin (helmet up, legs down), sized to roughly `STAGE.bodyW`×`STAGE.bodyH`
  (~20×28). `pose ∈ 'stand'|'walk'|'jump'|'climb'`; `animT` drives the leg/arm
  swing. Caller handles world translation and horizontal flip.

This task has no unit test (pure rendering); it is verified visually in Task 10.

- [ ] **Step 1: Implement `drawDiverFoot`**

Append to `src/render/sprites.js` (uses the file's existing `PAL` import and local
`const TAU = Math.PI * 2;` — confirm `TAU` exists near the top; if not, add it):

```js
// The diver on foot, for platformer stages. Drawn upright around the origin:
// helmet at top, boots at bottom, inside a ~20×28 box. `pose` picks the stance;
// `animT` swings the limbs. Facing/flip + world translate are the caller's job.
export function drawDiverFoot(ctx, pose, animT) {
  const swing = Math.sin(animT * 10);
  ctx.save();
  // legs
  ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 4; ctx.lineCap = 'round';
  if (pose === 'climb') {
    // legs together on the rung, slight alternating bend
    const c = Math.sin(animT * 8) * 3;
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3 - 2, 14 + c); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(3 + 2, 14 - c); ctx.stroke();
  } else if (pose === 'jump') {
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-6, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(6, 12); ctx.stroke();
  } else if (pose === 'walk') {
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3 + swing * 5, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(3 - swing * 5, 14); ctx.stroke();
  } else { // stand
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(4, 14); ctx.stroke();
  }
  // body
  ctx.fillStyle = PAL.diverSuit;
  ctx.beginPath(); ctx.roundRect(-6, -6, 12, 13, 4); ctx.fill();
  // tank
  ctx.fillStyle = '#4a5c78';
  ctx.beginPath(); ctx.roundRect(-8, -5, 4, 9, 2); ctx.fill();
  // arm(s)
  ctx.strokeStyle = PAL.diverSuit; ctx.lineWidth = 3.5;
  if (pose === 'climb') {
    const a = Math.sin(animT * 8) * 3;
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(6, -8 + a); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(6, -2 - a); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(2, -1); ctx.lineTo(7, 3 + (pose === 'walk' ? -swing * 3 : 0)); ctx.stroke();
  }
  // helmet + glass
  ctx.fillStyle = PAL.diver;
  ctx.beginPath(); ctx.arc(0, -11, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = PAL.diverGlass;
  ctx.beginPath(); ctx.arc(2, -11, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(3.4, -12.4, 1.3, 0, TAU); ctx.fill();
  ctx.restore();
}
```

- [ ] **Step 2: Sanity-check the module still loads**

Run: `node -e "import('./src/render/sprites.js').then(()=>console.log('sprites ok')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `sprites ok` (module parses; canvas is never invoked at import time).

- [ ] **Step 3: Commit**

```bash
git add src/render/sprites.js
git commit -m "feat(stage): on-foot diver sprite poses (stand/walk/jump/climb)"
```

---

### Task 8: Stage renderer (`src/render/stage.js`)

**Files:**
- Create: `src/render/stage.js`

**Interfaces:**
- Consumes: `STAGE` (config); `PAL` (config); `drawDiverFoot` (sprites.js). Reads a
  `Stage` instance's public state: `theme.palette`, `theme.name`, `room.grid`,
  `room.loot`, `room.cache`, `room.movers`, `body`, `roomIndex`, `rooms.length`,
  `bannerT`, `animT`.
- Produces:
  - `drawStageScene(ctx, stage, t)` — paint the themed background, tiles (`#`),
    ladders (`H`), spikes (`^`), doors (`<`/`>`), loot, cache, movers, and the
    on-foot diver. Fixed screen; no camera offset.
  - `drawStageHud(ctx, stage, hud)` — draw the room banner (`theme.name` +
    `Room r/N`) while `bannerT > 0`, plus the shared HUD bits passed in `hud =
    { air, airMax, lives, score, carried }`: a greyed **SEALED** air bar, lives
    pips, score, and carried. (The Game passes its own values so this stays
    decoupled from Game internals.)

This task is verified visually in Task 10.

- [ ] **Step 1: Implement the renderer**

Create `src/render/stage.js`:

```js
// Renders a platformer Stage onto the fixed 900×600 canvas. Pure drawing from a
// Stage's public state — no game logic. Themed by stage.theme.palette.
import { STAGE, PAL } from '../config.js';
import { drawDiverFoot } from './sprites.js';

const T = STAGE.tile;
const { W, H } = { W: 900, H: 600 };

export function drawStageScene(ctx, stage, t) {
  const p = stage.theme.palette, room = stage.room;
  // themed background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // static tiles
  for (let r = 0; r < room.rows; r++) {
    for (let c = 0; c < room.cols; c++) {
      const gch = room.grid[r][c];
      const x = c * T, y = r * T;
      if (gch === '#') {
        ctx.fillStyle = p.solid; ctx.fillRect(x, y, T, T);
        ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
      } else if (gch === 'H') {
        ctx.strokeStyle = p.ladder; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + 7, y + T); ctx.moveTo(x + T - 7, y); ctx.lineTo(x + T - 7, y + T); ctx.stroke();
        for (let k = 6; k < T; k += 10) { ctx.beginPath(); ctx.moveTo(x + 7, y + k); ctx.lineTo(x + T - 7, y + k); ctx.stroke(); }
      } else if (gch === '^') {
        ctx.fillStyle = p.hazard;
        ctx.beginPath(); ctx.moveTo(x + 2, y + T); ctx.lineTo(x + T / 2, y + 6); ctx.lineTo(x + T - 2, y + T); ctx.closePath(); ctx.fill();
      } else if (gch === '<' || gch === '>') {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
        ctx.fillStyle = p.door; ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
        ctx.globalAlpha = 1; ctx.fillStyle = '#04121f';
        ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(gch === '>' ? '›' : '‹', x + T / 2, y + T / 2);
        ctx.restore();
      }
    }
  }
  // loot
  for (const l of room.loot) {
    if (l.taken) continue;
    ctx.fillStyle = p.loot;
    ctx.beginPath(); ctx.arc(l.x + T / 2, l.y + T / 2 + Math.sin(t * 3 + l.x) * 2, 6, 0, Math.PI * 2); ctx.fill();
  }
  // cache
  if (room.cache && !room.cache.taken) {
    const cxp = room.cache.x + T / 2, cyp = room.cache.y + T / 2;
    ctx.save(); ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 5);
    ctx.fillStyle = p.cache;
    ctx.beginPath(); ctx.roundRect(cxp - 11, cyp - 8, 22, 16, 3); ctx.fill();
    ctx.fillStyle = p.solidEdge; ctx.fillRect(cxp - 11, cyp - 2, 22, 3);
    ctx.restore();
  }
  // movers
  for (const m of room.movers) {
    ctx.fillStyle = p.hazard;
    if (stage.theme.hazardGlyph === 'arc') {
      ctx.save(); ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 20);
      ctx.beginPath(); ctx.arc(m.x + m.w / 2, m.y + m.h / 2, m.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(m.x + m.w / 2, m.y + m.h / 2, m.w / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  // diver on foot
  const b = stage.body;
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  if (b.facing < 0) ctx.scale(-1, 1);
  if (b.invuln > 0 && Math.floor(b.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.4;
  drawDiverFoot(ctx, b.pose, stage.animT);
  ctx.restore();
}

export function drawStageHud(ctx, stage, hud) {
  // Top strip.
  const g = ctx.createLinearGradient(0, 0, 0, 70);
  g.addColorStop(0, 'rgba(0,10,20,0.55)'); g.addColorStop(1, 'rgba(0,10,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);
  // Air bar — sealed/greyed.
  const bx = 20, by = 20, bw = 240, bh = 18;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
  ctx.fillStyle = 'rgba(150,170,185,0.5)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
  ctx.fillStyle = PAL.hudText; ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('AIR — SEALED', bx + 8, by + bh / 2);
  // Lives pips.
  const shown = Math.min(hud.lives, 6);
  for (let i = 0; i < shown; i++) {
    ctx.save(); ctx.translate(bx + 8 + i * 22, by + bh + 22); ctx.scale(0.7, 0.7);
    ctx.fillStyle = PAL.diver; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.diverGlass; ctx.beginPath(); ctx.arc(2, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Score / carried.
  ctx.textAlign = 'right'; ctx.fillStyle = PAL.hudText; ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(`SCORE ${hud.score}`, W - 20, 26);
  ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = hud.carried ? PAL.gold : PAL.hudText;
  ctx.fillText(`CARRYING ${hud.carried}`, W - 20, 48);
  // Theme + room label.
  ctx.textAlign = 'center'; ctx.fillStyle = stage.theme.palette.door; ctx.font = '800 13px system-ui, sans-serif';
  ctx.fillText(`${stage.theme.name}  ·  ROOM ${stage.roomIndex + 1}/${stage.rooms.length}`, W / 2, 24);
  // Banner on room entry.
  if (stage.bannerT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, stage.bannerT);
    ctx.textAlign = 'center'; ctx.fillStyle = stage.theme.palette.cache;
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillText(`ROOM ${stage.roomIndex + 1}/${stage.rooms.length}`, W / 2, H / 2 - 40);
    ctx.restore();
  }
  // Controls hint (bottom).
  ctx.textAlign = 'center'; ctx.fillStyle = '#9fc6e0'; ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('← / → walk   ·   ↑ / Space / A jump   ·   ↑ / ↓ climb ladders   ·   ‹ door retreats', W / 2, H - 24);
}
```

- [ ] **Step 2: Sanity-check the module parses**

Run: `node -e "import('./src/render/stage.js').then(()=>console.log('render/stage ok')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `render/stage ok`.

- [ ] **Step 3: Commit**

```bash
git add src/render/stage.js
git commit -m "feat(stage): stage renderer — tiles, props, diver, and HUD"
```

---

### Task 9: Reef-side themed entrance entity

**Files:**
- Create: `src/entities/stageentrance.js`
- Test: `tests/stage/parse.test.mjs` (append a `contains()` assertion block) OR a
  small new `tests/stage/entrance.test.mjs`

**Interfaces:**
- Consumes: `STAGE` (config, for `entranceR`); `PAL` (config).
- Produces:
  - `class StageEntrance` with `constructor(x, y, theme)` storing `x`, `y`,
    `theme` (a full theme object), `r = STAGE.entranceR`.
  - `contains(diver) -> boolean` — `hypot(diver.x-this.x, diver.y-this.y) <
    this.r + diver.radius`.
  - `draw(ctx, camX, camY, t)` — the reef-side sprite: `theme.entrance ===
    'wreck'` draws a large tilted shipwreck hull with a dark doorway; `'cavemouth'`
    draws a rocky arch with a dark interior. Both centre a soft glow so the player
    reads it as enterable.

- [ ] **Step 1: Write the failing entrance test**

Create `tests/stage/entrance.test.mjs`:

```js
import { STAGE } from '../../src/config.js';
import { StageEntrance } from '../../src/entities/stageentrance.js';
import { getTheme } from '../../src/stage/themes.js';

let failed = 0, passed = 0;
function assert(name, cond) { if (cond) { passed++; console.log(`ok   - ${name}`); } else { failed++; console.log(`FAIL - ${name}`); } }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

const e = new StageEntrance(500, 400, getTheme('ship'));
assert('stores theme', e.theme.key === 'ship');
assert('has radius', e.r === STAGE.entranceR);
assert('contains: near diver true', e.contains({ x: 505, y: 405, radius: 15 }) === true);
assert('contains: far diver false', e.contains({ x: 900, y: 900, radius: 15 }) === false);
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/stage/entrance.test.mjs`
Expected: FAIL — module/class does not exist.

- [ ] **Step 3: Implement the entrance entity**

Create `src/entities/stageentrance.js`:

```js
// A reef-side entrance to a platformer stage. Its look advertises the theme
// behind it: a large shipwreck (→ ship stage) or a rocky cave mouth (→ lair).
// Occupies the rare one-special-per-reef slot; one-shot (removed on exit).
import { STAGE, PAL } from '../config.js';

const TAU = Math.PI * 2;

export class StageEntrance {
  constructor(x, y, theme) {
    this.x = x; this.y = y; this.theme = theme; this.r = STAGE.entranceR;
  }
  contains(diver) {
    return Math.hypot(diver.x - this.x, diver.y - this.y) < this.r + diver.radius;
  }
  draw(ctx, camX, camY, t) {
    const sx = this.x - camX, sy = this.y - camY, p = this.theme.palette;
    ctx.save();
    ctx.translate(sx, sy);
    // inviting glow
    const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, this.r + 26);
    glow.addColorStop(0, `rgba(143,230,255,${0.28 + 0.12 * Math.sin(t * 3)})`);
    glow.addColorStop(1, 'rgba(143,230,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, this.r + 26, 0, TAU); ctx.fill();

    if (this.theme.entrance === 'wreck') {
      // tilted hull with a dark doorway
      ctx.rotate(-0.14);
      ctx.fillStyle = p.solid;
      ctx.beginPath(); ctx.moveTo(-90, 30); ctx.quadraticCurveTo(-70, -46, 40, -40);
      ctx.quadraticCurveTo(96, -30, 84, 34); ctx.quadraticCurveTo(0, 54, -90, 30); ctx.fill();
      ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 4; ctx.stroke();
      // planks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
      for (let i = -1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-84, i * 14 + 6); ctx.lineTo(78, i * 14 - 2); ctx.stroke(); }
      // doorway
      ctx.fillStyle = '#05080d';
      ctx.beginPath(); ctx.ellipse(-6, 2, this.r * 0.7, this.r, 0, 0, TAU); ctx.fill();
    } else {
      // rocky cave mouth
      ctx.fillStyle = p.solid;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 30, Math.PI, 0); ctx.lineTo(this.r + 30, 40); ctx.lineTo(-this.r - 30, 40); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = p.solidEdge; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = '#05080d';
      ctx.beginPath(); ctx.ellipse(0, 6, this.r * 0.9, this.r, 0, 0, TAU); ctx.fill();
      // a few neon flecks
      ctx.fillStyle = p.ladder;
      for (let i = 0; i < 4; i++) { const a = t + i * 1.7; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(a * 2); ctx.beginPath(); ctx.arc(Math.cos(a) * 18, 4 + Math.sin(a) * 10, 1.6, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/stage/entrance.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/stageentrance.js tests/stage/entrance.test.mjs
git commit -m "feat(stage): reef-side themed entrance entity (wreck / cave mouth)"
```

---

### Task 10: Wire the stage into the Game (zone-stack integration)

**Files:**
- Modify: `src/game.js`

**Interfaces:**
- Consumes: `Stage` (`src/stage/stage.js`); `StageEntrance` (`src/entities/
  stageentrance.js`); `THEMES`/`getTheme` (`src/stage/themes.js`); `drawStageScene`/
  `drawStageHud` (`src/render/stage.js`); `STAGE` (config).
- Produces: `zone === 'stage'` handling — spawn/enter/update/draw/exit — reusing
  `_snapshotReef`/`_restoreReef`, `_loseLife`, lives/gold/game-over, and touch input.

- [ ] **Step 1: Add imports**

At the top of `src/game.js`, alongside the other imports, add:

```js
import { Stage } from './stage/stage.js';
import { StageEntrance } from './entities/stageentrance.js';
import { THEMES } from './stage/themes.js';
import { drawStageScene, drawStageHud } from './render/stage.js';
import { STAGE } from './config.js';
```

(Fold `STAGE` into the existing `from './config.js'` import list if cleaner.)

- [ ] **Step 2: Initialise fields**

In the `Game` constructor, near where `this.whales = []` / `this.templeGate` are
set (around `src/game.js:102-104`), add:

```js
    this.stageEntrances = []; this.stage = null; this._enteredEntrance = null;
```

And in `_generateWorld` (near `src/game.js:156`, where other arrays are reset) and
in `_generateTemple`/`_generateBelly` (so specials never leak across zones), reset:

```js
    this.stageEntrances = [];
```

(Add `this.stageEntrances = [];` to each of the three generators' reset lines. The
belly/temple generators already null the other specials — keep this consistent.)

- [ ] **Step 3: Add `'stage'` to the special-zone picker**

In `_generateWorld`, inside the `if (Math.random() < 0.7)` special block
(`src/game.js:240-261`), extend the options and add a branch. After the
`gateFloors` computation and before `const pick = ...`:

```js
      const stageFloors = C.floors().filter((f) => f.y > OPEN_BAND + 300 && f.y < WH * 0.72);
      if (stageFloors.length) options.push('stage');
```

Then add, alongside the `whale`/`kraken`/`temple` branches:

```js
      } else if (pick === 'stage') {
        const sf = pickOne(stageFloors);
        const theme = THEMES[(Math.random() * THEMES.length) | 0];
        this.stageEntrances.push(new StageEntrance(sf.x, sf.y - STAGE.entranceR, theme));
```

- [ ] **Step 4: Add `stageEntrances` to snapshot/restore**

In BOTH `_snapshotReef` and `_restoreReef` (`src/game.js:1068` and `:1075`), add
`'stageEntrances'` to the `keys` array (so it round-trips like `whales`):

```js
    const keys = ['cave', 'shells', 'treasures', 'creatures', 'vents', 'wrecks', 'flora', 'skeletons', 'bigBubbles', 'whales', 'ribs', 'currents', 'krakens', 'templeGate', 'powerups', 'relic', 'bells', 'crates', 'darkZones', 'stageEntrances'];
```

- [ ] **Step 5: Enter check in the reef zone**

In `update`, in the `if (this.zone === 'reef')` transitions block (after the whale
and temple-gate checks, `src/game.js:875-876`), add:

```js
      for (const e of this.stageEntrances) { if (this.reentryT <= 0 && e.contains(d)) { this._enterStage(e); this.input.endFrame(); return; } }
```

- [ ] **Step 6: Add the stage update branch**

In `update`, immediately AFTER the not-playing guard at `src/game.js:720`
(`if (this.state !== 'playing') { this.input.endFrame(); return; }`), add:

```js
    if (this.zone === 'stage') { this._updateStage(dt); this.input.endFrame(); return; }
```

This runs only while playing (pause/help/shop are handled above and return early),
so pausing in a stage freezes it. Fire/weapon/swim logic below is skipped.

- [ ] **Step 7: Implement `_enterStage`, `_updateStage`, `_exitStage`**

Add these methods near the other special-zone methods (after `_exitTemple`,
around `src/game.js:1119`):

```js
  // Enter a themed platformer stage through a reef entrance. Snapshots the reef,
  // builds the stage, seals the air. Mirrors _enterWhale/_enterTemple.
  _enterStage(entrance) {
    this._snapshotReef(entrance.x, entrance.y + STAGE.entranceR + 10);
    this._enteredEntrance = entrance;
    this.zone = 'stage';
    this.stage = new Stage(entrance.theme);
    this.camX = 0; this.camY = 0;   // fixed single-screen camera in-stage
    this.shake = 8; this.zoneFade = 1;
    this.audio.select();
  }

  // Drive the stage: translate Input → command, apply loot/death/exit events.
  _updateStage(dt) {
    const inp = this.input;
    const v = inp.vector();
    const up = v.y < -0.4, down = v.y > 0.4;
    const moveX = Math.abs(v.x) > 0.3 ? (v.x > 0 ? 1 : -1) : 0;
    const climbY = up ? -1 : down ? 1 : 0;
    // Jump edge: fresh up-press (rising edge), fire press (Space/F/A), tap, or JUMP button.
    const jump = (up && !this._stageUpPrev) || inp.firePress || inp.consumeTapFire() || inp.consumeButton('jump');
    this._stageUpPrev = up;

    const ev = this.stage.update(dt, { moveX, jump, climbY });
    if (ev.loot) {
      this.carried += ev.loot;
      this.particles.sparkle(this.stage.body.x, this.stage.body.y, PAL.gold, 16);
      this.audio.pearl();
    }
    if (ev.died) {
      this.flash = 1; this.shake = 12; this.audio.hit();
      this._loseLife('killed');
      if (this.state === 'playing') this.stage.respawn();   // still alive → back to room start
    }
    if (ev.exited) this._exitStage();
  }

  // Leave the stage (retreat or completion). Restores the reef and consumes the
  // entrance (one-shot), mirroring _exitWhale filtering the entered whale.
  _exitStage() {
    this._restoreReef();
    this.stageEntrances = this.stageEntrances.filter((e) => e !== this._enteredEntrance);
    this._enteredEntrance = null;
    this.stage = null;
    this._fireGrace = 0.3;   // the exit/jump press shouldn't fire a harpoon back in the reef
  }
```

- [ ] **Step 8: Add the stage draw branch**

In `draw`, immediately after the sailing check at the top
(`if (this.state === 'sailing') { this._sailScreen(); return; }`,
`src/game.js:1143`), add:

```js
    if (this.zone === 'stage' && this.stage) {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      drawStageScene(ctx, this.stage, this.t);
      ctx.restore();
      if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`; ctx.fillRect(0, 0, W, H); }
      if (this.zoneFade > 0.01) { ctx.fillStyle = `rgba(120,180,220,${0.7 * this.zoneFade})`; ctx.fillRect(0, 0, W, H); }
      drawStageHud(ctx, this.stage, { air: this.air, airMax: this.airMax, lives: this.lives, score: this.score, carried: this.carried });
      if (this._touchBtns) for (const b of this._touchBtns) this._touchBtn(b);
      if (this.state === 'paused') this._overlay('PAUSED', (this.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume'));
      if (this.state === 'gameover') this._gameOverScreen();
      return;
    }
```

- [ ] **Step 9: Reef-side entrance draw + proximity hint**

In `draw`, in the reef rendering block (near the whale/temple gate draws,
`src/game.js:1184-1190`), add an entrance draw loop:

```js
      for (const e of this.stageEntrances) e.draw(ctx, cx, cy, this.t);
```

In `_hud`, in the proximity-hint `else` block (near the whale/temple hints,
`src/game.js:1524-1534`), after the temple-gate hint, add:

```js
      if (!hinted) for (const e of this.stageEntrances) {
        if (Math.hypot(this.diver.x - e.x, this.diver.y - e.y) < 260) {
          const msg = e.theme.entrance === 'wreck' ? '🚢 A great shipwreck — swim in to explore the decks' : '🕳 A dark cave mouth — swim in to enter the lair';
          this._text(msg, W / 2, H - 30, 14, PAL.gateGlow, 'center', 'middle');
          break;
        }
      }
```

- [ ] **Step 10: Touch JUMP button**

In `_syncTouchButtons`, add a jump button while in-stage (inside the
`if (this.input.isTouch)` block):

```js
      if (this.state === 'playing' && this.zone === 'stage') {
        btns.push({ id: 'jump', x: W - 96, y: H - 84, w: 72, h: 56 });
      }
```

In `_touchBtn`, add a render branch (with the other `else if (b.id === ...)`
branches):

```js
    } else if (b.id === 'jump') {
      this._text('⤴', cx, cy - 4, 20, PAL.hudText, 'center', 'middle');
      this._text('JUMP', cx, cy + 13, 9, 'rgba(180,215,240,0.85)', 'center', 'middle', true);
```

- [ ] **Step 11: Sanity-check the whole module graph loads under Node**

Run: `node -e "import('./src/game.js').then(()=>console.log('game ok')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `game ok` — every new import resolves and parses. (Game is not
constructed here, so canvas is never touched.) If this errors, fix the import
paths before browser testing.

Then re-run all logic tests to confirm no regression:
Run: `for f in tests/stage/*.test.mjs; do node "$f" || break; done`
Expected: every file ends `... 0 failed`.

- [ ] **Step 12: In-browser MCP verification (integration)**

Start the no-cache server and drive the game in Chrome via MCP. Follow the repo
workflow: temporarily add `window.game = game;` after the `new Game(...)` line in
`src/main.js`; freeze RAF with `g.update = () => {}` before screenshots.

1. Start server (background): `SCUBA_DIR=$(pwd) python3 /tmp/no_cache_server.py`
   (port 8788). If `/tmp/no_cache_server.py` is absent, recreate the tiny no-store
   static server used previously in this project.
2. Load `http://localhost:8788/` in a fresh MCP tab; start a game.
3. Force-spawn an entrance for a deterministic test (via the debug handle in the
   console): construct one at the diver and enter it:
   ```js
   const { StageEntrance } = await import('http://localhost:8788/src/entities/stageentrance.js');
   const { getTheme } = await import('http://localhost:8788/src/stage/themes.js');
   game.stageEntrances = [new StageEntrance(game.diver.x, game.diver.y + 40, getTheme('ship'))];
   ```
4. Swim into it; confirm `game.zone === 'stage'` and the ship stage renders (decks,
   ladder, exit door, banner "ROOM 1/3", greyed "AIR — SEALED").
5. Drive movement via dispatched `KeyboardEvent`s (or by stepping `game.update` with
   held keys): walk (←/→), jump (Space/↑), climb a ladder (↑/↓ on an `H`), grab
   loot (carried increases), step through `>` (advances to ROOM 2/3), reach `$`
   (carried jumps by `STAGE.cacheValue`), and the final `>` (returns to reef).
6. Confirm one-shot: back in the reef, `game.stageEntrances` no longer contains the
   entered entrance.
7. Confirm retreat: re-enter, walk into `<`, verify return to reef with loot kept.
8. Confirm death/respawn: walk into a spike; `lives` drops by 1 and the body is
   back at the room start; drain to 0 lives → game-over screen.
9. Confirm lair theme renders too (repeat step 3 with `getTheme('lair')`).
10. Check the console for errors: **zero** errors/warnings throughout.

Use `mcp__claude-in-chrome__read_console_messages` (pattern `error|Error|Uncaught`)
to confirm a clean console. Capture a screenshot of each theme's first room.

- [ ] **Step 13: Remove the debug handle and commit**

Remove `window.game = game;` from `src/main.js`. Verify:
Run: `grep -n "window.game" src/main.js`  → expect NO output.

```bash
git add src/game.js
git commit -m "feat(stage): wire platformer stages into the zone-stack (enter/update/draw/exit, one-shot)"
```

- [ ] **Step 14: Update docs & memory (housekeeping)**

- In `docs/ROADMAP.md`, move item 1 ("Cave-entrance minigames") from "Planned
  next" into "Shipped since", noting the two themes (ship/lair), and renumber the
  remaining item (secure online scoring) to #1.
- In `docs/DESIGN.md`, add a version entry describing the platformer stage
  subsystem (zone-stack integration, data-driven themes, two launch themes).
- Update the memory file
  `/Users/paulthomas/.claude/projects/-Users-paulthomas-Projects-spectrum-Scuba/memory/deep-descent-project.md`:
  add stages to "Current features" and update "Planned next".

```bash
git add docs/ROADMAP.md docs/DESIGN.md
git commit -m "docs(stage): mark cave-entrance platformer shipped; version log"
```

Then push all commits: `git push origin main`.

---

## Self-Review

**1. Spec coverage** (checked against
`docs/superpowers/specs/2026-08-18-platformer-minigame-design.md`):

| Spec requirement | Task |
|---|---|
| `zone === 'stage'` alongside reef/belly/temple | 10 (Steps 6, 8) |
| `_enterStage` snapshots reef + builds stage + air-paused | 10 (Step 7) |
| update/draw delegate to stage module | 10 (Steps 6, 8) |
| `_exitStage` restores reef + one-shot entrance removal | 10 (Step 7) |
| Fire inert in-stage (no wasted harpoon) | 10 (Step 6 skips fire; Step 7 sets `_fireGrace` on exit) |
| ASCII tile-maps, 30×20 @ 30px, fixed camera | 1 (data), 2 (parser), 10 (camX/camY=0) |
| Tile glyphs `. # H ^ x o E < > S $` | 2 (parser), 1 (maps) |
| Theme = data (palette + hazards + entrance + rooms) | 1 (themes.js) |
| Gravity + terminal velocity + axis-separated AABB collision | 3 |
| Ladders (climb, rest, jump off) | 4 |
| Room transitions `>`/`<`, cache `$`, complete | 6 |
| Respawn via `_loseLife` at room start; out of lives → game-over | 5 (respawn), 10 (Step 7 `_loseLife`) |
| Input mapping (walk/jump/climb; touch JUMP button) | 10 (Steps 6/7/10) |
| Renderer: tiles/ladders/hazards/doors/loot/cache | 8 |
| Diver walk/jump/climb poses | 7 |
| HUD reused + banner + greyed "SEALED" air | 8 (`drawStageHud`) |
| Two themes (ship first as reference, lair) | 1 (both authored); ship rooms lead |
| Entrance occupies one-special-per-reef slot (mutually exclusive) | 10 (Step 3) |
| Reef-side themed entrance sprites (shipwreck / cave mouth) | 9 |
| Testing: parse/collision/ladder/transition/death + MCP flow | 2-6 (Node), 10 (MCP) |

No spec section is unmapped. v1 scope boundaries (no combat, ≤2 themes, no
in-room scrolling) are respected: movers are avoid-only; no weapon logic runs
in-stage; each room is a single fixed screen.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N"
remain. Every code step contains full code; every test step contains real
assertions and a concrete run command with expected output. The one soft spot —
room-map *fun* — is deliberately handled: the shipped maps in Task 1 are complete
and valid (traversable: ground + ladder + reachable exit), and can be tuned
in-browser later (spec's optional follow-up); they are not placeholders.

**3. Type consistency:** Names verified across tasks:
`Stage(theme)`, `stage.update(dt, cmd) -> { loot, died, exited }`,
`cmd = { moveX, jump, climbY }`, `stage.respawn()`, `stage.room`, `stage.body`
(`{x,y,w,h,vx,vy,onGround,onLadder,facing,invuln,pose}`), `stage.roomIndex`,
`stage.rooms`, `stage.bannerT`, `stage.animT`. Parser: `parseRoom(rows)` returning
`{cols,rows,grid,start,loot,movers,cache}`; lookups `solidAt/ladderAt/spikeAt/
doorKindAt(room,col,row)`, plus `tileRange`/`aabbOverlap`. Renderer:
`drawStageScene(ctx, stage, t)`, `drawStageHud(ctx, stage, hud)` with
`hud={air,airMax,lives,score,carried}`. Entity: `StageEntrance(x,y,theme)` with
`contains(diver)`/`draw(ctx,camX,camY,t)`. Sprite: `drawDiverFoot(ctx, pose,
animT)`. Game: `_enterStage`/`_updateStage`/`_exitStage`, fields `stageEntrances`/
`stage`/`_enteredEntrance`/`_stageUpPrev`. All consistent between definition and
use.
