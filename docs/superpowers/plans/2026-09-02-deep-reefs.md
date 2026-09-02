# Deep Reefs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make depth the game's difficulty and reward axis — a world that steps
from a 411 m floor to 1800 m across four tiers, two fixed danger depths, a
tiered Depth Valve that buys the right to cross them, and treasure that grows
and migrates downward to pay for it.

**Architecture:** `WORLD.WW`/`WORLD.WH` become live (mirroring the existing
`setViewport` pattern) and are set once per reef from a four-row tier table. All
new behaviour is expressed as **pure functions in `src/config.js`** — world size,
air depth term, crush depth, treasure weighting, chest value — so every balance
number is Node-testable without a canvas. The reef consumes them; the depth
gauge, the klaxon and the Dry Dock are thin consumers on top.

**Tech Stack:** Plain ES modules, no build step, no bundler, no dependencies.
Tests are plain Node scripts (`node tests/**/x.test.mjs`). Types via
`tsc --noEmit` with per-file `// @ts-check` opt-in.

**Spec:** `docs/superpowers/specs/2026-09-02-deep-reefs-design.md` — read its
"Locked decisions" section before starting. It is the only record of why several
cheaper designs were rejected.

## Global Constraints

- **No build step.** Never add a bundler, transpiler, or npm runtime dependency.
- **Never capture `WORLD.WW`/`WORLD.WH`/`W`/`H` at module scope.** Read
  `WORLD.WW` live at every use. This is the single most likely way to break this
  feature subtly. `OPEN_BAND` and `CELL` are genuinely constant and may stay
  destructured.
- **Three incompatible test assertion styles exist.** Copy the style of the file
  you are editing; mixing the two `check` forms silently always-passes.
  - name-first `check(name, cond)` — all of `tests/game/`, `tests/render/`, `tests/audio/`
  - cond-first `check(cond, msg)` — `tests/meta/`, `tests/core/`, `tests/minigames/`
  - `assert(name, cond)` + `done()` — `tests/stage/`, `tests/creatures/`
- **Every test file prints its own summary line** and exits non-zero on failure.
- **Persisted keys are frozen**: `deepdescent.badges.v1`, `.stats.v1`,
  `.salvage.v2`, `.progress.v1`. Add fields inside them; never rename a key or a
  goal id.
- **New stat keys must be namespaced** `legacy:<key>`. Bare names are rejected by
  `tests/core/grandfathered-ids.test.mjs`. Never add to
  `src/core/grandfathered-ids.js` — it throws.
- **Reefs 1–3 must be byte-identical to `main`.** This is the regression anchor
  for the whole plan and is asserted in Task 2.
- **`npm run typecheck` must exit 0** after every task.
- **Run the full suite after every task**:
  `for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done`
- **Do not push to `main`.** Every push to `main` deploys to the live site
  automatically. Work on branch `feat/deep-reefs`; deploy is Task 14 only.
- **Rollback point:** tag `baseline/v1.0-pre-deep-reefs`.

---

### Task 1: Performance spike — is a tier-4 cave affordable?

**This task gates the whole plan.** Tier 4 is 24,160 cave cells against today's
3,220 (7.5×). If generation blows past ~1.5 s or the first frame stutters, the
tier table needs a coarser `CELL` at depth and the spec needs revisiting *before*
any gameplay work is written.

**Files:**
- Create: `tests/game/cave-perf.bench.mjs` (a benchmark, deliberately NOT named
  `.test.mjs` so the suite runner does not pick it up)

**Interfaces:**
- Consumes: nothing.
- Produces: a go/no-go decision. No code other tasks depend on.

- [ ] **Step 1: Write the benchmark**

`Cave`'s constructor touches `document.createElement`, so it needs the same DOM
stub the other reef-side tests use. Create `tests/game/cave-perf.bench.mjs`:

```js
// Benchmark, not a test — measures Cave generation at each Deep Reefs tier size.
// Named .bench.mjs so the test runner (find tests -name "*.test.mjs") skips it.
// Run: node tests/game/cave-perf.bench.mjs
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      fillRect() {}, clearRect() {}, save() {}, restore() {}, beginPath() {},
      arc() {}, fill() {}, stroke() {}, drawImage() {}, translate() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
      textAlign: '', textBaseline: '',
    }),
  }),
};

const { WORLD } = await import('../../src/config.js');
const { Cave } = await import('../../src/systems/cave.js');

// The four tier sizes from the spec, with the reef number each is measured at.
const TIERS = [
  { name: 'tier 1 (reef 1)',  reef: 1,  WW: 2760, WH: 4200 },
  { name: 'tier 2 (reef 10)', reef: 10, WW: 3600, WH: 7090 },
  { name: 'tier 3 (reef 20)', reef: 20, WW: 4200, WH: 11590 },
  { name: 'tier 4 (reef 40)', reef: 40, WW: 4800, WH: 18090 },
];

for (const t of TIERS) {
  WORLD.WW = t.WW; WORLD.WH = t.WH;
  const cells = Math.ceil(t.WW / WORLD.CELL) * Math.ceil(t.WH / WORLD.CELL);
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    new Cave('reef', t.reef);
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  console.log(`${t.name.padEnd(18)} ${String(cells).padStart(7)} cells   median ${runs[2].toFixed(0)} ms   worst ${runs[4].toFixed(0)} ms`);
}
```

- [ ] **Step 2: Run it and record the numbers**

Run: `node tests/game/cave-perf.bench.mjs`

Note this reads `WORLD.WW` **live** only if `src/systems/cave.js:7` has already
been changed. It has not yet — so for this spike, temporarily verify by editing
`cave.js:7` to `const { CELL, OPEN_BAND } = WORLD;` and using `WORLD.WW` /
`WORLD.WH` inside the constructor. That edit is Task 2's work; make it here,
keep it, and Task 2 will build on it.

- [ ] **Step 3: Decide**

Record the four numbers in the commit message.

- **Tier 4 median under ~800 ms** → proceed to Task 2 unchanged.
- **800 ms – 2 s** → proceed, but add a "generating…" frame to Task 3's
  `_generateWorld` and note it.
- **Over 2 s** → **STOP and report.** The tier table needs a larger `CELL` at
  tiers 3–4 (e.g. 80 px), which changes the spec's cave-density assumptions.
  Do not start Task 2.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/deep-reefs
git add tests/game/cave-perf.bench.mjs src/systems/cave.js
git commit -m "perf: benchmark Cave generation at all four Deep Reefs tier sizes

