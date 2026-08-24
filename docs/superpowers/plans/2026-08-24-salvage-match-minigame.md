# Salvage Match (match-3 minigame) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Salvage Match", a Candy-Crush-style match-3 minigame that earns the shared salvage currency, plugged into the platform Core as a menu-launched MiniGame.

**Architecture:** A pure, Node-testable match-3 engine (`board.js`) + level data (`levels.js`) + a canvas renderer (`render/match3.js`) + a thin MiniGame module (`index.js`) — mirroring the existing Stage pattern. A new **minigame stack** on the Core (`host.open`/`host.close`) lets the main menu launch the match-3 and return, crediting salvage through the existing uniform path. All additive; no change to the existing dive.

**Tech Stack:** Vanilla ES modules + HTML5 Canvas (no build step, no deps). Node's plain `node file.test.mjs` + a `check()` helper for tests. TypeScript `tsc --noEmit` via `// @ts-check` (P8 posture).

**Spec:** `docs/superpowers/specs/2026-08-24-salvage-match-minigame-design.md`

## Global Constraints

- **No build step; no new runtime dependencies.** Vanilla ES modules only.
- **No behavior change to the existing dive game.** Everything is additive (new files, a new menu item, a new Core stack seam).
- **One shared economy.** Salvage credited via `host.economy.earn({ salvage })` — the same wallet a dive uses.
- **`// @ts-check`** on every new `.js` file; `npm run typecheck` must stay at 0 errors.
- **Tests are plain `.mjs`** run with `node <file>`; each exits non-zero on failure. Use the existing `check(cond, msg)` assert style (see `tests/minigames/*.test.mjs`).
- **Tile types** are integer ids `0..5` mapping to: `0` pearl, `1` gem, `2` coin, `3` shell, `4` starfish, `5` coral.
- **Commit** after every green step. Trailer per CLAUDE.md.
- **Determinism:** the engine takes an injected `rng: () => [0,1)` (default `Math.random`); tests inject `mulberry32(seed)` from `src/stage/chunkgen.js` (already exported) for reproducibility.

---

## File Structure

- Create `src/minigames/match3/board.js` — pure engine (grid, matches, swap resolution, specials, reshuffle).
- Create `src/minigames/match3/levels.js` — level table + helpers.
- Create `src/minigames/match3/index.js` — the MiniGame module (`makeMatch3({ host })`).
- Create `src/render/match3.js` — canvas renderer.
- Modify `src/core/core.js` — add the minigame stack (`open`/`close`, `_pending`, top-of-stack drive).
- Modify `src/core/host.js` — add `open`/`close` forwarders.
- Modify `src/core/contract.js` — add `open`/`close` to the `Host` typedef.
- Modify `src/input.js` — add `match3` and `back` actions to `KEYMAP`.
- Modify `src/game.js` — render a "SALVAGE MATCH" menu button; register its touch hit-rect.
- Modify `src/minigames/reef/index.js` — on the `match3` action at the menu, call `host.open('match3')`.
- Modify `src/main.js` — build + register the match3 minigame; gate legacy-bound input handlers on the legacy being top-of-stack.
- Modify `src/version.js` — bump `BUILD` to `platform-p9`.
- Create tests under `tests/minigames/match3/` and `tests/core/`.

---

## Task 1: Core minigame stack + host.open/close

Generalize `Core` from a single `active` to a **stack**: the base is the persistent home minigame (the legacy game); `open(id)` pushes a session minigame, `close(result)` pops it (crediting via the existing path) and resumes the base. Switches apply at a frame boundary.

**Files:**
- Modify: `src/core/core.js`
- Modify: `src/core/host.js`
- Modify: `src/core/contract.js`
- Test: `tests/core/stack.test.mjs`

**Interfaces:**
- Consumes: existing `Core` (`register`, `boot`, `creditResult`, `update`, `render`), `makeHost`.
- Produces:
  - `Core.open(id: string): void` — queue push+enter of registered minigame `id`.
  - `Core.close(result?): void` — queue exit(+credit)+pop of the top (never pops the base).
  - `Core.active` — getter returning the top of stack (back-compat).
  - `Core.activeId(): string|null` — id of the top minigame.
  - `host.open(id)`, `host.close(result)` — thin forwarders to the Core.

- [ ] **Step 1: Write the failing test**

```js
// tests/core/stack.test.mjs
import { Core } from '../../src/core/core.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

function fakeMG(id, log) {
  return {
    id,
    enter() { log.push(`enter:${id}`); },
    update() { log.push(`update:${id}`); },
    render() { log.push(`render:${id}`); },
    exit() { log.push(`exit:${id}`); return { salvage: id === 'match3' ? 7 : 0, credited: true }; },
  };
}

// open pushes + enters; only the top updates/renders
{
  const log = [];
  const credited = [];
  const core = new Core({ host: {}, creditResult: (r) => credited.push(r) });
  core.register(fakeMG('home', log)).register(fakeMG('match3', log));
  core.boot('home');
  check(core.activeId() === 'home', 'base is home after boot');

  core.open('match3');
  check(core.activeId() === 'home', 'open is deferred until next update');
  core.update(0.016);                       // applies pending, then updates top
  check(core.activeId() === 'match3', 'match3 is top after update boundary');
  check(log.includes('enter:match3'), 'match3 entered');
  log.length = 0;
  core.update(0.016); core.render({});
  check(log.join(',') === 'update:match3,render:match3', 'only top drives the frame');

  // close pops + credits + resumes home (no re-enter)
  core.close({ salvage: 7, credited: true });
  core.update(0.016);
  check(core.activeId() === 'home', 'home resumes after close');
  check(log.includes('exit:match3'), 'match3 exited on close');
  check(!log.includes('enter:home'), 'home is NOT re-entered on resume');
  check(credited.length === 1 && credited[0].salvage === 7, 'close routed result to creditResult');

  // close on the base is a no-op (never pop the home)
  core.close();
  core.update(0.016);
  check(core.activeId() === 'home', 'base is never popped');
}

console.log(`ok stack.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/core/stack.test.mjs`
Expected: FAIL — `core.open is not a function`.

- [ ] **Step 3: Implement the stack in `src/core/core.js`**

Replace the `constructor`, add a getter for `active`, and add `open`/`close`/`activeId`/`_applyPending`; route `update`/`render` through the top. Keep `boot`/`register`/`creditResult`/`exitActive` working.

```js
  constructor({ host, creditResult } = {}) {
    this.host = host;
    if (creditResult) this.creditResult = creditResult;
    /** @type {Map<string, import('./contract.js').MiniGame>} */
    this.registry = new Map();
    /** @type {import('./contract.js').MiniGame[]} the mode stack; base = home */
    this._stack = [];
    /** @type {{op:'open',id:string}|{op:'close',result?:any}|null} */
    this._pending = null;
  }

  /** The active (top-of-stack) minigame, or null before boot. */
  get active() { return this._stack[this._stack.length - 1] || null; }

  /** The id of the active minigame, or null. */
  activeId() { return this.active ? this.active.id : null; }
```

Change `boot(id)` to seed the stack:

```js
  boot(id) {
    const mg = this.registry.get(id);
    if (!mg) throw new Error(`Core.boot: no minigame registered as '${id}'`);
    this._stack = [mg];
    mg.enter(this.host);
    return mg;
  }