Tier 4 is 24,160 cells against today's 3,220. Numbers: <paste the four lines>."
```

---

### Task 2: Live world size — the tier table and the three module-scope captures

**Files:**
- Modify: `src/config.js` (after the `WORLD` const, ~line 13)
- Modify: `src/game.js:26`
- Modify: `src/minigames/reef/index.js:64`
- Modify: `src/systems/cave.js:7` (already partly done in Task 1)
- Test: `tests/game/world-tiers.test.mjs` (create; **name-first** `check(name, cond)`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WORLD_TIERS: Array<{minReef:number, WW:number, WH:number}>`
  - `worldTier(reef: number) => number` (0-based tier index)
  - `worldSize(reef: number) => { WW: number, WH: number }`
  - `setWorldSize(reef: number) => void` (assigns `WORLD.WW` / `WORLD.WH`)
  - `tier1FloorM: number` (411 — used by Task 11's value functions)

- [ ] **Step 1: Write the failing test**

Create `tests/game/world-tiers.test.mjs`:

```js
// Deep Reefs world tiers: the world steps through four fixed sizes at reefs
// 4, 11 and 21, and stops growing at 40. Tier 1 must be byte-identical to the
// pre-Deep-Reefs world (2760 x 4200) — that is the regression anchor for the
// whole feature. Run: node tests/game/world-tiers.test.mjs

import { WORLD, WORLD_TIERS, worldTier, worldSize, setWorldSize, tier1FloorM } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- tier boundaries: the whole point of a stepped table -------------------
check('reef 1 is tier 0',   worldTier(1) === 0);
check('reef 3 is tier 0',   worldTier(3) === 0);
check('reef 4 steps to tier 1',  worldTier(4) === 1);
check('reef 10 is still tier 1', worldTier(10) === 1);
check('reef 11 steps to tier 2', worldTier(11) === 2);
check('reef 20 is still tier 2', worldTier(20) === 2);
check('reef 21 steps to tier 3', worldTier(21) === 3);
check('reef 40 is tier 3',       worldTier(40) === 3);
check('reef 41 stays tier 3 — 40 caps size, it is not an ending', worldTier(41) === 3);
check('reef 999 stays tier 3',   worldTier(999) === 3);

// --- clamps: world generation must never fail -----------------------------
check('reef 0 clamps to tier 0',        worldTier(0) === 0);
check('negative reef clamps to tier 0', worldTier(-5) === 0);
check('NaN clamps to tier 0',           worldTier(NaN) === 0);
check('undefined clamps to tier 0',     worldTier(undefined) === 0);
check('a fractional reef floors',       worldTier(4.9) === 1);

// --- the sizes themselves (value tests: change a number, fail a test) -----
check('tier 1 width is unchanged from main',  worldSize(1).WW === 2760);
check('tier 1 height is unchanged from main', worldSize(1).WH === 4200);
check('tier 2 is 3600 x 7090',  worldSize(4).WW === 3600 && worldSize(4).WH === 7090);
check('tier 3 is 4200 x 11590', worldSize(11).WW === 4200 && worldSize(11).WH === 11590);
check('tier 4 is 4800 x 18090', worldSize(21).WW === 4800 && worldSize(21).WH === 18090);

// --- the floors in metres, which is what the player actually experiences --
const floorM = (reef) => (worldSize(reef).WH - WORLD.SURFACE) / 10;
check('tier 1 floor is 411 m',  Math.round(floorM(1)) === 411);
check('tier 2 floor is 700 m',  Math.round(floorM(4)) === 700);
check('tier 3 floor is 1150 m', Math.round(floorM(11)) === 1150);
check('tier 4 floor is 1800 m', Math.round(floorM(21)) === 1800);
check('tier1FloorM matches the tier 1 floor', Math.round(tier1FloorM) === 411);

// --- every tier is strictly deeper AND wider than the one above it --------
for (let i = 1; i < WORLD_TIERS.length; i++) {
  check(`tier ${i + 1} is deeper than tier ${i}`, WORLD_TIERS[i].WH > WORLD_TIERS[i - 1].WH);
  check(`tier ${i + 1} is wider than tier ${i}`,  WORLD_TIERS[i].WW > WORLD_TIERS[i - 1].WW);
}

// --- setWorldSize mutates WORLD live (never captured at module scope) -----
setWorldSize(21);
check('setWorldSize(21) sets WORLD.WW live', WORLD.WW === 4800);
check('setWorldSize(21) sets WORLD.WH live', WORLD.WH === 18090);
setWorldSize(1);
check('setWorldSize(1) restores the tier 1 world', WORLD.WW === 2760 && WORLD.WH === 4200);

console.log(`ok world-tiers.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/game/world-tiers.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../../src/config.js' does not provide an export named 'WORLD_TIERS'`

- [ ] **Step 3: Add the tier table to `src/config.js`**

Insert immediately after the `WORLD` const (which ends at line 13):

```js
// --- Deep Reefs: the world grows in four fixed STEPS, not per reef ---------
// Tier 1 is byte-identical to the pre-Deep-Reefs world and is the regression
// anchor for the whole feature. Steps at reefs 4, 11 and 21; reef 40 caps the
// SIZE only — reefs continue past it at tier-4 size (spec locked decision 11).
// See docs/superpowers/specs/2026-09-02-deep-reefs-design.md.
export const WORLD_TIERS = [
  { minReef: 1,  WW: 2760, WH: 4200  },   //  411 m — unchanged from main
  { minReef: 4,  WW: 3600, WH: 7090  },   //  700 m
  { minReef: 11, WW: 4200, WH: 11590 },   // 1150 m
  { minReef: 21, WW: 4800, WH: 18090 },   // 1800 m
];

// The tier-1 floor in metres (411). Task 11's value functions key off this so
// tier-1 payouts stay exactly as they were before Deep Reefs.
export const tier1FloorM = (WORLD_TIERS[0].WH - WORLD.SURFACE) / 10;

// Pure: reef -> tier index. Anything non-finite, fractional or out of range
// clamps rather than throwing — world generation must never fail.
export function worldTier(reef) {
  const r = Number(reef);
  if (!Number.isFinite(r)) return 0;
  const n = Math.floor(r);
  let t = 0;
  for (let i = 0; i < WORLD_TIERS.length; i++) if (n >= WORLD_TIERS[i].minReef) t = i;
  return t;
}

// Pure: reef -> the world extents for that reef.
export function worldSize(reef) {
  const { WW, WH } = WORLD_TIERS[worldTier(reef)];
  return { WW, WH };
}

// Assign this reef's extents onto the LIVE WORLD object. Mirrors setViewport():
// WW/WH must never be captured at module scope, or a stale world is pinned.
// Called once at the top of the reef's _generateWorld(), BEFORE the Cave is
// constructed (Cave derives GW/GH from the extents in its constructor).
export function setWorldSize(reef) {
  const { WW, WH } = worldSize(reef);
  WORLD.WW = WW; WORLD.WH = WH;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/game/world-tiers.test.mjs`
Expected: PASS — `ok world-tiers.test.mjs (33 checks)`

- [ ] **Step 5: Make the three module-scope captures live**

In `src/game.js`, change line 26 from:

```js
const { WW, WH, OPEN_BAND, CELL } = WORLD;
```

to:

```js
// WW/WH are LIVE — setWorldSize(reef) reassigns them per world tier, exactly as
// setViewport reassigns W/H. Capturing them here would pin a stale world.
const { OPEN_BAND, CELL } = WORLD;
```

Then replace every bare `WW` with `WORLD.WW` and every bare `WH` with
`WORLD.WH` in that file. Find them with:

```bash
grep -n '\bWW\b\|\bWH\b' src/game.js
```

Repeat identically for `src/minigames/reef/index.js:64` (41 uses) and
`src/systems/cave.js:7` (6 uses — partly done in Task 1).

In `cave.js`, note `GW`/`GH` are computed in the constructor from the live
extents, which is correct: each `Cave` instance is built after `setWorldSize`.

- [ ] **Step 6: Verify nothing captured a stale world**

Run:

```bash
grep -rn '= WORLD;' src/ | grep -v 'OPEN_BAND, CELL' | grep -v 'let { W, H }'
```

Expected: no output. Any hit is a stale capture and a bug.

Then run the full suite and typecheck:

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: all green, typecheck exits 0. The world is still 2760 × 4200
everywhere because nothing calls `setWorldSize` yet — that is Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/config.js src/game.js src/minigames/reef/index.js src/systems/cave.js tests/game/world-tiers.test.mjs
git commit -m "feat: live world extents and the four Deep Reefs size tiers

WORLD.WW/WH become live reads, mirroring setViewport's W/H. Three
module-scope captures (game.js, reef/index.js, cave.js) become live.
Nothing calls setWorldSize yet, so behaviour is unchanged."
```

---

### Task 3: Generate each reef at its tier size

**Files:**
- Modify: `src/minigames/reef/index.js` — `_generateWorld()` (the method
  containing `this.vents = []; this.wrecks = []; …` at ~line 368)
- Modify: `src/render/background.js` — parallax layers are built from
  `WORLD.WW`/`WORLD.WH` at construction and must be rebuilt when the world resizes
- Test: `tests/game/world-tiers.test.mjs` (extend)

**Interfaces:**
- Consumes: `setWorldSize(reef)` from Task 2.
- Produces: reefs generate at their tier size. No new exported symbols.

- [ ] **Step 1: Write the failing test**

Append to `tests/game/world-tiers.test.mjs`, before the summary line:

```js
// --- the tier-1 regression anchor -----------------------------------------
// Reefs 1-3 must produce exactly the world main produced. If this fails, the
// feature has changed the game where players already are.
for (const reef of [1, 2, 3]) {
  setWorldSize(reef);
  check(`reef ${reef} generates the unchanged 2760x4200 world`,
    WORLD.WW === 2760 && WORLD.WH === 4200);
}

// --- and the steps actually take effect on the live WORLD -----------------
setWorldSize(4);
check('reef 4 generates a 700 m world', WORLD.WH === 7090);
setWorldSize(11);
check('reef 11 generates a 1150 m world', WORLD.WH === 11590);
setWorldSize(21);
check('reef 21 generates an 1800 m world', WORLD.WH === 18090);
setWorldSize(1);   // leave the module in the tier-1 state for any later import
```

- [ ] **Step 2: Run it to verify it passes already**

Run: `node tests/game/world-tiers.test.mjs`
Expected: PASS. These assert `setWorldSize` alone, which Task 2 built — they are
here as the anchor other tasks must not break, not as a new failure.

- [ ] **Step 3: Call `setWorldSize` in `_generateWorld`**

In `src/minigames/reef/index.js`, add `setWorldSize` to the existing import from
`../../config.js`, then make it the **first statement** of `_generateWorld()`,
before `this.cave` / `new Cave(...)` is built:

```js
  _generateWorld() {
    // This reef's world extents come first: the Cave derives its grid from
    // WORLD.WW/WH in its constructor, and every fraction-of-depth placement
    // below reads them live. See worldSize() in config.js.
    setWorldSize(this.reef);
```

- [ ] **Step 4: Rebuild the background parallax on resize**

`src/render/background.js` seeds its layers from `WORLD.WW`/`WORLD.WH` when the
background object is constructed (lines 14–15, 29–30, 50, 55). Find where the
reef constructs it:

```bash
grep -rn 'new Background\|makeBackground\|background' src/minigames/reef/index.js | head
```

Ensure it is (re)constructed inside `_generateWorld()` **after** `setWorldSize`,
not once at reef construction. If it is built once, move that construction into
`_generateWorld`.

- [ ] **Step 5: Verify a deep reef generates and is playable headless**

Add a temporary script `/tmp/gen-check.mjs` (do not commit) that stubs
`document` as in Task 1, imports the reef, and generates reefs 1, 4, 11 and 21,
asserting `this.cave.GH` grows and `this.treasures.length > 0` each time. Run it,
confirm no exception, then delete it.

- [ ] **Step 6: Full suite + typecheck**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```

Expected: all green. Reefs 1–3 unchanged; reefs 4+ now generate taller worlds
whose fraction-based placements (bells at 0.67, dark zones at 0.38, the Guardian
Chest at 2/3, pearls, the giant clam, skeletons, the fauna depth bands) follow
automatically.

- [ ] **Step 7: Commit**

```bash
git add src/minigames/reef/index.js src/render/background.js tests/game/world-tiers.test.mjs
git commit -m "feat: generate each reef at its tier's world size

Reefs 1-3 unchanged (the regression anchor); 4+ step to 700/1150/1800 m.
Fraction-of-depth placements follow the taller world for free."
```

---

### Task 4: Delete the per-reef air multiplier

Spec locked decision 3. Depth now scales, so a reef multiplier double-counts —
with both, reef 9's floor cost ~20 air/s against a 250-air tank.

**Files:**
- Modify: `src/config.js` — remove `oxygenPenaltyPerReef` and `oxygenPenaltyCap`
  from `GAME` (lines 66–67)
- Modify: `src/minigames/reef/index.js:95-99` (`oxygenMultiplier`) and its call
  site at line 1473
- Test: `tests/game/economy.test.mjs` (**name-first**), `tests/game/abyss-air.test.mjs` (**name-first**)

**Interfaces:**
- Consumes: nothing.
- Produces: `oxygenMultiplier(zone: string, inSub?: boolean) => number` — the
  `reef` parameter is **removed**, not left unused.

- [ ] **Step 1: Find every assertion that depends on the reef term**

```bash
grep -n 'oxygenMultiplier\|oxygenPenalty' tests/game/economy.test.mjs tests/game/abyss-air.test.mjs
```

Read each one. They assert the multiplier rises with reef; those assertions are
being deleted, not adjusted.

- [ ] **Step 2: Rewrite those assertions to the new contract**

In both files, replace the reef-term assertions with (name-first style, matching
both files):

```js
check('the reef number no longer touches air drain', oxygenMultiplier('reef') === 1);
check('reef is not a parameter — a stray arg changes nothing',
  oxygenMultiplier('reef') === oxygenMultiplier('reef', false));
check('the abyss still costs its 150% outside the sub',
  Math.abs(oxygenMultiplier('abyss') - ABYSS.airMult) < 1e-9);
check('the sub still shelters you from the abyss cost', oxygenMultiplier('abyss', true) === 1);
```

Update each file's import of `oxygenMultiplier` and add `ABYSS` to its
`config.js` import if it is not already there.

- [ ] **Step 3: Run them to verify they fail**

Run: `node tests/game/economy.test.mjs && node tests/game/abyss-air.test.mjs`
Expected: FAIL — the old three-argument function still applies a reef term, so
`oxygenMultiplier('reef')` reads `reef` as the zone and returns a reef-scaled
number.

- [ ] **Step 4: Delete the reef term**

In `src/config.js`, delete these two lines from `GAME`:

```js
  oxygenPenaltyPerReef: 0.15,
  oxygenPenaltyCap: 8,
```

and the comment above them ("Each new reef bites harder…").

In `src/minigames/reef/index.js`, replace lines 95–99 with:

```js
// Pure: the non-depth multipliers on air drain. The per-reef penalty was
// DELETED with Deep Reefs (spec locked decision 3): depth is now the difficulty
// axis, and a reef multiplier on top of a 1800 m world double-counted badly
// enough to empty a full tank in twelve seconds. Only the abyss term remains.
export function oxygenMultiplier(zone, inSub = false) {
  return (zone === 'abyss' && !inSub) ? ABYSS.airMult : 1;
}
```

At line 1473, change the call site:

```js
      const oxyMult = oxygenMultiplier(this.zone, this.inSub);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/game/economy.test.mjs && node tests/game/abyss-air.test.mjs`
Expected: PASS, both printing their summary lines.

- [ ] **Step 6: Confirm no caller was missed**

```bash
grep -rn 'oxygenMultiplier\|oxygenPenalty' src/ tests/
```

Expected: only the definition, the one call site, and the rewritten assertions.

- [ ] **Step 7: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/config.js src/minigames/reef/index.js tests/game/economy.test.mjs tests/game/abyss-air.test.mjs
git commit -m "feat!: delete the per-reef air multiplier

Depth is the difficulty axis now; a reef multiplier on top of an 1800 m
world double-counts. oxygenMultiplier loses its reef parameter."
```

---

### Task 5: The depth model — oxygen line, crush depth, Valve tiers

**Files:**
- Modify: `src/config.js` — new `DEPTH` const; extend `VALVE`
- Test: `tests/game/valve-air.test.mjs` (rewrite; **name-first**)

**Interfaces:**
- Consumes: `tier1FloorM` from Task 2.
- Produces:
  - `DEPTH: { oxygenLineM: 250, oxygenSteepen: 1.6, crushTimer: 14, crushRecoverRatio: 1.5, approachWarnM: 40 }`
  - `crushDepthM(valveLevel: number) => number`
  - `valveDiscount(valveLevel: number) => number`
  - `airDepthTerm(depthM: number, valveLevel?: number) => number` — air/second
    from depth alone, excluding `AIR.drainPerSec` and every multiplier

- [ ] **Step 1: Write the failing test**

Replace the *assertions* in `tests/game/valve-air.test.mjs` (keep its existing
`document` stub and its name-first `check` at line 27) with:

```js
import { AIR, DEPTH, VALVE, crushDepthM, valveDiscount, airDepthTerm } from '../../src/config.js';

const near = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

// --- crush depth: one Valve level per world tier ---------------------------
check('no valve crushes at 400 m',  crushDepthM(0) === 400);
check('Lv1 crushes at 720 m',       crushDepthM(1) === 720);
check('Lv2 crushes at 1160 m',      crushDepthM(2) === 1160);
check('Lv3 crushes at 1820 m',      crushDepthM(3) === 1820);
check('each level reaches its tier floor: Lv1 clears 700 m', crushDepthM(1) > 700);
check('Lv2 clears the 1150 m floor',  crushDepthM(2) > 1150);
check('Lv3 clears the 1800 m floor',  crushDepthM(3) > 1800);
check('no valve does NOT clear the 700 m tier-2 floor', crushDepthM(0) < 700);

// --- clamps: a corrupt level must never crash a dive -----------------------
check('level 4 clamps to Lv3',    crushDepthM(4) === crushDepthM(3));
check('level -1 clamps to Lv0',   crushDepthM(-1) === crushDepthM(0));
check('NaN clamps to Lv0',        crushDepthM(NaN) === crushDepthM(0));
check('undefined clamps to Lv0',  crushDepthM(undefined) === crushDepthM(0));

// --- the oxygen line steepens the depth term, and only below 250 m ---------
check('the oxygen line sits at 250 m', DEPTH.oxygenLineM === 250);
check('the steepening factor is 1.6',  DEPTH.oxygenSteepen === 1.6);
const perM = AIR.drainDepthFactor * 10;
check('above the line the term is the unchanged linear rate',
  near(airDepthTerm(100, 0), 100 * perM));
check('at the line exactly, still linear',
  near(airDepthTerm(250, 0), 250 * perM));
check('below the line the marginal rate is 1.6x',
  near(airDepthTerm(350, 0) - airDepthTerm(250, 0), 100 * perM * 1.6));
check('the term is monotonic in depth', airDepthTerm(800, 0) > airDepthTerm(400, 0));

// --- the tier-floor costs the discount ladder is sized against -------------
check('unvalved at 400 m costs ~3.5/s',      near(airDepthTerm(400, 0), 3.53, 0.05));
check('Lv1 at the 700 m tier-2 floor ~4.2/s', near(airDepthTerm(700, 1), 4.19, 0.05));
check('Lv2 at the 1150 m tier-3 floor ~4.5/s', near(airDepthTerm(1150, 2), 4.50, 0.05));
check('Lv3 at the 1800 m tier-4 floor ~4.7/s', near(airDepthTerm(1800, 3), 4.72, 0.05));
check('a properly equipped diver pays about the same at every tier floor',
  Math.max(airDepthTerm(400, 0), airDepthTerm(700, 1), airDepthTerm(1150, 2), airDepthTerm(1800, 3)) -
  Math.min(airDepthTerm(400, 0), airDepthTerm(700, 1), airDepthTerm(1150, 2), airDepthTerm(1800, 3)) < 1.3);

// --- parity with the shipped 2026-09-01 clamp, where it was tuned ----------
// The old valve clamped the depth term at VALVE.holdDepthM (150 m), charging
// 150 * 10 * drainDepthFactor = 1.08/s at any depth below it.
const oldClamped = VALVE.holdDepthM * 10 * AIR.drainDepthFactor;
check('Lv1 at 240 m stays within 5% of the clamp it replaces',
  Math.abs(airDepthTerm(240, 1) - oldClamped) / oldClamped < 0.05);
// At the old 411 m floor the numbers DELIBERATELY diverge — the oxygen line
// raised the unvalved cost there too, so the valve's share of the saving falls
// from 34% to 23%. Pinned as a new number, not as parity (see the spec).
check('Lv1 at the old 411 m floor is the new pinned 2.19/s',
  near(airDepthTerm(411, 1), 2.19, 0.05));
check('and that is still a real saving over no valve at all',
  airDepthTerm(411, 1) < airDepthTerm(411, 0) * 0.65);

// --- the discounts themselves ---------------------------------------------
check('no valve discounts nothing', valveDiscount(0) === 0);
check('the discount grows with every level',
  valveDiscount(1) < valveDiscount(2) && valveDiscount(2) < valveDiscount(3));
check('even Lv3 never makes depth free', valveDiscount(3) < 1);
check('a discounted term is always cheaper than an undiscounted one',
  airDepthTerm(1000, 2) < airDepthTerm(1000, 0));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/game/valve-air.test.mjs`
Expected: FAIL — no export named `DEPTH`.

- [ ] **Step 3: Add the depth model to `src/config.js`**

Insert after the `AIR` const:

```js
// --- Deep Reefs: the two fixed danger depths ------------------------------
// Both are ABSOLUTE METRES, identical in every reef, so the player learns them
// once (spec locked decision 1). 250 m sits in the bottom third of the tier-1
// world, so reefs 1-3 teach the oxygen line gently before any deeper tier
// exists. oxygenSteepen is the PRIMARY BALANCE DIAL of the whole feature.
export const DEPTH = {
  oxygenLineM: 250,        // below this the depth term steepens
  oxygenSteepen: 1.6,      // <- move this first if the deep tiers feel wrong
  crushTimer: 14,          // seconds from crossing crush depth to death
  crushRecoverRatio: 1.5,  // seconds of safe water per second of timer recovered
  approachWarnM: 40,       // the gauge flashes within this many metres of crush depth
};
```

Then replace the `VALVE` const with:

```js
// Depth Valve: the tiered pressure gear. One level per world tier — the rule is
// "each tier of the world needs the next Valve". A level buys BOTH crush depth
// (how deep you may go before the alarm) and a share of the depth-drain
// discount. It buys air as well as depth because at 1800 m a crush-depth-only
// valve leaves a full tank empty in eleven seconds — see "Why decision 7
// changed" in the spec. holdDepthM is retained only to document the pre-Deep-
// Reefs clamp the Lv1 discount is pinned against in valve-air.test.mjs.
export const VALVE = {
  cost: 400,        // Lv1 price; doubles per level via Game#_dblCost
  minReef: 3,       // shop-gate: appears from reef 3
  maxLevel: 3,
  holdDepthM: 150,  // historical: the clamp Deep Reefs replaced
  // Index = valve level (0 = none).
  crushDepthM: [400, 720, 1160, 1820],
  drainDiscount: [0, 0.40, 0.63, 0.76],
};

function valveLevelIndex(level) {
  const l = Number(level);
  if (!Number.isFinite(l)) return 0;
  return Math.max(0, Math.min(VALVE.maxLevel, Math.floor(l)));
}

// Pure: the depth (m) below which this Valve level triggers the crush alarm.
export function crushDepthM(level) { return VALVE.crushDepthM[valveLevelIndex(level)]; }

// Pure: the fraction of the depth term this Valve level removes.
export function valveDiscount(level) { return VALVE.drainDiscount[valveLevelIndex(level)]; }

// Pure: air drained per second by DEPTH alone — excludes the AIR.drainPerSec
// baseline and every multiplier (abyss, wetsuit, extraction lapse). Two
// segments: the unchanged linear rate down to the oxygen line, then a steeper
// rate below it. AIR.drainDepthFactor is per WORLD UNIT and there are 10 units
// per metre, hence the x10.
export function airDepthTerm(depthM, valveLevel = 0) {
  const m = Math.max(0, Number(depthM) || 0);
  const perM = AIR.drainDepthFactor * 10;
  const shallow = Math.min(m, DEPTH.oxygenLineM) * perM;
  const deep = Math.max(0, m - DEPTH.oxygenLineM) * perM * DEPTH.oxygenSteepen;
  return (shallow + deep) * (1 - valveDiscount(valveLevel));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/game/valve-air.test.mjs`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/config.js tests/game/valve-air.test.mjs
git commit -m "feat: the Deep Reefs depth model — oxygen line, crush depth, Valve tiers

Two-segment depth term steepening 1.6x below 250 m; the Valve becomes a
level-scaled discount instead of a clamp, so the oxygen line is not
cancelled for owners. Lv1 stays within 5% of the shipped clamp at 240 m."
```

---

### Task 6: Wire the depth model into the dive

**Files:**
- Modify: `src/minigames/reef/index.js` — `pressureDepth` (lines 101–108, now
  dead), the drain line (1478), run state (`this.hasValve` → `this.valveLevel`)
- Modify: `src/minigames/reef/index.js` — `_shopItems()` (line 772) and
  `_shopBuy()` valve branch, `_openShop()` (line 801)
- Test: `tests/game/valve-air.test.mjs` (extend with the shop assertions it
  already carries)

**Interfaces:**
- Consumes: `airDepthTerm`, `crushDepthM`, `VALVE` from Task 5.
- Produces: `reef.valveLevel: number` (0–3), replacing `reef.hasValve: boolean`.

- [ ] **Step 1: Find every use of `hasValve`**

```bash
grep -rn 'hasValve' src/ tests/
```

Every hit must become `valveLevel`. Note `hasValve` is also read by the depth
gauge call site and by `_runDelta`'s valve telemetry.

- [ ] **Step 2: Write the failing assertions**

Append to `tests/game/valve-air.test.mjs` (it already builds hand-made reef stubs
for its shop checks — follow that existing pattern in the file):

```js
// --- the shop sells one level at a time, up to maxLevel --------------------
const shopStub = (reef, valveLevel, gold = 99999) => ({
  reef, valveLevel, gold, owned: new Set(), weaponLevel: {}, buffT: {},
  flares: 0, harpoonAmmo: 0, harpoonMax: 0, harpoonCapLevel: 0,
  chargeAmmo: 0, chargeMax: 0, chargeCapLevel: 0, aimLevel: 0, tankLevel: 0,
  hasTorch: true, speargunAmmo: 0, carried: 0, carriedPearls: 0, shopWhere: 'boat',
});
// The reef class, imported for its prototype. valve-air.test.mjs already stubs
// `document` at the top for exactly this — the import is why that stub exists.
// Check how the file already names it; if it does not import the class yet, add:
//   const { Game: Reef } = await import('../../src/minigames/reef/index.js');
// (a dynamic import, so the document stub above is installed first).
const valveRows = (s) => Reef.prototype._shopItems.call(s).filter((i) => i.kind === 'valve');

check('a valve row is offered at the gate reef with no valve',
  valveRows(shopStub(3, 0)).length === 1);
check('no valve row before the gate reef',
  valveRows(shopStub(2, 0)).length === 0);
check('the row offers the NEXT level',
  valveRows(shopStub(5, 1))[0].label.includes('Lv2'));
check('no valve row once Lv3 is owned',
  valveRows(shopStub(30, 3)).length === 0);
check('each level costs double the last',
  valveRows(shopStub(5, 1))[0].cost === VALVE.cost * 2);
```

Adjust the stub's field list if `_shopItems` reads a field it lacks — run it and
add whatever it needs.

- [ ] **Step 3: Run to verify it fails**

Run: `node tests/game/valve-air.test.mjs`
Expected: FAIL — `_shopItems` still reads `this.hasValve`.

- [ ] **Step 4: Replace `hasValve` with `valveLevel` and delete `pressureDepth`**

Delete `pressureDepth()` (lines 101–108) entirely — `airDepthTerm` replaces it.

Change the run-state initialiser (wherever `this.hasValve = false` is set) to
`this.valveLevel = 0;`.

Replace the drain line (1478) with:

```js
      const depthM = metresDown(this.diver.y);
      this.air -= (AIR.drainPerSec + airDepthTerm(depthM, this.valveLevel)) * oxyMult * suitMult * lapseMult * dt;
```

`metresDown` is already imported from `../../render/depthgauge.js` at line 50.

Replace the shop row (line 772–773) with:

```js
    if (this.valveLevel < VALVE.maxLevel && this.reef >= VALVE.minReef)
      items.push({ kind: 'valve', id: 'valve',
        label: `⚲ Depth Valve → Lv${this.valveLevel + 1} — dive to ${crushDepthM(this.valveLevel + 1)} m`,
        cost: this._dblCost(VALVE.cost, this.valveLevel) });
```

In `_shopBuy()`, change the valve branch from setting `this.hasValve = true` to
`this.valveLevel += 1;` (leave `this.runValveBought` as it is — see Task 10).

In `_openShop()` (line 801), change the offer counter's condition:

```js
    if (this.valveLevel < VALVE.maxLevel && this.reef >= VALVE.minReef) this.runValveOffered = 1;
```

Add `airDepthTerm`, `crushDepthM` to the `config.js` import at the top of the file.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tests/game/valve-air.test.mjs`
Expected: PASS.

- [ ] **Step 6: Confirm `hasValve` is fully gone**

```bash
grep -rn 'hasValve\|pressureDepth' src/ tests/
```

Expected: no output.

- [ ] **Step 7: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/minigames/reef/index.js tests/game/valve-air.test.mjs
git commit -m "feat: dive on the tiered Valve — valveLevel replaces hasValve

airDepthTerm replaces the pressureDepth clamp in the drain; the shop sells
one level at a time at a doubling price up to Lv3."
```

---

### Task 7: The crush timer

**Files:**
- Modify: `src/minigames/reef/index.js` — run state, `update()`, death
- Create: `tests/game/crush-timer.test.mjs` (**name-first** `check(name, cond)`)

**Interfaces:**
- Consumes: `crushDepthM`, `DEPTH` from Task 5.
- Produces:
  - `crushStep(state, depthM, valveLevel, dt) => state` — pure, exported from
    `src/config.js`, where `state` is `{ phase: 'safe'|'alarmed'|'crushed', t: number }`
  - `reef._crush: { phase, t }` run state; `deathCause: 'crushed'`

- [ ] **Step 1: Write the failing test**

Create `tests/game/crush-timer.test.mjs`:

```js
// The crush timer: below your Valve's crush depth an alarm starts and a 14 s
// countdown runs. Reaching zero ends the dive outright, ignoring lives (spec
// locked decision 4). Returning to safe water recovers the timer GRADUALLY —
// 1 s per 1.5 s — which is the anti-yo-yo rule (locked decision 5).
// Run: node tests/game/crush-timer.test.mjs

import { DEPTH, crushDepthM, crushStep } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const fresh = () => ({ phase: 'safe', t: DEPTH.crushTimer });

// --- entering the crush band ----------------------------------------------
let s = crushStep(fresh(), 300, 0, 0.1);
check('safe above crush depth', s.phase === 'safe');
check('a safe diver keeps a full timer', s.t === DEPTH.crushTimer);

s = crushStep(fresh(), 500, 0, 0.1);
check('crossing 400 m with no valve raises the alarm', s.phase === 'alarmed');
check('the timer starts running down immediately', s.t < DEPTH.crushTimer);

s = crushStep(fresh(), 500, 1, 0.1);
check('Lv1 is safe at 500 m', s.phase === 'safe');
s = crushStep(fresh(), 900, 1, 0.1);
check('Lv1 alarms at 900 m', s.phase === 'alarmed');
s = crushStep(fresh(), 1750, 3, 0.1);
check('Lv3 is safe at 1750 m — the tier-4 floor is reachable', s.phase === 'safe');

// --- exactly at the line is safe; a metre past is not ---------------------
check('exactly at crush depth is safe',
  crushStep(fresh(), crushDepthM(0), 0, 0.1).phase === 'safe');
check('one metre below crush depth alarms',
  crushStep(fresh(), crushDepthM(0) + 1, 0, 0.1).phase === 'alarmed');

// --- the countdown and death ----------------------------------------------
s = fresh();
for (let i = 0; i < 139; i++) s = crushStep(s, 500, 0, 0.1);   // 13.9 s
check('still alarmed just before the timer expires', s.phase === 'alarmed');
check('the timer has nearly run out', s.t < 0.2);
s = crushStep(s, 500, 0, 0.2);
check('the timer reaching zero crushes the diver', s.phase === 'crushed');
check('a crushed diver stays crushed even after ascending',
  crushStep(s, 10, 0, 0.1).phase === 'crushed');

// --- gradual recovery: the anti-yo-yo rule --------------------------------
s = fresh();
for (let i = 0; i < 40; i++) s = crushStep(s, 500, 0, 0.1);    // 4 s down -> t = 10
const spent = DEPTH.crushTimer - s.t;
check('four seconds below the line spends four seconds of timer', Math.abs(spent - 4) < 0.05);
s = crushStep(s, 100, 0, 3);                                   // 3 s of safe water
check('ascending returns you to safe', s.phase === 'safe');
check('3 s of safe water recovers only 2 s of timer',
  Math.abs(s.t - (DEPTH.crushTimer - 4 + 3 / DEPTH.crushRecoverRatio)) < 0.05);
check('recovery is slower than the drain — dipping costs more than it returns',
  DEPTH.crushRecoverRatio > 1);

// --- recovery never exceeds the maximum -----------------------------------
s = crushStep({ phase: 'safe', t: DEPTH.crushTimer - 1 }, 10, 0, 600);
check('a long safe stretch does not overfill the timer', s.t === DEPTH.crushTimer);

console.log(`ok crush-timer.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/game/crush-timer.test.mjs`
Expected: FAIL — no export named `crushStep`.

- [ ] **Step 3: Add `crushStep` to `src/config.js`**

Append after `airDepthTerm`:

```js
// Pure: advance the crush state machine by dt. `state` is { phase, t } where
// phase is 'safe' | 'alarmed' | 'crushed' and t is the seconds of timer left.
// Mutates and returns state (called every frame; allocating per frame would be
// wasteful). 'crushed' is terminal — the dive is over, and ascending does not
// undo it.
export function crushStep(state, depthM, valveLevel, dt) {
  if (state.phase === 'crushed') return state;
  const limit = crushDepthM(valveLevel);
  if (depthM > limit) {
    state.phase = 'alarmed';
    state.t -= dt;
    if (state.t <= 0) { state.t = 0; state.phase = 'crushed'; }
  } else {
    state.phase = 'safe';
    state.t = Math.min(DEPTH.crushTimer, state.t + dt / DEPTH.crushRecoverRatio);
  }
  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/game/crush-timer.test.mjs`
Expected: PASS — `ok crush-timer.test.mjs (22 checks)`

- [ ] **Step 5: Wire it into the dive**

In `src/minigames/reef/index.js`:

Add `crushStep` and `DEPTH` to the `config.js` import.

Initialise the run state next to the other per-run fields (near
`this.valveLevel = 0;`):

```js
    // Crush state. Reset here, on zone entry/exit and on death — a stale
    // 'alarmed' leaking into a fresh dive would kill a player in silence.
    this._crush = { phase: 'safe', t: DEPTH.crushTimer };
```

Reset it identically in the zone-entry and zone-exit helpers (`_enterWhale`,
`_exitWhale`, `_enterTemple`, `_enterAbyss`, `_exitAbyss`, and the whirlpool /
stage entry points) — find them with:

```bash
grep -n '_enter\|_exit' src/minigames/reef/index.js | head -20
```

In `update()`, immediately after the air-drain block (the `if (this.air <= 0)`
line), add:

```js
      // Crush depth applies in the REEF ZONE ONLY — the abyss, temple, belly and
      // whirlpool are self-contained and separately tuned (spec scope line).
      if (this.zone === 'reef') {
        const wasAlarmed = this._crush.phase === 'alarmed';
        crushStep(this._crush, depthM, this.valveLevel, dt);
        if (this._crush.phase === 'alarmed' && !wasAlarmed) this.runCrushAlarmed = 1;
        else if (this._crush.phase === 'safe' && wasAlarmed) this.runCrushEscapes++;
        if (this._crush.phase === 'crushed') { this.deathCause = 'crushed'; this.runCrushDeaths = 1; this._endRun(); }
      } else if (this._crush.phase !== 'safe') {
        this._crush.phase = 'safe'; this._crush.t = DEPTH.crushTimer;
      }
```

Replace `this._endRun()` with whatever the file's existing run-ending call is —
find it via the air-out path:

```bash
grep -n '_loseLife\|_gameOver' src/minigames/reef/index.js | head
```

A crush must end the run **outright**, not call `_loseLife()`. If `_gameOver` is
the terminal call, use it directly.

Initialise `this.runCrushAlarmed = 0; this.runCrushEscapes = 0; this.runCrushDeaths = 0;`
alongside the other `run*` counters (near `this.runChestsOpened = 0;` at line 302).

- [ ] **Step 6: Verify the death path headless**

Write a temporary script (do not commit) that stubs `document`, builds a reef,
forces `zone = 'reef'`, `valveLevel = 0`, places the diver at 500 m, and steps
`update` for 15 s of `dt`. Assert `deathCause === 'crushed'` and that the run
ended. Delete the script afterwards.

- [ ] **Step 7: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/config.js src/minigames/reef/index.js tests/game/crush-timer.test.mjs
git commit -m "feat: the crush timer — 14 s below crush depth ends the dive

Run-ending regardless of lives; timer recovers at 1 s per 1.5 s of safe
water so the deep band cannot be farmed by dipping. Reef zone only."
```

---

### Task 8: Depth gauge bands, approach flash and countdown

**Files:**
- Modify: `src/render/depthgauge.js`
- Modify: `src/minigames/reef/index.js:2401-2402` (the `drawDepthGauge` call site)
- Test: `tests/render/depthgauge.test.mjs` (extend; **name-first**)

**Interfaces:**
- Consumes: `DEPTH`, `crushDepthM` from Tasks 5–6; `reef._crush` from Task 7.
- Produces:
  - `gaugeTickStep(maxM) => { tick: number, label: number }` — tick spacing that
    scales with the tier so 1800 m is not an unreadable stripe
  - `drawDepthGauge(ctx, { W, H, depth, deepest, crushDepth, oxygenLine, crushPhase, crushT, t })`
    — the `valveDepth` parameter is **replaced** by `crushDepth` + `oxygenLine`

- [ ] **Step 1: Write the failing test**

Append to `tests/render/depthgauge.test.mjs`, before its summary line:

```js
// --- tick spacing must scale with the tier --------------------------------
import { gaugeTickStep } from '../../src/render/depthgauge.js';
import { DEPTH, crushDepthM } from '../../src/config.js';

const t1 = gaugeTickStep(411);
check('tier 1 keeps the 50/100 m spacing it always had', t1.tick === 50 && t1.label === 100);
const t4 = gaugeTickStep(1800);
check('an 1800 m column uses coarser ticks', t4.tick > 50);
check('an 1800 m column labels no more than 10 times', 1800 / t4.label <= 10);
check('labels are always a whole multiple of ticks', t4.label % t4.tick === 0);
check('tick spacing never shrinks as the world deepens', gaugeTickStep(1150).tick >= t1.tick);

// --- the danger bands are painted -----------------------------------------
{
  WORLD.WH = 18090;   // tier 4, so both lines are on-scale
  const ctx = recordingCtx();
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 100, deepest: 100,
    crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
    crushPhase: 'safe', crushT: DEPTH.crushTimer, t: 0,
  });
  const fills = ctx._fills.map((f) => String(f).toLowerCase());
  check('an amber oxygen band is painted', fills.some((f) => f.includes('255,176') || f.includes('255, 176')));
  check('a red crush band is painted',     fills.some((f) => f.includes('255,64')  || f.includes('255, 64')));
  const texts = ctx._ops.filter((o) => o.op === 'text').map((o) => String(o.s));
  check('the crush line is labelled with its depth', texts.some((s) => s.includes('720')));
}

// --- approaching the line flashes -----------------------------------------
{
  const near = DEPTH.approachWarnM - 5;         // just inside the warning band
  const a = recordingCtx(), b = recordingCtx();
  const args = (t) => ({
    W: 900, H: 600, depth: crushDepthM(1) - near, deepest: 0,
    crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
    crushPhase: 'safe', crushT: DEPTH.crushTimer, t,
  });
  drawDepthGauge(a, args(0));
  drawDepthGauge(b, args(0.5));   // half a flash period later
  check('the gauge paints differently as it flashes on approach',
    JSON.stringify(a._fills) !== JSON.stringify(b._fills));
}

// --- the alarm shows the countdown ----------------------------------------
{
  const ctx = recordingCtx();
  drawDepthGauge(ctx, {
    W: 900, H: 600, depth: 900, deepest: 900,
    crushDepth: crushDepthM(1), oxygenLine: DEPTH.oxygenLineM,
    crushPhase: 'alarmed', crushT: 7.4, t: 0,
  });
  const texts = ctx._ops.filter((o) => o.op === 'text').map((o) => String(o.s));
  check('the alarm prints the seconds remaining', texts.some((s) => s.includes('7')));
}

WORLD.WH = 4200;   // restore the tier-1 world for anything importing later
```

If `recordingCtx()` does not already record `text` calls as
`{ op: 'text', s }`, extend it to do so — it is defined at the top of this file.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/render/depthgauge.test.mjs`
Expected: FAIL — no export named `gaugeTickStep`.

- [ ] **Step 3: Implement**

In `src/render/depthgauge.js`, add above `drawDepthGauge`:

```js
// Tick spacing scales with the column's depth. The gauge shows the WHOLE water
// column in a fixed on-screen height, so a tier-4 world compresses 1800 m into
// the space that shows 411 m in tier 1 — at a fixed 50/100 m spacing that is an
// unreadable stripe of labels. Pure, so it is asserted directly.
export function gaugeTickStep(maxM) {
  if (maxM <= 500)  return { tick: 50,  label: 100 };
  if (maxM <= 900)  return { tick: 100, label: 200 };
  if (maxM <= 1400) return { tick: 100, label: 500 };
  return { tick: 200, label: 500 };
}
```

Change `drawDepthGauge`'s signature and body:

- Replace the `valveDepth` parameter with `crushDepth`, `oxygenLine`,
  `crushPhase = 'safe'`, `crushT = 0`, `t = 0`.
- Replace `TICK_STEP_M` / `LABEL_STEP_M` with `const { tick, label } = gaugeTickStep(maxM);`
  and use `tickMarks(maxM, tick)` and `m % label === 0`.
- Paint the bands **before** the column, in this order:
  - amber oxygen band from `y(oxygenLine)` to `R.bottom`, `rgba(255,176,64,0.10)`
  - red crush band from `y(crushDepth)` to `R.bottom`, `rgba(255,64,64,0.16)`
- Paint the crush line over them at `rgba(255,90,90,0.85)` with the label
  `` `⚠ ${Math.round(crushDepth)}m` ``.
- **Flash on approach:** when `depth > crushDepth - DEPTH.approachWarnM` and the
  phase is `'safe'`, multiply the crush band and line alpha by
  `0.5 + 0.5 * Math.sin(t * 8)`.
- **Alarm:** when `crushPhase === 'alarmed'`, fill the whole gauge rect with
  `rgba(255,64,64,0.35)` and print `` `${crushT.toFixed(1)}s` `` beside the marker
  in `#ff6a6a`.

Import `DEPTH` from `../config.js` at the top of the file.

- [ ] **Step 4: Update the call site**

In `src/minigames/reef/index.js` around line 2401, change the `drawDepthGauge`
call to pass the new fields:

```js
        depth: metresDown(this.diver.y),
        deepest: metresDown(WORLD.SURFACE + this.depthReached),
        crushDepth: crushDepthM(this.valveLevel),
        oxygenLine: DEPTH.oxygenLineM,
        crushPhase: this._crush.phase,
        crushT: this._crush.t,
        t: this.t,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tests/render/depthgauge.test.mjs`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/render/depthgauge.js src/minigames/reef/index.js tests/render/depthgauge.test.mjs
git commit -m "feat: depth gauge shows the oxygen and crush bands

Amber below 250 m, red below your crush depth, flashing on approach and a
countdown while alarmed. Tick spacing scales so 1800 m stays readable."
```

---

### Task 9: The klaxon

**Files:**
- Create: `src/klaxon.js`
- Modify: `src/audio.js` — construct it, expose `setKlaxon(on)`
- Modify: `src/minigames/reef/index.js` — drive it from `_crush.phase`
- Test: `tests/audio/klaxon.test.mjs` (create; **name-first**)

**Interfaces:**
- Consumes: `reef._crush.phase` from Task 7.
- Produces: `class Klaxon { constructor(ctx, destination); set(on: boolean); stop() }`
  and `Audio#setKlaxon(on: boolean)`.

**WARNING — read before writing a line of this task.** The Node stub used by
`tests/audio/` **passes tests that prove nothing**: a real `AudioParam.value`
does not reflect scheduled automation (it reads the node default), while the
stub's param updates `.value` immediately. The stub test below proves *routing,
allocation and idempotence only*. Audibility is proved by the manual
`OfflineAudioContext` render in Step 5, which is **not optional**.

- [ ] **Step 1: Write the failing test**

Create `tests/audio/klaxon.test.mjs`, copying the `stubCtx()` helper verbatim
from `tests/audio/music-tension.test.mjs` (do not import it — that file does not
export it):

```js
// The crush-depth klaxon. Proved against the same stub AudioContext the music
// tests use: what this file can prove is that it reaches the bus (so the master
// mute silences it), that re-asserting the same state allocates nothing and
// re-issues no ramp, and that it stops cleanly. It CANNOT prove audibility —
// see the OfflineAudioContext render in the plan's Task 9 Step 5.
// Run: node tests/audio/klaxon.test.mjs

import { Klaxon } from '../../src/klaxon.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// ... paste stubCtx() from tests/audio/music-tension.test.mjs here ...

{
  const { ctx, nodes, bus } = stubCtx();
  const k = new Klaxon(ctx, bus);
  check('silent until switched on', k.on === false);
  const before = nodes.length;

  k.set(true);
  check('switching on marks it on', k.on === true);
  check('it allocated its voice', nodes.length > before);
  check('it reaches the bus so the master mute silences it',
    nodes.some((n) => n._conn.includes(bus) || n._conn.some((c) => c._conn && c._conn.includes(bus))));

  const afterOn = nodes.length;
  const rampsAfterOn = ctx._ramps.length;
  k.set(true); k.set(true); k.set(true);
  check('re-asserting ON allocates nothing', nodes.length === afterOn);
  check('re-asserting ON re-issues no ramp — a per-frame setter must return early',
    ctx._ramps.length === rampsAfterOn);

  k.set(false);
  check('switching off marks it off', k.on === false);
  const rampsAfterOff = ctx._ramps.length;
  k.set(false); k.set(false);
  check('re-asserting OFF re-issues no ramp', ctx._ramps.length === rampsAfterOff);

  k.set(true);
  k.stop();
  check('stop() releases the voice', k.on === false);
}

console.log(`ok klaxon.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
```

Extend the pasted `stubCtx()` so the context records every
`setTargetAtTime` / `linearRampToValueAtTime` / `exponentialRampToValueAtTime`
call into a `ctx._ramps` array — that is what the idempotence checks read.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/audio/klaxon.test.mjs`
Expected: FAIL — cannot find module `src/klaxon.js`.

- [ ] **Step 3: Implement `src/klaxon.js`**

```js
// @ts-check
// The crush-depth klaxon — a two-tone submarine emergency horn that loops while
// the diver is below crush depth. It is a GAMEPLAY SIGNAL, not score: it rides
// the master bus and follows the master mute (M), never the music toggle (J).
//
// The `set(on)` setter MUST return early when the value is unchanged. It is
// called every frame; re-issuing setTargetAtTime 60x/second restarts the ramp
// and it never lands (this cost a chase layer that reached 0.58 instead of 1.0,
// fixed 2026-09-01).

const LOW = 340;    // Hz — the two horn tones
const HIGH = 510;
const PERIOD = 0.9; // seconds per alternation
const PEAK = 0.22;  // gain when sounding

export class Klaxon {
  /** @param {any} ctx @param {any} destination */
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.dest = destination;
    this.on = false;
    this.osc = null;
    this.gain = null;
    this.lfo = null;
  }

  set(on) {
    if (on === this.on) return;   // <- the early return that makes the ramp land
    this.on = on;
    if (on) this._start(); else this._stop();
  }

  _start() {
    const ctx = this.ctx, now = ctx.currentTime;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, now);
    this.gain.connect(this.dest);

    this.osc = ctx.createOscillator();
    this.osc.type = 'square';
    this.osc.frequency.setValueAtTime(LOW, now);
    // Alternate the two tones by scheduling a repeating square LFO on frequency.
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfo.frequency.setValueAtTime(1 / PERIOD, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime((HIGH - LOW) / 2, now);
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.osc.frequency);
    this.osc.frequency.setValueAtTime((LOW + HIGH) / 2, now);

    this.osc.connect(this.gain);
    this.osc.start(now);
    this.lfo.start(now);
    this.gain.gain.setTargetAtTime(PEAK, now, 0.05);
  }

  _stop() {
    if (!this.gain) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    const osc = this.osc, lfo = this.lfo, g = this.gain;
    this.osc = null; this.lfo = null; this.gain = null;
    setTimeout(() => {
      try { osc.stop(); lfo.stop(); g.disconnect(); } catch (e) { /* already torn down */ }
    }, 400);
  }

  stop() { this.set(false); }
}
```

In `src/audio.js`, import `Klaxon`, construct it inside `ensure()` alongside the
other sustained voices, connected to the same master bus the ambient uses, and
add:

```js
  setKlaxon(on) { if (this.klaxon) this.klaxon.set(on); }
```

In `src/minigames/reef/index.js`, inside the crush block added in Task 7:

```js
        this.audio.setKlaxon(this._crush.phase === 'alarmed');
```

and call `this.audio.setKlaxon(false)` wherever `_crush` is reset.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/audio/klaxon.test.mjs`
Expected: PASS.

- [ ] **Step 5: Prove it is actually audible (REQUIRED — the stub cannot)**

Serve the branch and run this in the browser console:

```js
const { Klaxon } = await import('/src/klaxon.js');
const oc = new OfflineAudioContext(1, 44100 * 3, 44100);
const k = new Klaxon(oc, oc.destination);
k.set(true);
const buf = await oc.startRendering();
const d = buf.getChannelData(0);
let peak = 0, rms = 0;
for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); rms += d[i] * d[i]; }
rms = Math.sqrt(rms / d.length);
// Zero-crossing rate over the second half, as a cheap proxy for "the two tones
// are alternating" rather than a single steady pitch.
let zc = 0;
for (let i = d.length / 2 + 1; i < d.length; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) zc++;
console.log({ peak, rms, approxHz: zc / 2 / 1.5 });
```

**Accept only if** `peak > 0.15`, `rms > 0.05`, and `approxHz` sits between
`LOW` and `HIGH` (340–510). A peak near zero means the ramp never landed. Paste
the three numbers into the commit message.

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/klaxon.js src/audio.js src/minigames/reef/index.js tests/audio/klaxon.test.mjs
git commit -m "feat: submarine klaxon while below crush depth

Two-tone horn on the master bus (follows M, not J). set(on) returns early
when unchanged so the ramp lands. OfflineAudioContext render: peak=<x>,
rms=<y>, approxHz=<z>."
```

---

### Task 10: Crush telemetry

**Files:**
- Modify: `src/meta/stats.js` — `STAT_KEYS`
- Modify: `src/minigames/reef/index.js` — `_runDelta()` (line 1885)
- Modify: `src/minigames/legacy/manifest.js` — `goals.stats`
- Test: `tests/meta/crush-stats.test.mjs` (create; **cond-first** `check(cond, msg)`,
  mirroring `tests/meta/valve-stats.test.mjs`)

**Interfaces:**
- Consumes: `runCrushAlarmed` / `runCrushEscapes` / `runCrushDeaths` from Task 7.
- Produces: three lifetime counters. **No progressive track binds them**, so they
  mint no Steam achievement ids.

- [ ] **Step 1: Write the failing test**

Create `tests/meta/crush-stats.test.mjs`, copying the structure and the
cond-first `check` from `tests/meta/valve-stats.test.mjs`:

```js
// Crush telemetry: three lifetime diagnostics that say whether the crush
// mechanic is working. All three are ADDITIVE, because addRun() folds a run's
// delta by summation only — a "deepest metres, lifetime max" counter cannot
// work in this store. No progressive track binds them, so they mint no Steam
// achievement ids. Run: node tests/meta/crush-stats.test.mjs

import { STAT_KEYS, defaultStats, addRun } from '../../src/meta/stats.js';
import { TRACKS } from '../../src/meta/progressive.js';
import legacy from '../../src/minigames/legacy/manifest.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const KEYS = ['legacy:crushAlarmed', 'legacy:crushDeaths', 'legacy:crushEscapes'];

for (const k of KEYS) {
  check(STAT_KEYS.includes(k), `${k} is a tracked stat key`);
  check(k.startsWith('legacy:'), `${k} is namespaced (P11.1 contract)`);
  check(defaultStats()[k] === 0, `${k} defaults to 0 so old saves backfill`);
  check(legacy.goals.stats.some((s) => s.key === k), `${k} is declared in the legacy manifest`);
  check(!TRACKS.some((tr) => tr.stat === k), `${k} binds no progressive track — it mints no achievement id`);
}

const s = defaultStats();
addRun(s, { 'legacy:crushAlarmed': 1, 'legacy:crushEscapes': 2, 'legacy:crushDeaths': 0 });
addRun(s, { 'legacy:crushAlarmed': 1, 'legacy:crushEscapes': 1, 'legacy:crushDeaths': 1 });
check(s['legacy:crushAlarmed'] === 2, 'alarmed accumulates across runs');
check(s['legacy:crushEscapes'] === 3, 'escapes accumulate across runs');
check(s['legacy:crushDeaths'] === 1, 'deaths accumulate across runs');

console.log(`crush-stats: ${pass} passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/meta/crush-stats.test.mjs`
Expected: FAIL — `legacy:crushAlarmed is a tracked stat key`.

- [ ] **Step 3: Add the keys**

In `src/meta/stats.js`, append to `STAT_KEYS`:

```js
  // Crush-depth telemetry (Deep Reefs). Diagnostics, not goals: alarmed is
  // runs where the alarm fired, deaths is runs it ended, escapes is alarms
  // survived by ascending. All additive — addRun only sums.
  'legacy:crushAlarmed', 'legacy:crushDeaths', 'legacy:crushEscapes',
```

In `src/minigames/reef/index.js`, add to the object returned by `_runDelta()`:

```js
      'legacy:crushAlarmed': this.runCrushAlarmed,
      'legacy:crushDeaths': this.runCrushDeaths,
      'legacy:crushEscapes': this.runCrushEscapes,
```

In `src/minigames/legacy/manifest.js`, append to `goals.stats`:

```js
      { key: 'legacy:crushAlarmed', label: 'Runs that hit crush depth' },
      { key: 'legacy:crushDeaths',  label: 'Divers crushed' },
      { key: 'legacy:crushEscapes', label: 'Crush alarms survived' },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/meta/crush-stats.test.mjs`
Expected: PASS.

- [ ] **Step 5: Confirm the contract tests still hold**

Run: `node tests/core/grandfathered-ids.test.mjs && node tests/minigames/manifests.test.mjs && node tests/meta/stats-new-keys.test.mjs`
Expected: PASS. If `grandfathered-ids` fails, a key was added bare — namespace it.
**Never add it to `src/core/grandfathered-ids.js`; that file throws.**

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/meta/stats.js src/minigames/reef/index.js src/minigames/legacy/manifest.js tests/meta/crush-stats.test.mjs
git commit -m "stats: track crush alarms, escapes and deaths

Namespaced diagnostics bound to no progressive track, so no Steam
achievement ids are minted. Shipped WITH the mechanic, per the Depth
Valve lesson."
```

---

### Task 11: The deep economy — counts, downward migration, metre-based values

**Files:**
- Modify: `src/config.js` — `TREASURE_TIER`, `treasureTier`,
  `treasureDepthWeight`, `chestValueAt`, `treasureValueMult`
- Modify: `src/minigames/reef/index.js` — `_generateWorld()` lines 374, 379,
  390–392, 403
- Modify: `src/entities/treasure.js` — accept a value multiplier
- Test: `tests/game/treasure-depth.test.mjs` (create; **name-first**)

**Interfaces:**
- Consumes: `worldTier`, `tier1FloorM` from Task 2.
- Produces:
  - `TREASURE_TIER: Array<{loose, shells, wrecks, bias}>`
  - `treasureTier(reef) => {loose, shells, wrecks, bias}`
  - `treasureDepthWeight(depthFrac: number, reef: number) => number` (0–1)
  - `chestValueAt(depthM: number) => number`
  - `treasureValueMult(depthM: number) => number`

- [ ] **Step 1: Write the failing test**

Create `tests/game/treasure-depth.test.mjs`:

```js
// The deep economy: treasure GROWS with tier and MIGRATES downward, and its
// value keys off ABSOLUTE METRES rather than a fraction of world height (the
// old chestValue would have paid the same at 1800 m as at 411 m). Tier 1 must
// be untouched. Run: node tests/game/treasure-depth.test.mjs

import { TREASURE_TIER, treasureTier, treasureDepthWeight, chestValueAt, treasureValueMult, tier1FloorM } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- counts grow by tier, and tier 1 is exactly what main shipped ---------
check('tier 1 still scatters 40 loose treasures', treasureTier(1).loose === 40);
check('tier 1 still spreads 34 shells',           treasureTier(1).shells === 34);
check('tier 1 still seats 4 wrecks',              treasureTier(1).wrecks === 4);
check('tier 2 is richer', treasureTier(4).loose === 70 && treasureTier(4).shells === 50 && treasureTier(4).wrecks === 6);
check('tier 3 is richer still', treasureTier(11).loose === 110);
check('tier 4 is richest', treasureTier(21).loose === 160 && treasureTier(21).wrecks === 12);
for (let i = 1; i < TREASURE_TIER.length; i++) {
  check(`tier ${i + 1} has more loose treasure than tier ${i}`, TREASURE_TIER[i].loose > TREASURE_TIER[i - 1].loose);
}
// Counts must grow SLOWER than area (7.5x), so a deep reef reads as vast and
// sparse with its wealth concentrated, not as a pinata.
check('loose treasure grows slower than the world area does',
  TREASURE_TIER[3].loose / TREASURE_TIER[0].loose < 7.5);

// --- the downward migration ------------------------------------------------
check('tier 1 placement is uniform — the regression anchor',
  treasureDepthWeight(0.1, 1) === treasureDepthWeight(0.9, 1));
check('tier 2 favours the deep', treasureDepthWeight(0.9, 4) > treasureDepthWeight(0.1, 4));
check('the bias strengthens with every tier',
  treasureDepthWeight(0.1, 21) < treasureDepthWeight(0.1, 11) &&
  treasureDepthWeight(0.1, 11) < treasureDepthWeight(0.1, 4));
check('the deepest water is always the most favoured in a biased tier',
  treasureDepthWeight(1, 21) > treasureDepthWeight(0.5, 21));
check('a weight is always a usable probability', [0, 0.5, 1].every((f) =>
  [1, 4, 11, 21].every((r) => treasureDepthWeight(f, r) >= 0 && treasureDepthWeight(f, r) <= 1)));
check('the shallows are never worth literally nothing', treasureDepthWeight(0, 21) > 0);
check('out-of-range and junk fractions clamp',
  treasureDepthWeight(-1, 21) === treasureDepthWeight(0, 21) &&
  treasureDepthWeight(2, 21) === treasureDepthWeight(1, 21) &&
  treasureDepthWeight(NaN, 21) === treasureDepthWeight(0, 21));

// --- values rebase onto absolute metres ------------------------------------
check('a surface chest is still worth 200', chestValueAt(0) === 200);
check('a chest at the tier-1 floor is still worth exactly 600 — unchanged from main',
  chestValueAt(tier1FloorM) === 600);
check('a chest at the tier-4 floor pays far more than one at the tier-1 floor',
  chestValueAt(1800) > chestValueAt(411) * 2.5);
check('chest value rises monotonically with depth', chestValueAt(900) > chestValueAt(500));

check('loose treasure inside tier-1 depths is worth exactly what it always was',
  treasureValueMult(0) === 1 && treasureValueMult(200) === 1 && treasureValueMult(tier1FloorM) === 1);
check('below the tier-1 floor the multiplier opens up', treasureValueMult(900) > 1);
check('a gem at the tier-4 floor is worth several times a shallow one',
  treasureValueMult(1800) > 2.5);
check('the multiplier rises monotonically', treasureValueMult(1500) > treasureValueMult(1000));

console.log(`ok treasure-depth.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/game/treasure-depth.test.mjs`
Expected: FAIL — no export named `TREASURE_TIER`.

- [ ] **Step 3: Add the economy functions to `src/config.js`**

Append after the world-tier block from Task 2:

```js
// --- Deep Reefs: the deep economy ------------------------------------------
// Spawn counts are ABSOLUTE, not densities, so a 7.5x larger tier-4 world would
// be drastically emptier if these did not grow. They grow more slowly than area
// on purpose: a deep reef should feel vast and sparse with its wealth
// CONCENTRATED. `bias` drives the downward migration (0 = uniform).
export const TREASURE_TIER = [
  { loose: 40,  shells: 34,  wrecks: 4,  bias: 0    },   // tier 1 — unchanged from main
  { loose: 70,  shells: 50,  wrecks: 6,  bias: 0.45 },
  { loose: 110, shells: 72,  wrecks: 9,  bias: 0.70 },
  { loose: 160, shells: 100, wrecks: 12, bias: 0.85 },
];
export function treasureTier(reef) { return TREASURE_TIER[worldTier(reef)]; }

// Pure: how much a candidate spawn point at `depthFrac` (0 = surface, 1 = floor)
// is favoured, in [0,1]. Used as a rejection weight at the existing spread() /
// randomOpen() call sites — no new spawn code. Tier 1 returns a flat 1.
export function treasureDepthWeight(depthFrac, reef) {
  const b = treasureTier(reef).bias;
  const raw = Number(depthFrac);
  const f = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  return (1 - b) + b * f * f;
}

// Pure: a chest's value at an ABSOLUTE depth. The old form was
// 200 + (y / WH) * 400, which topped out at 600 at ANY tier's floor — 1800 m
// would have paid exactly what 411 m pays. Keyed to tier1FloorM so tier-1
// payouts are bit-for-bit what they were.
export function chestValueAt(depthM) {
  const m = Math.max(0, Number(depthM) || 0);
  return 200 + Math.round((m / tier1FloorM) * 400);
}

// Pure: the value multiplier on loose coins/gems. Exactly 1 everywhere tier 1
// can reach, so tier-1 income is unchanged; it only opens up in water that
// tier 1 does not have.
export function treasureValueMult(depthM) {
  const m = Math.max(0, Number(depthM) || 0);
  return 1 + Math.max(0, m - tier1FloorM) / 700;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/game/treasure-depth.test.mjs`
Expected: PASS.

- [ ] **Step 5: Consume them in `_generateWorld`**

In `src/minigames/reef/index.js`, add `treasureTier`, `treasureDepthWeight`,
`chestValueAt`, `treasureValueMult` to the `config.js` import, then:

Replace line 374:

```js
    const chestValue = (y) => chestValueAt(metresDown(y));
```

Add a depth-biased picker just above the spawn block:

```js
    // Deep Reefs: treasure migrates downward as the tiers deepen. A candidate
    // point is kept in proportion to its depth weight, so the shallows of a
    // late reef thin out while the deep fills in. Tier 1 weights everything 1,
    // so its placement is bit-for-bit unchanged.
    const T = treasureTier(this.reef);
    const keepByDepth = (y) => Math.random() < treasureDepthWeight(y / WORLD.WH, this.reef);
    const pickDeep = (candidates) => {
      for (let tries = 0; tries < 8; tries++) {
        const c = candidates(); if (!c) return null;
        if (keepByDepth(c.y)) return c;
      }
      return candidates();
    };
```

Replace the shell spread (line 379) count `34` with `T.shells`, and the wreck
spread (line 403) count `4` with `T.wrecks`.

Replace the loose-treasure loop (lines 390–392) with:

```js
    for (let i = 0; i < T.loose; i++) {
      const c = pickDeep(() => C.randomOpen()); if (!c) continue;
      const kind = Math.random() < 0.14 + (c.y / WORLD.WH) * 0.18 ? 'gem' : 'coin';
      this.treasures.push(new Treasure(c.x, c.y, kind, treasureValueMult(metresDown(c.y))));
    }
```

- [ ] **Step 6: Let `Treasure` take a value multiplier**

In `src/entities/treasure.js`, change the constructor:

```js
  constructor(x, y, kind, valueMult = 1) {
    this.x = x; this.y = y;
    this.kind = kind;
    // Deep Reefs: loose loot is worth more the deeper it sits. The multiplier is
    // exactly 1 everywhere tier 1 can reach, so tier-1 income is unchanged.
    this.value = Math.round((VALUE[kind] ?? 60) * valueMult);
```

Leave every other `new Treasure(...)` call site alone — they default to 1.

- [ ] **Step 7: Add the relic-placement invariant**

Find where the objective relic is placed:

```bash
grep -n 'new Relic\|this.relic =' src/minigames/reef/index.js
```

Clamp its y so it never lands below the diver's crush depth — otherwise a player
who skipped the shop can generate an unwinnable reef:

```js
    // The reef's OBJECTIVE may never sit below where the diver can survive.
    // Loot below crush depth is a temptation; the thing you must have to sail
    // on is not. (Spec: "One invariant that keeps runs winnable".)
    const relicMaxY = WORLD.SURFACE + crushDepthM(this.valveLevel) * 10;
```

and use `relicMaxY` to filter the relic's candidate floors.

- [ ] **Step 8: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/config.js src/minigames/reef/index.js src/entities/treasure.js tests/game/treasure-depth.test.mjs
git commit -m "feat: the deep economy — more treasure, deeper, worth more

Counts grow by tier (slower than area), placement migrates downward, and
values key off absolute metres instead of a fraction of world height. The
objective relic never spawns below crush depth."
```

---

### Task 12: Dry Dock max-lives unlock

**Files:**
- Modify: `src/config.js` — add `LIVES`, remove `GAME.maxLives`
- Modify: `src/meta/salvage.js` — `lifeMax` and the seen-once flags
- Modify: `src/game.js:247-248` (row list) and `:289` (purchase) — the Dry Dock
- Modify: `src/minigames/reef/index.js:1634` — the 1-UP ceiling
- Test: `tests/game/life-max.test.mjs` (create; **name-first**)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LIVES: { baseMax: 3, capMax: 6, costBase: 300 }`
  - `meta.lifeMax: number` on `deepdescent.salvage.v2`
  - `meta.seen: { oxygenLine: boolean, crushLine: boolean }` (Task 13 consumes it)

- [ ] **Step 1: Write the failing test**

Create `tests/game/life-max.test.mjs`:

```js
// Max lives is a Dry Dock permanent unlock: the ceiling starts at 3 (the lives
// you begin a run with) and each Salvage purchase adds one, to a configurable
// cap of 6. This deliberately lowers the old free ceiling of 5.
// Run: node tests/game/life-max.test.mjs

import { LIVES, GAME } from '../../src/config.js';
import { defaultSalvage, loadSalvage, saveSalvage } from '../../src/meta/salvage.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const fakeStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

check('the ceiling starts at the 3 lives a run begins with', LIVES.baseMax === 3);
check('the ceiling caps at 6', LIVES.capMax === 6);
check('the cap is a config knob above the base', LIVES.capMax > LIVES.baseMax);
check('the old hardcoded GAME.maxLives is gone', GAME.maxLives === undefined);
check('a fresh save starts at the base ceiling', defaultSalvage().lifeMax === LIVES.baseMax);

// --- round-trip and clamping ----------------------------------------------
{
  const s = fakeStore();
  const st = defaultSalvage(); st.lifeMax = 5;
  saveSalvage(st, s);
  check('lifeMax survives a save/load round trip', loadSalvage(s).lifeMax === 5);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, lifeMax: 99 }));
  check('an absurd lifeMax clamps to the cap', loadSalvage(s).lifeMax === LIVES.capMax);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, lifeMax: 1 }));
  check('a too-low lifeMax clamps up to the base', loadSalvage(s).lifeMax === LIVES.baseMax);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, lifeMax: 'lots' }));
  check('a junk lifeMax falls back to the base', loadSalvage(s).lifeMax === LIVES.baseMax);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {} }));
  check('an old save with no lifeMax backfills to the base — no migration needed',
    loadSalvage(s).lifeMax === LIVES.baseMax);
}