```

Add the stack verbs (place after `boot`):

```js
  /** Queue pushing minigame `id` onto the stack (applied next frame). */
  open(id) { this._pending = { op: 'open', id }; }

  /** Queue popping the top minigame, crediting `result` (applied next frame). */
  close(result) { this._pending = { op: 'close', result }; }

  /** Apply a queued open/close at the frame boundary. */
  _applyPending() {
    const p = this._pending;
    if (!p) return;
    this._pending = null;
    if (p.op === 'open') {
      const mg = this.registry.get(p.id);
      if (!mg) throw new Error(`Core.open: no minigame registered as '${p.id}'`);
      this._stack.push(mg);
      mg.enter(this.host);
    } else if (p.op === 'close') {
      if (this._stack.length <= 1) return;          // never pop the base
      const mg = this._stack.pop();
      const result = mg.exit ? mg.exit() : p.result;
      if (result) this.creditResult(result);
    }
  }
```

Change `update` and `render` to apply pending + drive the top:

```js
  update(dt) {
    this._applyPending();
    const a = this.active;
    if (a) a.update(dt);
  }

  render(ctx) {
    const a = this.active;
    if (a) a.render(ctx);
  }
```

(Leave `exitActive` as-is; it still operates on `this.active`.)

- [ ] **Step 4: Add `open`/`close` to the Host — `src/core/host.js`**

In `makeHost`, accept a `core` back-reference and expose forwarders. Add a parameter and two methods:

```js
export function makeHost({
  audio, input, particles, viewport, rng,
  economy, progression, achievements, world, core,
}) {
  const host = { audio, input, particles, viewport, rng, economy, progression, achievements };
  if (world !== undefined) host.world = world;
  // Mode switching: minigames request open/close through the Host, never the
  // Core directly (facade discipline). `core` is wired in after Core is built.
  host.open = (id) => core && core.open(id);
  host.close = (result) => core && core.close(result);
  host._bindCore = (c) => { core = c; };
  return host;
}
```

(The `_bindCore` setter resolves the Core↔Host chicken-and-egg: `main.js` calls `host._bindCore(core)` right after `new Core({ host })`.)

- [ ] **Step 5: Add `open`/`close` to the `Host` typedef — `src/core/contract.js`**

Add two properties inside the `Host` typedef block:

```js
 * @property {(id: string) => void} open   Push+activate a registered MiniGame by id.
 * @property {(result?: MiniGameResult) => void} close  Exit+pop the active MiniGame, resume the one beneath.
```

- [ ] **Step 6: Run tests + typecheck**

Run: `node tests/core/stack.test.mjs && npm run typecheck`
Expected: PASS (N checks); typecheck 0 errors.

- [ ] **Step 7: Run the full suite (no regressions in existing core tests)**

Run: `for f in $(find tests/core -name '*.test.mjs'); do node "$f" || exit 1; done`
Expected: all pass (existing `boot`/`active`/`creditResult` behavior preserved).

- [ ] **Step 8: Commit**

```bash
git add src/core/core.js src/core/host.js src/core/contract.js tests/core/stack.test.mjs
git commit -m "feat(core): minigame stack — host.open/close for mode switching (P9 seam)"
```

---

## Task 2: Engine — board generation + match detection

**Files:**
- Create: `src/minigames/match3/board.js`
- Test: `tests/minigames/match3/board.test.mjs`

**Interfaces:**
- Consumes: `mulberry32` from `src/stage/chunkgen.js` (tests only).
- Produces:
  - `makeBoard({ cols?, rows?, types?, rng? }): Board` — `Board = { cols, rows, types, rng, tiles: Tile[][] }`, `Tile = { type:number, special:null|'line'|'bomb' }`. Guarantees no initial matches AND ≥1 legal move.
  - `at(board, r, c): Tile|null`
  - `findRuns(board): {cells:[number,number][], axis:'row'|'col', type:number, len:number}[]`
  - `wouldMatch(board, r1,c1,r2,c2): boolean` — does swapping these two create a run (temp swap, restored).
  - `legalSwap(board, r1,c1,r2,c2): boolean` — adjacent AND `wouldMatch`.
  - `hasAnyMove(board): boolean`

- [ ] **Step 1: Write the failing test**

```js
// tests/minigames/match3/board.test.mjs
import { makeBoard, at, findRuns, wouldMatch, legalSwap, hasAnyMove } from '../../../src/minigames/match3/board.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

// helper: build a board from an explicit type grid (special=null)
function grid(types) {
  const rows = types.length, cols = types[0].length;
  return { cols, rows, types: 6, rng: mulberry32(1),
    tiles: types.map((row) => row.map((t) => ({ type: t, special: null }))) };
}

// generation: no initial matches, has a move
{
  const b = makeBoard({ cols: 8, rows: 8, rng: mulberry32(42) });
  check(b.cols === 8 && b.rows === 8, 'dims');
  check(findRuns(b).length === 0, 'no initial matches');
  check(hasAnyMove(b), 'generated board has a legal move');
}

// findRuns: horizontal + vertical
{
  const b = grid([
    [0, 0, 0, 1, 2],
    [3, 1, 4, 1, 2],
    [3, 5, 4, 1, 2],
    [3, 2, 4, 0, 5],
  ]);
  const runs = findRuns(b);
  // one horizontal run (row0 cols0-2) and two vertical (col0 rows1-3 type3; col4 rows0-2 type2; col3 rows0-2 type1)
  const has = (axis, type, len) => runs.some((r) => r.axis === axis && r.type === type && r.len === len);
  check(has('row', 0, 3), 'horizontal 000 run found');
  check(has('col', 3, 3), 'vertical type3 run found');
  check(has('col', 2, 3), 'vertical type2 run found');
  check(has('col', 1, 3), 'vertical type1 run found');
}

// wouldMatch + legalSwap + adjacency
{
  const b = grid([
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ]);
  // swapping (0,0)&(0,1) makes col: (0,1)->0 over (1,1)=0,(2,1)=1 no... test a real one:
  const b2 = grid([
    [0, 1, 2],
    [1, 0, 2],
    [0, 1, 2],   // col2 already 2,2,2 — but generation forbids; here it's a hand grid to test detection
  ]);
  check(findRuns(b2).some((r) => r.axis === 'col' && r.type === 2), 'hand grid detects col run');
  // adjacency: non-adjacent is never legal
  check(!legalSwap(b, 0, 0, 2, 2), 'non-adjacent swap illegal');
  // wouldMatch restores the board (no mutation)
  const before = JSON.stringify(b.tiles);
  wouldMatch(b, 0, 0, 0, 1);
  check(JSON.stringify(b.tiles) === before, 'wouldMatch does not mutate');
}

console.log(`ok board.test.mjs part1 (${pass} checks)`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/minigames/match3/board.test.mjs`
Expected: FAIL — module not found / export missing.

- [ ] **Step 3: Implement `src/minigames/match3/board.js` (generation + detection)**

```js
// @ts-check
// Pure match-3 engine — no canvas, no DOM, no timers. Deterministic via an
// injected rng, so the whole model is Node-unit-testable (like the Stage engine).
// The renderer/module animate the discrete resolution steps this returns.

/** @typedef {{ type:number, special:null|'line'|'bomb' }} Tile */
/** @typedef {{ cols:number, rows:number, types:number, rng:()=>number, tiles:(Tile|null)[][] }} Board */

export function at(board, r, c) {
  if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return null;
  return board.tiles[r][c];
}

const randType = (board) => (board.rng() * board.types) | 0;

/** All runs of ≥3 same-type tiles, horizontal and vertical. */
export function findRuns(board) {
  const runs = [];
  const { rows, cols, tiles } = board;
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const t = tiles[r][c];
      if (!t) { c++; continue; }
      let c2 = c + 1;
      while (c2 < cols && tiles[r][c2] && tiles[r][c2].type === t.type) c2++;
      if (c2 - c >= 3) { const cells = []; for (let x = c; x < c2; x++) cells.push([r, x]); runs.push({ cells, axis: 'row', type: t.type, len: c2 - c }); }
      c = c2;
    }
  }
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const t = tiles[r][c];
      if (!t) { r++; continue; }
      let r2 = r + 1;
      while (r2 < rows && tiles[r2][c] && tiles[r2][c].type === t.type) r2++;
      if (r2 - r >= 3) { const cells = []; for (let y = r; y < r2; y++) cells.push([y, c]); runs.push({ cells, axis: 'col', type: t.type, len: r2 - r }); }
      r = r2;
    }
  }
  return runs;
}