// --- the seen-once warning flags live here too, NOT in progress.v1 --------
{
  check('a fresh save has seen neither line',
    defaultSalvage().seen.oxygenLine === false && defaultSalvage().seen.crushLine === false);
  const s = fakeStore();
  const st = defaultSalvage(); st.seen.crushLine = true;
  saveSalvage(st, s);
  const back = loadSalvage(s);
  check('a seen flag survives a round trip', back.seen.crushLine === true);
  check('an unseen flag stays false',        back.seen.oxygenLine === false);
}
{
  const s = fakeStore();
  s.setItem('deepdescent.salvage.v2', JSON.stringify({ salvage: 0, rentals: {}, slots: 2, loadout: [], reefRelics: {}, seen: 'yes' }));
  check('a junk seen bag sanitizes to all-false',
    loadSalvage(s).seen.oxygenLine === false && loadSalvage(s).seen.crushLine === false);
}

console.log(`ok life-max.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/game/life-max.test.mjs`
Expected: FAIL — no export named `LIVES`.

- [ ] **Step 3: Add `LIVES` and remove `GAME.maxLives`**

In `src/config.js`, delete this line from `GAME`:

```js
  maxLives: 5,          // extra lives can't bank past this — no snowball
```

and add:

```js
// Max lives is a Dry Dock permanent unlock, not a free ceiling. It starts at
// the 3 lives a run begins with; each Salvage purchase adds one, to capMax.
// This deliberately lowers the old free ceiling of 5 — a giveaway becomes a
// meta-progression ladder (spec locked decision 10). Priced dearer than a
// Salvage-Log slot (200 base) because a life is worth more than a relic slot.
export const LIVES = { baseMax: 3, capMax: 6, costBase: 300 };
```

- [ ] **Step 4: Persist `lifeMax` and `seen` in `src/meta/salvage.js`**

Add `LIVES` to the `config.js` import, then:

```js
function clampLifeMax(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return LIVES.baseMax;
  return Math.min(LIVES.capMax, Math.max(LIVES.baseMax, Math.round(n)));
}

// The one-time warning modals' seen flags. They live HERE and not in
// deepdescent.progress.v1, which sanitizes to { earned: [...] } filtered
// against ID_SET on every save and would silently discard them.
function sanitizeSeen(o) {
  return {
    oxygenLine: !!(o && typeof o === 'object' && o.oxygenLine === true),
    crushLine:  !!(o && typeof o === 'object' && o.crushLine === true),
  };
}
```

In `defaultSalvage()`:

```js
  return { salvage: 0, rentals: {}, slots: SALVAGE.startSlots, loadout: [], reefRelics: {},
           lifeMax: LIVES.baseMax, seen: { oxygenLine: false, crushLine: false } };
```

In `loadSalvage()`'s returned object add:

```js
    lifeMax: clampLifeMax(merged.lifeMax),
    seen: sanitizeSeen(merged.seen),
```

In `saveSalvage()` extend the destructure and the serialised object:

```js
    const { salvage, rentals, slots, loadout, reefRelics, lifeMax, seen } = state;
    s.setItem(KEY_V2, JSON.stringify({ salvage, rentals: rentals || {}, slots, loadout,
      reefRelics: reefRelics || {}, lifeMax: clampLifeMax(lifeMax), seen: sanitizeSeen(seen) }));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tests/game/life-max.test.mjs`
Expected: PASS.

- [ ] **Step 6: Sell it in the Dry Dock and honour it in the run**

In `src/game.js`, after the loadout-slot row (line 247–248), add a matching row:

```js
    if (this.meta.lifeMax < LIVES.capMax) {
      rows.push({ kind: 'life', id: 'life',
        label: `❤️ Max lives (${this.meta.lifeMax} → ${this.meta.lifeMax + 1})`,
        cost: this._dblCost(LIVES.costBase, this.meta.lifeMax - LIVES.baseMax) });
    }
```

and in the purchase handler beside the `slot` branch (line 289):

```js
    } else if (row.kind === 'life') {
      this.meta.salvage -= row.cost; this.meta.lifeMax += 1; saveSalvage(this.meta); this.audio.bank();
```

Add `LIVES` to `game.js`'s `config.js` import.

In `src/minigames/reef/index.js:1634`, replace `GAME.maxLives` with the unlocked
ceiling:

```js
    const lifeCeiling = this.meta.lifeMax || LIVES.baseMax;
    while (this.lives < lifeCeiling && this.score >= this.nextLifeScore) { this.lives += 1; this.nextLifeScore += GAME.lifeScoreStep; this.oneUpT = 2.2; this.audio.bank(); }
```

Add `LIVES` to the reef's `config.js` import.

- [ ] **Step 7: Confirm nothing still reads `GAME.maxLives`**

```bash
grep -rn 'maxLives' src/ tests/
```

Expected: only `LIVES.capMax` / `lifeMax` hits.

- [ ] **Step 8: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/config.js src/meta/salvage.js src/game.js src/minigames/reef/index.js tests/game/life-max.test.mjs
git commit -m "feat: max lives is a Dry Dock unlock, 3 -> 6

Replaces the free GAME.maxLives ceiling of 5. lifeMax and the warning
seen-flags persist in salvage.v2 (progress.v1 would discard them)."
```

---

### Task 13: First-encounter warning modals

**Files:**
- Modify: `src/minigames/reef/index.js` — a `warn` shell state and the trigger
- Test: `tests/game/depth-warning.test.mjs` (create; **name-first**)

**Interfaces:**
- Consumes: `meta.seen` from Task 12; `DEPTH`, `crushDepthM` from Task 5.
- Produces: `reef._warnKind: 'oxygenLine' | 'crushLine' | null` and a
  `_shell.state === 'warn'` pause.

- [ ] **Step 1: Write the failing test**

Create `tests/game/depth-warning.test.mjs`:

```js
// The one-time warning modals. Each fires the FIRST time the diver approaches a
// danger line, pauses the action, and never fires again — the flag persists in
// salvage.v2. Run: node tests/game/depth-warning.test.mjs

import { DEPTH, crushDepthM } from '../../src/config.js';
import { warnKindFor } from '../../src/minigames/reef/warnings.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const unseen = () => ({ oxygenLine: false, crushLine: false });

check('nothing to warn about in the shallows', warnKindFor(50, 0, unseen()) === null);
check('approaching the oxygen line warns once',
  warnKindFor(DEPTH.oxygenLineM - 10, 0, unseen()) === 'oxygenLine');
check('already-seen oxygen line does not warn again',
  warnKindFor(DEPTH.oxygenLineM - 10, 0, { oxygenLine: true, crushLine: false }) === null);
check('approaching crush depth warns',
  warnKindFor(crushDepthM(0) - DEPTH.approachWarnM + 5, 0, unseen()) === 'crushLine');
check('the crush warning outranks the oxygen one when both are due',
  warnKindFor(crushDepthM(0) - 5, 0, unseen()) === 'crushLine');
check('a higher Valve level moves the crush warning deeper',
  warnKindFor(crushDepthM(0) - 5, 3, { oxygenLine: true, crushLine: false }) === null);
check('and it still fires at that level\'s own line',
  warnKindFor(crushDepthM(3) - 5, 3, { oxygenLine: true, crushLine: false }) === 'crushLine');
check('both seen means silence forever',
  warnKindFor(crushDepthM(0) + 100, 0, { oxygenLine: true, crushLine: true }) === null);

console.log(`ok depth-warning.test.mjs (${passed} checks)`);
if (failed > 0) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/game/depth-warning.test.mjs`
Expected: FAIL — cannot find module `src/minigames/reef/warnings.js`.

- [ ] **Step 3: Create `src/minigames/reef/warnings.js`**

```js
// @ts-check
// Which one-time depth warning (if any) is due right now. Pure and split into
// its own module so the decision is asserted without a canvas or a reef.
import { DEPTH, crushDepthM } from '../../config.js';

export const WARN_COPY = {
  oxygenLine: {
    title: '⚠  OXYGEN LINE',
    lines: [
      `Below ${DEPTH.oxygenLineM} m the water takes your air far faster.`,
      'A bigger Air Tank buys you the time to work down here.',
      'The gauge shows the line in amber.',
    ],
  },
  crushLine: {
    title: '☠  CRUSH DEPTH',
    lines: [
      'Below the red line the pressure will kill you.',
      `You have ${DEPTH.crushTimer} seconds to climb back above it.`,
      'A deeper Depth Valve moves the line down. Nothing else will.',
    ],
  },
};

// depthM: the diver's depth. valveLevel: 0-3. seen: { oxygenLine, crushLine }.
// Returns the warning to show, or null. The crush warning outranks the oxygen
// one — it is the lethal one.
export function warnKindFor(depthM, valveLevel, seen) {
  if (!seen.crushLine && depthM > crushDepthM(valveLevel) - DEPTH.approachWarnM) return 'crushLine';
  if (!seen.oxygenLine && depthM > DEPTH.oxygenLineM - DEPTH.approachWarnM) return 'oxygenLine';
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/game/depth-warning.test.mjs`
Expected: PASS — `ok depth-warning.test.mjs (8 checks)`

- [ ] **Step 5: Wire the pause into the reef**

In `src/minigames/reef/index.js`, import `warnKindFor` and `WARN_COPY`. In
`update()`, just before the crush block:

```js
      if (this._shell.state === 'playing' && this.zone === 'reef') {
        const kind = warnKindFor(depthM, this.valveLevel, this.meta.seen);
        if (kind) {
          this.meta.seen[kind] = true; saveSalvage(this.meta);
          this._warnKind = kind; this._shell.state = 'warn';
          this.audio.setKlaxon(false);
          this.input.endFrame(); return;
        }
      }
```

Dismiss it wherever the pause state is dismissed — follow the existing `paused`
handling and add a `warn` branch that returns to `'playing'` on confirm.

Render it with the existing `_overlay(...)` helper (used for `PAUSED` at line
2284), passing `WARN_COPY[this._warnKind].title` and its lines.

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add src/minigames/reef/warnings.js src/minigames/reef/index.js tests/game/depth-warning.test.mjs
git commit -m "feat: one-time modals warn at the oxygen and crush lines

Pause on first approach to each, flags persisted in salvage.v2. The crush
warning outranks the oxygen one."
```

---

### Task 14: Browser pass, minimap aspect, deploy

**Files:**
- Modify: `src/minigames/reef/index.js` — `_minimap` (the panel at `x >= W-136`,
  `y 124..309`)
- Modify: `src/version.js` — `BUILD`

**Interfaces:**
- Consumes: everything.
- Produces: a deployed, verified build.

- [ ] **Step 1: Fix the minimap aspect**

The panel is a fixed ~136 × 185 box. The world goes from 46:70 (tier 1) to
80:302 (tier 4), so a stretched blit makes a tier-4 map unreadable. Letterbox it:
compute the scale as `Math.min(panelW / cave.GW, panelH / cave.GH)` and centre
the result inside the panel. Read `cave.GW`/`cave.GH` live.

- [ ] **Step 2: Add a temporary dev reef-skip hook**

Deep tiers start at reef 4, 11 and 21 and reaching them honestly takes hours. Add
a hook guarded so it can never ship enabled — e.g. read `?reef=21` from
`location.search` in `main.js` and pass it as the run's `startReef`, logging
loudly when used. Note in the commit that this is a dev affordance.

- [ ] **Step 3: Serve and drive the real game**

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/?reef=21` and confirm, in order:

- The world is visibly taller and wider; the minimap is letterboxed, not stretched.
- The gauge shows an amber band and a red band, with sane tick labels at 1800 m.
- Descending past ~210 m raises the **oxygen** modal once; it never returns.
- Approaching the red band makes it flash.
- Crossing it raises the **crush** modal once, then the klaxon sounds and the
  countdown runs on the gauge.
- Ascending silences the klaxon and the timer recovers *slowly*.
- Staying under kills the run with cause `crushed`, ignoring remaining lives.
- The shop at reef 21 offers `Depth Valve → Lv1`; buying it moves the red band
  down and the shop then offers Lv2.
- Deep treasure is dense, shallow treasure is sparse.
- The Dry Dock offers `❤️ Max lives`.

**Then make a judgement call the tests cannot make** (spec Risk 4): an 1800 m
column is ~4.4× today's vertical travel. Swim from the tier-4 floor to the
surface and decide whether the ascent is *tense* or merely *tedious*. If it is
tedious, the fix is deeper bell placement or a faster ascent — **not** a shorter
world, which would undo the whole spec. Record the verdict in the PR body; it is
the first thing a balance pass will want.

Then repeat at `?reef=1` and confirm reefs 1–3 look and feel exactly as before.

- [ ] **Step 4: Test with touch emulation**

Open devtools, toggle device emulation, and repeat the crush sequence. The shell
must read dive run-state off `this._reef`, not `this.*` — getting this wrong has
frozen touch devices twice.

- [ ] **Step 5: Read the telemetry**

In the console:

```js
JSON.parse(localStorage['deepdescent.stats.v1'])
```

Confirm `legacy:crushAlarmed`, `legacy:crushDeaths` and `legacy:crushEscapes`
moved, and that `deepdescent.salvage.v2` carries `lifeMax` and `seen`.

- [ ] **Step 6: Remove the dev hook, bump `BUILD`, and ship**

In `src/version.js`:

```js
export const BUILD = 'deep-reefs-2026-09-02';
```

Bump `ENGINE_VERSION` too — `WORLD.WW`/`WORLD.WH` becoming live is a change to a
shared system that `host.world` exposes.

```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
git add -A && git status   # check nothing stray (Playwright writes .playwright-mcp/, not gitignored)
git commit -m "feat: ship Deep Reefs — four world tiers, crush depth, the deep economy"
git push -u origin feat/deep-reefs
gh pr create --fill
```

After the PR merges to `main`, confirm the deploy landed:

```bash
curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD
```

Expected: `deep-reefs-2026-09-02`, matching `src/version.js`. A stale value means
the browser or the deploy is serving old scripts.

---

## Notes for whoever executes this

- **Task 1 gates everything.** If tier-4 cave generation is slow, stop and report
  rather than building on it.
- **Tasks 2–5 are strictly sequential** (each consumes the last's exports).
  Tasks 8, 9, 10 and 12 are mutually independent once Task 7 lands and can be
  parallelised across agents.
- The single easiest way to break this feature invisibly is to capture
  `WORLD.WW`/`WORLD.WH` at module scope. The grep in Task 2 Step 6 is worth
  re-running after every task.