const adjacent = (r1, c1, r2, c2) => Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;

function swapCells(board, r1, c1, r2, c2) {
  const tmp = board.tiles[r1][c1];
  board.tiles[r1][c1] = board.tiles[r2][c2];
  board.tiles[r2][c2] = tmp;
}

/** Would swapping these two create a run? (temp swap, restored) */
export function wouldMatch(board, r1, c1, r2, c2) {
  swapCells(board, r1, c1, r2, c2);
  const ok = findRuns(board).length > 0;
  swapCells(board, r1, c1, r2, c2);
  return ok;
}

export function legalSwap(board, r1, c1, r2, c2) {
  return adjacent(r1, c1, r2, c2) && wouldMatch(board, r1, c1, r2, c2);
}

/** Any adjacent pair whose swap makes a match. */
export function hasAnyMove(board) {
  const { rows, cols } = board;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && wouldMatch(board, r, c, r, c + 1)) return true;
      if (r + 1 < rows && wouldMatch(board, r, c, r + 1, c)) return true;
    }
  }
  return false;
}

/** Fill the whole board with random tiles that have no run. */
function fillNoMatch(board) {
  const { rows, cols } = board;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let t, guard = 0;
      do {
        t = randType(board);
        // reject if it completes a run with the two tiles left/up
        const l1 = at(board, r, c - 1), l2 = at(board, r, c - 2);
        const u1 = at(board, r - 1, c), u2 = at(board, r - 2, c);
        const bad = (l1 && l2 && l1.type === t && l2.type === t) || (u1 && u2 && u1.type === t && u2.type === t);
        board.tiles[r][c] = { type: t, special: null };
        if (!bad || guard++ > 20) break;
      } while (true);
    }
  }
}

export function makeBoard({ cols = 8, rows = 8, types = 6, rng = Math.random } = {}) {
  const board = { cols, rows, types, rng, tiles: Array.from({ length: rows }, () => Array(cols).fill(null)) };
  let guard = 0;
  do { fillNoMatch(board); } while (!hasAnyMove(board) && guard++ < 50);
  return board;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/minigames/match3/board.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/minigames/match3/board.js tests/minigames/match3/board.test.mjs
git commit -m "feat(match3): engine — board generation + match detection"
```

---

## Task 3: Engine — swap resolution (clear → gravity → refill → cascade)

**Files:**
- Modify: `src/minigames/match3/board.js`
- Test: `tests/minigames/match3/resolve.test.mjs`

**Interfaces:**
- Produces:
  - `applySwap(board, r1,c1,r2,c2): { ok:boolean, steps:Step[], cleared:Record<number,number>, score:number }` where `Step` is one of:
    - `{ kind:'swap', a:[number,number], b:[number,number] }`
    - `{ kind:'clear', cells:[number,number][], spawns:{at:[number,number],special:'line'|'bomb',axis:'row'|'col'}[], counts:Record<number,number> }`
    - `{ kind:'fall', moves:{from:[number,number],to:[number,number]}[] }`
    - `{ kind:'refill', spawns:{at:[number,number],type:number}[] }`
    - `{ kind:'reshuffle' }`
  - `applyGravity(board): {from:[number,number],to:[number,number]}[]`
  - `refill(board): {at:[number,number],type:number}[]`

Note for this task: implement resolution **without** specials (spawns arrays stay empty; special activation is Task 4). A wasted swap (`!legalSwap`) returns `{ ok:false, steps:[] }` and does not mutate.

- [ ] **Step 1: Write the failing test**

```js
// tests/minigames/match3/resolve.test.mjs
import { applySwap, applyGravity, refill, findRuns } from '../../../src/minigames/match3/board.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
function grid(types, rng = () => 0) {
  return { cols: types[0].length, rows: types.length, types: 6, rng,
    tiles: types.map((row) => row.map((t) => ({ type: t, special: null }))) };
}

// wasted swap: no match → ok:false, no mutation
{
  const b = grid([[0, 1, 2], [3, 4, 5], [0, 1, 2]]);
  const before = JSON.stringify(b.tiles);
  const res = applySwap(b, 0, 0, 0, 1);
  check(res.ok === false, 'no-match swap is not ok');
  check(JSON.stringify(b.tiles) === before, 'wasted swap does not mutate');
}

// a swap that makes a 3-run clears, drops, refills, and reports counts
{
  // swapping (2,0)type0 with (2,1)type1 makes col1: rows0,1,2 = 1,1,1
  const b = grid([
    [1, 0, 2],
    [1, 0, 2],
    [0, 1, 2],   // col2 is 2,2,2 already — avoid: change to prevent pre-existing run
  ], () => 0.99);
  b.tiles[2][2] = { type: 5, special: null };   // break the col2 pre-run
  const res = applySwap(b, 2, 0, 2, 1);
  check(res.ok === true, 'match swap ok');
  check(res.steps[0].kind === 'swap', 'first step is swap');
  const clear = res.steps.find((s) => s.kind === 'clear');
  check(clear && clear.cells.length === 3, 'cleared a 3-run');
  check((res.cleared[1] || 0) === 3, 'counts: three type-1 cleared');
  check(res.steps.some((s) => s.kind === 'fall'), 'has a fall step');
  check(res.steps.some((s) => s.kind === 'refill'), 'has a refill step');
  check(findRuns(b).length === 0, 'board stable after resolution');
}

// gravity: a hole is filled from above
{
  const b = grid([[0], [1], [2]]);
  b.tiles[2][0] = null;   // bottom hole
  const moves = applyGravity(b);
  check(b.tiles[2][0].type === 1 && b.tiles[1][0].type === 0, 'tiles fell down one');
  check(b.tiles[0][0] === null, 'top is now empty');
  check(moves.length === 2, 'two tiles moved');
}

console.log(`ok resolve.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/minigames/match3/resolve.test.mjs`
Expected: FAIL — `applySwap`/`applyGravity`/`refill` not exported.

- [ ] **Step 3: Implement resolution in `src/minigames/match3/board.js`**

Append:

```js
/** Collapse each column downward into holes. Returns the moves for animation. */
export function applyGravity(board) {
  const moves = [];
  const { rows, cols, tiles } = board;
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (tiles[r][c]) {
        if (r !== write) { tiles[write][c] = tiles[r][c]; tiles[r][c] = null; moves.push({ from: [r, c], to: [write, c] }); }
        write--;
      }
    }
  }
  return moves;
}

/** Spawn new random tiles into the remaining holes (top of each column). */
export function refill(board) {
  const spawns = [];
  const { rows, cols, tiles } = board;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!tiles[r][c]) { const type = (board.rng() * board.types) | 0; tiles[r][c] = { type, special: null }; spawns.push({ at: [r, c], type }); }
    }
  }
  return spawns;
}

/** Swap two adjacent tiles and resolve to a stable board, returning ordered
 * animation steps, per-type cleared counts, and a score. No-op (ok:false) when
 * the swap makes no match. Specials are handled in a later pass (Task 4). */
export function applySwap(board, r1, c1, r2, c2) {
  if (!legalSwap(board, r1, c1, r2, c2)) return { ok: false, steps: [], cleared: {}, score: 0 };
  const steps = [];
  const cleared = {};
  let score = 0;
  swapCells(board, r1, c1, r2, c2);
  steps.push({ kind: 'swap', a: [r1, c1], b: [r2, c2] });
  let depth = 0;
  while (true) {
    const runs = findRuns(board);
    if (!runs.length) break;
    depth++;
    const key = (r, c) => r * board.cols + c;
    const set = new Set();
    for (const run of runs) for (const [r, c] of run.cells) set.add(key(r, c));
    // (special activation footprints expand `set` here in Task 4)
    const cells = [];
    const counts = {};
    for (const k of set) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      if (t) { cleared[t.type] = (cleared[t.type] || 0) + 1; counts[t.type] = (counts[t.type] || 0) + 1; cells.push([r, c]); board.tiles[r][c] = null; }
    }
    score += cells.length * 10 * depth;
    steps.push({ kind: 'clear', cells, spawns: [], counts });   // spawns filled in Task 4
    steps.push({ kind: 'fall', moves: applyGravity(board) });
    steps.push({ kind: 'refill', spawns: refill(board) });
  }
  if (!hasAnyMove(board)) { reshuffle(board); steps.push({ kind: 'reshuffle' }); }
  return { ok: true, steps, cleared, score };
}
```

Also add a minimal `reshuffle` (fully implemented in Task 4; a stub that re-fills is fine here so the module runs):

```js
/** Rearrange existing tiles into a legal, match-free board (dead-board recovery). */
export function reshuffle(board) {
  fillNoMatch(board);
  let guard = 0;
  while (!hasAnyMove(board) && guard++ < 50) fillNoMatch(board);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/minigames/match3/resolve.test.mjs && node tests/minigames/match3/board.test.mjs`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/minigames/match3/board.js tests/minigames/match3/resolve.test.mjs
git commit -m "feat(match3): engine — swap resolution (clear/gravity/refill/cascade)"
```

---

## Task 4: Engine — specials (line/bomb) + reshuffle + determinism

**Files:**
- Modify: `src/minigames/match3/board.js`
- Test: `tests/minigames/match3/specials.test.mjs`

**Interfaces:**
- Extends `applySwap`: a run of len ≥ 4 spawns a `line` special, len ≥ 5 spawns a `bomb`, placed at the swapped-into cell on the first resolution pass (else the run's middle cell). A cleared cell whose `special` is set **activates**: `line` adds its full row or column (per its axis) to the cleared set; `bomb` adds its 3×3 neighborhood. Determinism: same seed ⇒ identical steps + final grid.

- [ ] **Step 1: Write the failing test**

```js
// tests/minigames/match3/specials.test.mjs
import { applySwap, makeBoard } from '../../../src/minigames/match3/board.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
function grid(types, rng = () => 0.99) {
  return { cols: types[0].length, rows: types.length, types: 6, rng,
    tiles: types.map((row) => row.map((t) => ({ type: t, special: null }))) };
}

// match-4 spawns a line special at the swap cell
{
  // row0: 0 0 0 1 ; swapping (1,3)=0 up into (0,3) makes 0 0 0 0
  const b = grid([
    [0, 0, 0, 1, 2],
    [5, 4, 3, 0, 2],
    [4, 5, 3, 4, 5],
  ]);
  const res = applySwap(b, 0, 3, 1, 3);
  check(res.ok, 'match-4 swap ok');
  const clear = res.steps.find((s) => s.kind === 'clear');
  check(clear.spawns.length === 1 && clear.spawns[0].special === 'line', 'match-4 spawns a line special');
  const [sr, sc] = clear.spawns[0].at;
  check(b.tiles[sr][sc] && b.tiles[sr][sc].special === 'line', 'line special placed on the board');
}

// match-5 spawns a bomb
{
  const b = grid([
    [0, 0, 0, 0, 1],
    [5, 4, 3, 2, 0],
    [4, 5, 3, 4, 5],
  ]);
  const res = applySwap(b, 0, 4, 1, 4);   // brings a 0 into row0 → 0 0 0 0 0
  const clear = res.steps.find((s) => s.kind === 'clear');
  check(clear.spawns.some((s) => s.special === 'bomb'), 'match-5 spawns a bomb');
}

// determinism: same seed ⇒ identical resolution
{
  const a = makeBoard({ rng: mulberry32(7) });
  const b = makeBoard({ rng: mulberry32(7) });
  check(JSON.stringify(a.tiles) === JSON.stringify(b.tiles), 'same seed ⇒ same board');
}

console.log(`ok specials.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/minigames/match3/specials.test.mjs`
Expected: FAIL — spawns is empty (Task 3 left it `[]`).

- [ ] **Step 3: Implement specials in `applySwap`**

Replace the resolution `while` body in `applySwap` with the special-aware version:

```js
  let depth = 0;
  const swapCellsSet = new Set([r1 * board.cols + c1, r2 * board.cols + c2]);
  while (true) {
    const runs = findRuns(board);
    if (!runs.length) break;
    depth++;
    const key = (r, c) => r * board.cols + c;
    const set = new Set();
    for (const run of runs) for (const [r, c] of run.cells) set.add(key(r, c));

    // activate specials caught in the cleared set (one level of expansion)
    for (const k of Array.from(set)) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      if (!t || !t.special) continue;
      if (t.special === 'line') {
        for (let x = 0; x < board.cols; x++) set.add(key(r, x));
        for (let y = 0; y < board.rows; y++) set.add(key(y, c));
      } else if (t.special === 'bomb') {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const rr = r + dy, cc = c + dx;
          if (rr >= 0 && cc >= 0 && rr < board.rows && cc < board.cols) set.add(key(rr, cc));
        }
      }
    }

    // decide special spawns from runs of length ≥4 (before clearing)
    const spawns = [];
    for (const run of runs) {
      if (run.len < 4) continue;
      const special = run.len >= 5 ? 'bomb' : 'line';
      // prefer a swapped cell on the first pass, else the run's middle
      let at = run.cells.find(([r, c]) => swapCellsSet.has(key(r, c))) || run.cells[Math.floor(run.cells.length / 2)];
      spawns.push({ at, special, axis: run.axis, type: run.type });
    }

    // clear the set
    const cells = [];
    const counts = {};
    for (const k of set) {
      const r = (k / board.cols) | 0, c = k % board.cols;
      const t = board.tiles[r][c];
      if (t) { cleared[t.type] = (cleared[t.type] || 0) + 1; counts[t.type] = (counts[t.type] || 0) + 1; cells.push([r, c]); board.tiles[r][c] = null; }
    }
    score += cells.length * 10 * depth;

    // place spawned specials into their (now-empty) cells
    for (const s of spawns) { const [r, c] = s.at; board.tiles[r][c] = { type: s.type, special: s.special }; }

    steps.push({ kind: 'clear', cells, spawns: spawns.map(({ at, special, axis }) => ({ at, special, axis })), counts });
    steps.push({ kind: 'fall', moves: applyGravity(board) });
    steps.push({ kind: 'refill', spawns: refill(board) });
    swapCellsSet.clear();   // only the first pass uses swap-cell preference
  }
```

(Keep the `reshuffle` from Task 3.)

- [ ] **Step 4: Run to verify it passes**

Run: `for f in tests/minigames/match3/*.test.mjs; do node "$f" || exit 1; done`
Expected: PASS all engine tests.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck   # expect 0 errors (add // @ts-check already at top)
git add src/minigames/match3/board.js tests/minigames/match3/specials.test.mjs
git commit -m "feat(match3): engine — specials (line/bomb) + reshuffle + determinism"
```

---

## Task 5: Level table + helpers

**Files:**
- Create: `src/minigames/match3/levels.js`
- Test: `tests/minigames/match3/levels.test.mjs`

**Interfaces:**
- Produces:
  - `LEVELS: Level[]` — `Level = { id:number, goalType:'collect', targetTile:number, targetCount:number, moves:number, reward:number, tiles:number }`.
  - `getLevel(i): Level|null` (0-based; null past the end).
  - `leftoverBonus(moves:number): number` — salvage bonus for unused moves.
  - `TILE_NAMES: string[]` — display names indexed by tile type.

- [ ] **Step 1: Write the failing test**

```js
// tests/minigames/match3/levels.test.mjs
import { LEVELS, getLevel, leftoverBonus, TILE_NAMES } from '../../../src/minigames/match3/levels.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

check(LEVELS.length === 5, 'five levels in v1');
check(LEVELS.every((l) => l.goalType === 'collect'), 'all collect goals');
check(LEVELS.every((l) => l.targetTile >= 0 && l.targetTile < 6), 'valid target tiles');
check(LEVELS.every((l) => l.moves > 0 && l.targetCount > 0 && l.reward > 0), 'positive params');
check(getLevel(0).id === 1 && getLevel(5) === null, 'getLevel bounds');
check(leftoverBonus(0) === 0 && leftoverBonus(4) > 0, 'leftover bonus scales');
check(TILE_NAMES.length === 6, 'six tile names');
console.log(`ok levels.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/minigames/match3/levels.test.mjs`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/minigames/match3/levels.js`**

```js
// @ts-check
// Level data for Salvage Match. v1 goal type is 'collect N of a target tile
// within a move budget'; the schema leaves room for 'score'/'clear' goals later.
// All numbers are playtest-tunable; rewards sit in a dive's ballpark
// (SALVAGE.perReef=8, perRelic=15) so grinding the set ≈ a short dive.

/** @typedef {{ id:number, goalType:'collect', targetTile:number, targetCount:number, moves:number, reward:number, tiles:number }} Level */

// Tile type ids: 0 pearl · 1 gem · 2 coin · 3 shell · 4 starfish · 5 coral.
export const TILE_NAMES = ['Pearl', 'Gem', 'Coin', 'Shell', 'Starfish', 'Coral'];

/** @type {Level[]} */
export const LEVELS = [
  { id: 1, goalType: 'collect', targetTile: 0, targetCount: 12, moves: 20, reward: 6, tiles: 6 },
  { id: 2, goalType: 'collect', targetTile: 1, targetCount: 16, moves: 20, reward: 8, tiles: 6 },
  { id: 3, goalType: 'collect', targetTile: 2, targetCount: 20, moves: 18, reward: 10, tiles: 6 },
  { id: 4, goalType: 'collect', targetTile: 3, targetCount: 24, moves: 18, reward: 12, tiles: 6 },
  { id: 5, goalType: 'collect', targetTile: 0, targetCount: 30, moves: 16, reward: 15, tiles: 6 },
];

export function getLevel(i) { return LEVELS[i] || null; }

/** Salvage bonus for unused moves at level clear (1 per 2 leftover moves). */
export function leftoverBonus(moves) { return Math.max(0, Math.floor(moves / 2)); }
```

- [ ] **Step 4: Run + commit**

```bash
node tests/minigames/match3/levels.test.mjs && npm run typecheck
git add src/minigames/match3/levels.js tests/minigames/match3/levels.test.mjs
git commit -m "feat(match3): level table + helpers"
```

---

## Task 6: MiniGame module (lifecycle, objective, salvage credit)

Headless module logic — no canvas. The module owns the level/board/animation state, maps input to swaps, tracks objective progress, and credits salvage per cleared level. Rendering is delegated (Task 8).

**Files:**
- Create: `src/minigames/match3/index.js`
- Test: `tests/minigames/match3/seam.test.mjs`

**Interfaces:**
- Consumes: `board.js` (`makeBoard`, `applySwap`, `legalSwap`), `levels.js` (`getLevel`, `leftoverBonus`), `host` (`economy.earn`, `input`, `rng`, `close`).
- Produces:
  - `makeMatch3({ host }): MiniGame` with `id:'match3'`, `enter`, `update(dt)`, `render(ctx)`, `exit()`.
  - Internal (exposed for tests via the returned object): `phase` (`'intro'|'play'|'won'|'lost'`), `levelIndex`, `progress`, `movesLeft`, `board`, and a testable `trySwap(r1,c1,r2,c2)` and `_advance()` that don't depend on canvas.

- [ ] **Step 1: Write the failing test**

```js
// tests/minigames/match3/seam.test.mjs
import { makeMatch3 } from '../../../src/minigames/match3/index.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

function fakeHost() {
  const wallet = { salvage: 0 };
  return {
    rng: mulberry32(123),
    input: { pressed: () => false, consumeButton: () => false, isTouch: false, endFrame() {} },
    audio: { select() {}, ensure() {}, resume() {}, gasp() {} },
    particles: { bubble() {} },
    viewport: { W: 960, H: 600, WW: 960, WH: 600 },
    economy: { earn: ({ salvage = 0 }) => { wallet.salvage += salvage; return wallet.salvage; }, state: wallet },
    _closed: null,
    close(result) { this._closed = result; },
    _wallet: wallet,
  };
}

// entering starts at level 0 in the intro phase
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  check(mg.id === 'match3', 'id');
  mg.enter(host);
  check(mg.phase === 'intro' && mg.levelIndex === 0, 'enters at level 0 intro');
  check(mg.board && mg.board.cols === 8, 'board built');
  check(mg.movesLeft === 20, 'moves seeded from level 1');
}

// clearing the objective wins the level and credits salvage
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  mg.enter(host);
  mg.phase = 'play';
  // Force the objective met by driving progress directly, then advance.
  mg.progress = mg.level.targetCount;
  mg._checkGoal();
  check(mg.phase === 'won', 'goal met → won');
  check(host._wallet.salvage >= mg.level.reward, 'salvage credited for the win');
}

// running out of moves loses
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  mg.enter(host);
  mg.phase = 'play';
  mg.movesLeft = 0;
  mg.progress = 0;
  mg._checkGoal();
  check(mg.phase === 'lost', 'no moves + goal unmet → lost');
}

// exit returns a report-only result (salvage already credited per level)
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  mg.enter(host);
  const r = mg.exit();
  check(r && r.credited === true, 'exit result is report-only (credited)');
}

console.log(`ok seam.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/minigames/match3/seam.test.mjs`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/minigames/match3/index.js`**

```js
// @ts-check
// Salvage Match — a match-3 MiniGame (Platform Phase 9). Bring-your-own-engine:
// it ignores host.world and runs its own board update/render, feeding the ONE
// shared economy via host.economy.earn({ salvage }). Menu-launched now (via the
// Core minigame stack, host.open('match3')); designed self-contained so the same
// module drops into a nested reef special-level later. See docs/superpowers/specs.

import { makeBoard, applySwap, legalSwap } from './board.js';
import { getLevel, leftoverBonus } from './levels.js';
import { drawMatch3 } from '../../render/match3.js';

/**
 * @param {{ host: import('../../core/contract.js').Host }} deps
 * @returns {import('../../core/contract.js').MiniGame}
 */
export function makeMatch3({ host }) {
  const mod = {
    id: 'match3',

    // --- state (armed by enter/_loadLevel) ---
    phase: 'intro',            // 'intro' | 'play' | 'won' | 'lost'
    levelIndex: 0,
    level: /** @type {any} */ (null),
    board: /** @type {any} */ (null),
    progress: 0,               // count of target tiles collected this level
    movesLeft: 0,
    score: 0,
    introT: 0, resultT: 0,     // phase timers
    anim: null,                // active resolution animation (steps + cursor + t)
    cursor: { r: 0, c: 0 }, sel: null,   // keyboard/gamepad cursor + first-picked cell

    enter() {
      this.levelIndex = 0;
      this._loadLevel(0);
    },

    _loadLevel(i) {
      const lv = getLevel(i);
      if (!lv) { host.close(this.exit()); return; }   // past the last level → back to menu
      this.levelIndex = i;
      this.level = lv;
      this.board = makeBoard({ cols: 8, rows: 8, types: lv.tiles, rng: host.rng });
      this.progress = 0;
      this.movesLeft = lv.moves;
      this.phase = 'intro';
      this.introT = 0; this.resultT = 0;
      this.anim = null; this.sel = null; this.cursor = { r: 0, c: 0 };
    },

    // Attempt a swap; on success queue its resolution animation, spend a move,
    // and fold cleared target-tiles into progress. Returns true if it matched.
    trySwap(r1, c1, r2, c2) {
      if (this.phase !== 'play' || this.anim) return false;
      if (!legalSwap(this.board, r1, c1, r2, c2)) { host.audio.select && host.audio.select(); return false; }
      const res = applySwap(this.board, r1, c1, r2, c2);
      if (!res.ok) return false;
      this.movesLeft -= 1;
      this.score += res.score;
      this.progress += res.cleared[this.level.targetTile] || 0;
      this.anim = { steps: res.steps, i: 0, t: 0 };
      host.audio.select && host.audio.select();
      return true;
    },

    // Win when the objective is met; lose when moves run out first.
    _checkGoal() {
      if (this.phase !== 'play') return;
      if (this.progress >= this.level.targetCount) {
        this.phase = 'won'; this.resultT = 0;
        const bonus = leftoverBonus(this.movesLeft);
        host.economy.earn({ salvage: this.level.reward + bonus });   // per-level credit (banks on quit)
      } else if (this.movesLeft <= 0) {
        this.phase = 'lost'; this.resultT = 0;
      }
    },

    _advance() {
      // called after an animation completes to settle the board + re-check goal
      this.anim = null;
      this._checkGoal();
    },

    update(dt) {
      const input = host.input;
      // Advance any running resolution animation (renderer reads anim.i / anim.t).
      if (this.anim) {
        this.anim.t += dt;
        if (this.anim.t >= 0.14) { this.anim.t = 0; this.anim.i++; }
        if (this.anim.i >= this.anim.steps.length) this._advance();
      }
      // Phase transitions on confirm/back.
      const confirm = input.pressed('confirm') || input.consumeButton('confirm') || input.pressed('match3');
      const back = input.pressed('back') || input.consumeButton('back') || input.pressed('pause');
      if (back) { host.close(this.exit()); input.endFrame && input.endFrame(); return; }
      if (this.phase === 'intro') { this.introT += dt; if (confirm || this.introT > 1.2) this.phase = 'play'; }
      else if (this.phase === 'play') { this._handlePlayInput(input); }
      else if (this.phase === 'won') { this.resultT += dt; if (confirm) this._loadLevel(this.levelIndex + 1); }
      else if (this.phase === 'lost') { this.resultT += dt; if (confirm) this._loadLevel(this.levelIndex); }
      input.endFrame && input.endFrame();
    },

    // Cursor + swap input (keyboard/gamepad); mouse/touch swaps are injected by
    // the renderer/host hit-testing calling trySwap directly (Task 8/9).
    _handlePlayInput(input) {
      if (this.anim) return;
      const move = (dr, dc) => { this.cursor.r = Math.max(0, Math.min(this.board.rows - 1, this.cursor.r + dr)); this.cursor.c = Math.max(0, Math.min(this.board.cols - 1, this.cursor.c + dc)); };
      if (input.pressed('up')) move(-1, 0);
      else if (input.pressed('down')) move(1, 0);
      else if (input.pressed('left')) move(0, -1);
      else if (input.pressed('right')) move(0, 1);
      if (input.pressed('confirm') || input.consumeButton('confirm')) {
        if (!this.sel) this.sel = { r: this.cursor.r, c: this.cursor.c };
        else { this.trySwap(this.sel.r, this.sel.c, this.cursor.r, this.cursor.c); this.sel = null; }
      }
    },

    render(ctx) { drawMatch3(ctx, this, host); },

    exit() { return { outcome: this.phase === 'won' ? 'won' : 'bailed', credited: true }; },
  };
  return mod;
}
```

(`applySwap`/`legalSwap` and per-level crediting make the seam test pass. `drawMatch3` is created in Task 8; the import resolves once that file exists — write Task 8 before running any browser boot, but the headless seam test never calls `render`, so it passes now if `render/match3.js` exists as at least an empty stub. Create the stub in Step 3b below.)

- [ ] **Step 3b: Create a render stub so the import resolves**

```js
// src/render/match3.js  (stub — full renderer is Task 8)
// @ts-check
export function drawMatch3(ctx, mod, host) { /* Task 8 */ }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/minigames/match3/seam.test.mjs && npm run typecheck`
Expected: PASS; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/minigames/match3/index.js src/render/match3.js tests/minigames/match3/seam.test.mjs
git commit -m "feat(match3): MiniGame module — lifecycle, objective, per-level salvage credit"
```

---

## Task 7: Input actions (`confirm`/`back`/`match3`)

Add the action names the module + menu use to `KEYMAP`. Confirm/back likely already exist under other names — reuse or alias; only add what's missing.

**Files:**
- Modify: `src/input.js`
- Test: `tests/game/match3-input.test.mjs`

**Interfaces:**
- Produces: `KEYMAP.match3` (key **M**), `KEYMAP.back` (Escape/Backspace), and a `confirm` alias if not present (Space/Enter). The reef and match3 read these via `input.pressed(...)`.

- [ ] **Step 1: Read the current KEYMAP**

Run: `grep -n "KEYMAP" src/input.js` then open the block. Note existing action names (`confirm`, `pause`, `up/down/left/right`, `badges`, `drydock`, etc.).

- [ ] **Step 2: Write the failing test**

```js
// tests/game/match3-input.test.mjs
import { KEYMAP } from '../../src/input.js';
let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
check(Array.isArray(KEYMAP.match3) && KEYMAP.match3.includes('KeyM'), 'M opens match3');
check(Array.isArray(KEYMAP.back), 'back action exists');
check(Array.isArray(KEYMAP.confirm), 'confirm action exists');
console.log(`ok match3-input.test.mjs (${pass} checks)`);
```

(If `KEYMAP` is not currently exported, add `export` to its declaration.)

- [ ] **Step 3: Run to verify it fails**

Run: `node tests/game/match3-input.test.mjs`
Expected: FAIL — `KEYMAP.match3` undefined (and/or KEYMAP not exported).

- [ ] **Step 4: Add the bindings in `src/input.js`**

Add to the `KEYMAP` object (adapt to the existing shape; gamepad button indices follow the file's existing convention):

```js
  match3: ['KeyM'],
  back: ['Escape', 'Backspace'],
  // confirm: ['Space', 'Enter'],   // add only if not already present
```

- [ ] **Step 5: Run + commit**

```bash
node tests/game/match3-input.test.mjs && npm run typecheck
git add src/input.js tests/game/match3-input.test.mjs
git commit -m "feat(input): match3/back/confirm action bindings"
```

---

## Task 8: Renderer (`render/match3.js`) — browser-verified

Fill in the stub with the full canvas renderer. This is **browser-verified**, not unit-tested (canvas art is tuned visually). Keep it a pure draw function that reads the module state.

**Files:**
- Modify: `src/render/match3.js`

**Interfaces:**
- Consumes: `mod` (the match3 module: `phase`, `board`, `level`, `progress`, `movesLeft`, `score`, `anim`, `cursor`, `sel`), `host` (`viewport`, `particles`), chrome helpers from `src/render/chrome.js`, tile sprites from `src/render/sprites.js`/`props.js`, `PAL` from `src/config.js`.
- Produces: `drawMatch3(ctx, mod, host)`; plus `boardHitTest(mod, host, x, y): {r,c}|null` for mouse/touch (Task 9).

- [ ] **Step 1: Implement `drawMatch3` + `boardHitTest`**

```js
// @ts-check
// Canvas renderer for Salvage Match. Pure draw from module state; browser-tuned.
import { PAL } from '../config.js';
import { text as _text, panel as _panel, overlay as _overlay } from './chrome.js';
import { TILE_NAMES } from '../minigames/match3/levels.js';

// Board geometry: a centered square grid sized to the live viewport.
function geom(mod, host) {
  const { W, H } = host.viewport;
  const n = mod.board ? mod.board.cols : 8;
  const size = Math.min(W, H) * 0.72;
  const cell = Math.floor(size / n);
  const x0 = Math.round((W - cell * n) / 2);
  const y0 = Math.round((H - cell * n) / 2) + 20;
  return { cell, x0, y0, n };
}

const TILE_COLORS = ['#eaf6ff', '#8be9ff', '#ffd76b', '#ffb59a', '#ffe08a', '#b98cff']; // pearl/gem/coin/shell/starfish/coral

export function boardHitTest(mod, host, x, y) {
  if (!mod.board) return null;
  const { cell, x0, y0, n } = geom(mod, host);
  const c = Math.floor((x - x0) / cell), r = Math.floor((y - y0) / cell);
  if (r < 0 || c < 0 || r >= n || c >= n) return null;
  return { r, c };
}

function drawTile(ctx, cx, cy, cell, tile) {
  if (!tile) return;
  const r = cell * 0.38;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = TILE_COLORS[tile.type] || '#fff'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
  if (tile.special === 'line') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }
  else if (tile.special === 'bomb') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
}

export function drawMatch3(ctx, mod, host) {
  const { W, H } = host.viewport;
  const { cell, x0, y0, n } = geom(mod, host);

  // dim underwater backdrop panel
  ctx.fillStyle = 'rgba(4,16,30,0.9)'; ctx.fillRect(0, 0, W, H);
  _panel(ctx, x0 - 12, y0 - 12, cell * n + 24, cell * n + 24);

  // grid + tiles (animation: nudge/fade based on mod.anim step — kept simple v1)
  if (mod.board) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cx = x0 + c * cell + cell / 2, cy = y0 + r * cell + cell / 2;
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
      drawTile(ctx, cx, cy, cell, mod.board.tiles[r][c]);
    }
    // cursor + selection (keyboard/gamepad)
    const box = (cc, rr, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x0 + cc * cell + 2, y0 + rr * cell + 2, cell - 4, cell - 4); };
    box(mod.cursor.c, mod.cursor.r, PAL.gold);
    if (mod.sel) box(mod.sel.c, mod.sel.r, PAL.glow);
  }

  // HUD: objective + moves + score
  const lv = mod.level;
  if (lv) {
    _text(ctx, `SALVAGE MATCH — Level ${lv.id}`, W / 2, 40, 22, PAL.glow, 'center', 'middle', true);
    _text(ctx, `Collect ${TILE_NAMES[lv.targetTile]}: ${Math.min(mod.progress, lv.targetCount)}/${lv.targetCount}`, W / 2, y0 - 34, 18, PAL.gold, 'center', 'middle');
    _text(ctx, `Moves ${mod.movesLeft}`, x0, y0 + cell * n + 30, 16, PAL.hudText, 'left', 'middle');
    _text(ctx, `Score ${mod.score}`, x0 + cell * n, y0 + cell * n + 30, 16, PAL.hudText, 'right', 'middle');
    _text(ctx, host.input.isTouch ? 'Tap two tiles to swap · ✕ to quit' : 'Arrows + Space to swap · Esc to quit', W / 2, H - 24, 12, '#9fc6e0', 'center', 'middle');
  }

  // phase overlays
  if (mod.phase === 'intro') { _overlay(ctx, W, H); _text(ctx, `Level ${lv.id}`, W / 2, H / 2 - 30, 40, PAL.glow, 'center', 'middle', true); _text(ctx, `Collect ${lv.targetCount} ${TILE_NAMES[lv.targetTile]} in ${lv.moves} moves`, W / 2, H / 2 + 16, 18, PAL.hudText, 'center', 'middle'); }
  else if (mod.phase === 'won') { _overlay(ctx, W, H); _text(ctx, 'LEVEL CLEARED', W / 2, H / 2 - 20, 40, PAL.gold, 'center', 'middle', true); _text(ctx, `⚙ SALVAGE +${lv.reward}  ·  ${host.economy.state.salvage} banked`, W / 2, H / 2 + 24, 18, PAL.gold, 'center', 'middle'); _text(ctx, 'Space: next level', W / 2, H / 2 + 56, 14, '#9fc6e0', 'center', 'middle'); }
  else if (mod.phase === 'lost') { _overlay(ctx, W, H); _text(ctx, 'OUT OF MOVES', W / 2, H / 2 - 20, 40, PAL.danger, 'center', 'middle', true); _text(ctx, 'Space: retry  ·  Esc: quit', W / 2, H / 2 + 24, 14, '#9fc6e0', 'center', 'middle'); }
}
```

(Adapt `text`/`panel`/`overlay` import names to the real exports in `src/render/chrome.js` — check them first with `grep -n "export" src/render/chrome.js`. If they are named differently, use the actual names.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/match3.js
git commit -m "feat(match3): canvas renderer (board, tiles, HUD, phase overlays)"
```

---

## Task 9: Menu integration + input gating + touch/mouse swaps

Wire the launch: register the minigame, add the menu button, handle the action, gate legacy input, and route mouse/touch swaps into the board.

**Files:**
- Modify: `src/main.js`
- Modify: `src/game.js`
- Modify: `src/minigames/reef/index.js`

**Interfaces:**
- Consumes: `makeMatch3`, `boardHitTest`, `host.open`, `core.activeId()`.

- [ ] **Step 1: Register match3 + bind core in `src/main.js`**

After `const core = new Core({ host });` and the legacy registration, add:

```js
host._bindCore(core);   // resolve the Core↔Host chain for host.open/close
import { makeMatch3 } from './minigames/match3/index.js';   // (add to the import block at top)
const match3 = makeMatch3({ host });
core.register(match3);
```

- [ ] **Step 2: Gate legacy-bound input handlers in `src/main.js`**

The `action()` / mousedown / touchstart handlers call `game.onAction()` (starts a dive on the menu). Guard them so they only drive the legacy when it is top-of-stack; when match3 is on top, route board swaps instead.

```js
const isLegacyTop = () => core.activeId() === 'legacy';

function action() { if (!isLegacyTop()) return; audio.ensure(); audio.resume(); game.onAction(); }
```

In the `mousedown`/`touchstart` handlers, wrap the `game.onAction()` fallback in `if (isLegacyTop())`, and add a match3 branch for swaps:

```js
canvas.addEventListener('mousedown', (e) => {
  audio.ensure(); audio.resume();
  const hit = input.hitButtonAt(e.clientX, e.clientY);
  if (hit) { input.pressButton(hit); return; }
  if (core.activeId() === 'match3') { handleMatch3Pointer(e.clientX, e.clientY); return; }
  if (isLegacyTop() && game.state !== 'playing') game.onAction();
});
```

Add `handleMatch3Pointer` (translate client→canvas logical coords using the existing canvas scaling the file already computes for input; reuse `input`'s coordinate mapping if present, else the same math as `hitButtonAt`):

```js
import { boardHitTest } from './render/match3.js';   // (top import block)
let m3sel = null;
function handleMatch3Pointer(clientX, clientY) {
  const p = input.toLogical ? input.toLogical(clientX, clientY) : { x: clientX, y: clientY };
  const cell = boardHitTest(match3, host, p.x, p.y);
  if (match3.phase !== 'play') { match3.update && (match3._pointerConfirm = true); return; }
  if (!cell) { m3sel = null; return; }
  if (!m3sel) { m3sel = cell; match3.sel = cell; }
  else { match3.trySwap(m3sel.r, m3sel.c, cell.r, cell.c); m3sel = null; match3.sel = null; }
}
```

(If `input` exposes no client→logical helper, add a small `toLogical(x,y)` to `src/input.js` computing the same transform used by `hitButtonAt`, and use it here and there. Verify the transform against a real click in the browser step.)

- [ ] **Step 3: Add the menu button in `src/game.js` (`_menuButtons`)**

Extend the button bar to include a fourth button, keeping coordinates in sync with the touch hit-rects. Change `xs` to four entries and add the render + a fourth touch rect. Example (adapt to the real layout constants):

```js
  _menuButtons(cx) {
    const ctx = this.ctx, y = 516, w = 118, h = 34;
    const xs = [cx - 246, cx - 122, cx + 2, cx + 126];   // help, drydock, badges, match3
    ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.7)'; ctx.strokeStyle = 'rgba(150,200,240,0.4)'; ctx.lineWidth = 1;
    for (const x of xs) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    this._text('❔ HELP (H)', xs[0] + w / 2, y + h / 2, 12, PAL.hudText, 'center', 'middle', true);
    this._text('🛠 DRY DOCK (R)', xs[1] + w / 2, y + h / 2, 11, PAL.gold, 'center', 'middle', true);
    this._text('🎖 BADGES (B)', xs[2] + w / 2, y + h / 2, 11, PAL.glow, 'center', 'middle', true);
    this._text('⚓ SALVAGE MATCH (M)', xs[3] + w / 2, y + h / 2, 10, PAL.gold, 'center', 'middle', true);
  }
```

Then register the fourth hit-rect in `_syncTouchButtons` (find where help/drydock/badges rects are registered and add a `match3` button with the matching `xs[3], y, w, h`). Grep: `grep -n "_syncTouchButtons\|drydock\|badges" src/game.js`.

- [ ] **Step 4: Handle the action in `src/minigames/reef/index.js`**

In the reef's menu input polling (near the `badges`/`drydock` handlers, ~L1194), add: when at the menu/gameover and the `match3` action fires, open the minigame.

```js
    if ((this._shell.state === 'menu' || this._shell.state === 'gameover') && (this.input.pressed('match3') || this.input.consumeButton('match3'))) { this.host.open('match3'); this.input.endFrame(); return; }
```

(Confirm the reef holds `this.host` — from Task-8 P8 work it does; else use `this._host`/the stored host reference. Grep: `grep -n "this.host\|this._host" src/minigames/reef/index.js`.)

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && for f in $(find tests -name '*.test.mjs'); do node "$f" || exit 1; done`
Expected: 0 type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.js src/game.js src/minigames/reef/index.js src/input.js
git commit -m "feat(match3): menu launch + input gating + pointer swaps"
```

---

## Task 10: Browser smoke, BUILD bump, ship

**Files:**
- Modify: `src/version.js`

- [ ] **Step 1: Bump the build marker**

Change `src/version.js`: `export const BUILD = 'platform-p9';`

- [ ] **Step 2: Browser smoke on a FRESH port**

Start the no-cache server on a new port (ES-module cache gotcha). Temporarily add `window.__game/__core/__match3/__input` in `main.js` for driving (REMOVE before commit). Verify:
1. Boot → menu, zero console errors, banner shows `platform-p9`.
2. Press **M** (or tap ⚓ SALVAGE MATCH) → match3 opens (intro → play); board renders; HUD shows objective + moves.
3. Make a valid swap (arrows+Space, and a mouse click pair) → tiles clear/cascade; progress increments; moves decrement.
4. Force/reach a level win → "LEVEL CLEARED", `⚙ SALVAGE +N`, `host.economy.state.salvage` increased and banked (check `localStorage`); Space → next level.
5. Press **Esc** / ✕ → returns to the menu; `core.activeId()==='legacy'`; the menu's salvage/best reflects the new balance.
6. From the menu, press Space → a **normal dive** still starts (input gating correct); play a few seconds, zero console errors.
7. Re-verify the other shell screens (dry dock, badges, help, game-over) still open cleanly (P6/P7 lesson).

- [ ] **Step 3: Remove temp instrumentation; confirm gone**

Run: `grep -n "__game\|__core\|__match3\|__input\|window.__" src/main.js` → expect nothing.

- [ ] **Step 4: Typecheck + full suite (final gate)**

Run: `npm run typecheck && for f in $(find tests -name '*.test.mjs'); do node "$f" || exit 1; done`
Expected: 0 errors; all pass.

- [ ] **Step 5: Commit + merge + push**

```bash
git add src/version.js
git commit -m "chore: BUILD=platform-p9 (Salvage Match minigame)"
git checkout main
git merge --no-ff feat/platform-p9-match3 -m "Merge platform P9: Salvage Match match-3 minigame (menu-launched, earns salvage; Core minigame stack)"
git push origin main
```

- [ ] **Step 6: Update docs + memory**

Mark Phase 9 shipped in `docs/platform/migration-plan.md`; update the `platform-migration` memory with the P9 result (Core stack seam, match3 module, BUILD=platform-p9) and note the deferred follow-ups (nested reef special-level embedding; blocker/score objective types; cross-reload progress).

---

## Self-Review

**Spec coverage:**
- §2 architecture (engine/data/renderer/module) → Tasks 2–6, 8. ✓
- §3 engine (generation, detection, resolution, specials, reshuffle, determinism) → Tasks 2–4. ✓
- §4 levels/objectives + reward/leftover bonus → Task 5, credit in Task 6. ✓
- §5 module lifecycle/state machine/credit → Task 6. ✓
- §6 renderer → Task 8. ✓
- §7 input parity → Task 7 (bindings) + Task 6 (keyboard) + Task 9 (mouse/touch). ✓
- §8 Core stack + host.open/close → Task 1. ✓
- §9 menu item + input gating → Task 9. ✓
- §10 economy tie-in (per-level credit) → Task 6. ✓
- §11 testing → Tasks 1–6 unit tests + Task 10 browser smoke. ✓
- §12 non-goals honored (no blockers/combos/nesting/persistence/build). ✓
- §13 decisions: per-level credit (Task 6), no persistence (Task 6 `_loadLevel` resets), menu bar extended to 4 (Task 9). ✓

**Placeholder scan:** engine/module/levels/Core tasks carry full code. The renderer (Task 8) and menu wiring (Task 9) carry concrete code marked *adapt to real export/layout names* — these are browser-verified per the spec; each names the exact grep to confirm the real symbols. No "TODO/handle edge cases" placeholders.

**Type consistency:** `makeBoard/applySwap/legalSwap/findRuns/applyGravity/refill/reshuffle` (board.js) used consistently in Tasks 2–4, 6. `getLevel/leftoverBonus/LEVELS/TILE_NAMES` (levels.js) consistent in Tasks 5–6, 8. `makeMatch3` returns `{id,enter,update,render,exit}` + test-exposed `phase/level/board/progress/movesLeft/trySwap/_checkGoal/_loadLevel` — consistent across Task 6 test + Task 9 pointer wiring. `Core.open/close/activeId/active`, `host.open/close/_bindCore` consistent across Tasks 1, 9. Step/Tile shapes match between engine (Task 3/4) and renderer (Task 8).
