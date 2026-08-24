# Reef MiniGame Extraction (Platform P6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this plan — see note) or superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the reef dive loop — plus the cave-reusing zones (abyss+mini-sub, temple, whale belly) and the extraction timer — out of the 3,224-line `src/game.js` god-object into a new `src/minigames/reef/index.js` MiniGame, leaving `game.js` as the Core shell.

**Architecture:** Nested delegated-module seam (same as whirlpool P4 / stage P5). `game.js` keeps the top-level `state` machine + menu/shop/dry-dock/sail/game-over screens and builds `this._reef = makeReef({host, shell, ctx, bg})`; it delegates the `'playing'` tick/render to the reef module. The reef module **owns the ephemeral run-state**; the shell's run-coupled screens read/act on it through a small `this._reef.*` facade, and the reef reaches back for the handful of shell-owned things (`state`, `controlScheme`, `hi`) through a `shell` facade — mirroring the P4/P5 `reef` facade, just one level up. The reef module now builds and owns the nested whirlpool/stage modules.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D, no build step. Tests are plain `.mjs` files with a hand-rolled `check()` harness, run with `node --test 'tests/**/*.mjs'` (and individually via `node tests/<file>`).

**Spec:** `docs/superpowers/specs/2026-08-23-reef-minigame-extraction-p6-design.md` (read it alongside this plan).

## Execution note

This is a **mechanical equivalence-preserving extraction of ~1,800 interwoven lines**, not new-feature TDD. The `update`/`draw` loop is a single state machine whose zone branches cannot be half-moved, so the core move (Task 2) is one atomic, additive cutover verified by the **existing suite staying green + browser playthrough parity vs `baseline/v1.0-pre-platform`** — the "test" is characterization/parity, not red-green on new behavior. Recommend **inline execution** (one engineer holding the whole file in context) over per-task fresh subagents; the deletion (Task 3), the new seam test (Task 4), and verify/ship (Task 5) are cleanly separable checkpoints.

## Global Constraints

- **No build step.** Plain ES modules only; no transpile, no new deps. (Retired only at P8+ per migration plan.)
- **Byte-identical behavior to baseline** `baseline/v1.0-pre-platform`. This is a code move: preserve award order, RNG call order, persistence keys (the four `.v1` keys), and frame-level behavior. Diff against the tag when unsure: `git diff baseline/v1.0-pre-platform -- src/game.js`.
- **Persistent meta is untouched.** Salvage → `host.economy`; badges/ranks/lifetime stats → `host.progression`; Steam → `host.achievements`. Do not change what is credited or the keys.
- **Facade style** matches P4/P5: a plain object of `get x(){return g.x}` / `set x(v){g.x=v}` closures over `const g = this`, plus verb methods. Small and explicit.
- **Suite gate:** `node --test 'tests/**/*.mjs'` must report `fail 0` at the end of every task. Baseline is 62 pass.
- **Browser-verify on a FRESH PORT** every time (ES-module cache gotcha — see memory `reef-intro-whirlpool-lives`).
- **Ship pipeline:** work on branch `feat/platform-p6` (already created); final `--no-ff` merge to `main` + push in Task 5.

---

## File structure

- **Create** `src/minigames/reef/index.js` — the reef MiniGame: `makeReef({host, shell, ctx, bg})` → a `Reef` instance implementing the MiniGame shape (`id/enter/update/render/exit`) plus the run-state, dive loop, the three cave zones, mini-sub, extraction timer, and the nested `_whirl`/`_stage` with their `_whirlReef`/`_stageReef` facades. Owns the run-state.
- **Modify** `src/game.js` — reduced to the shell: `state` machine, `onAction` router, menu/help/Trophy-Wall/shop/dry-dock/sail/game-over screens, control schemes, services + engine wiring, and `this._reef` construction + delegation. Builds the `shell` facade it hands the reef.
- **Create** `tests/minigames/reef.test.mjs` — reef module logic against a stub host/shell.
- **Create** `tests/minigames/reef-seam.test.mjs` — drives a real `Game` through the reef module via the facades.
- **Modify** `tests/minigames/whirlpool-seam.test.mjs`, `tests/minigames/stage-seam.test.mjs` — update for the reparented facades if they assert on `game._whirl`/`game._stage` (now built by the reef module).
- **Modify** `src/version.js` — `BUILD='platform-p6'`.

## The facade contracts (define once, used by every task)

**`shell` facade** (built by `Game._reefShell()`, held by the reef as `this._shell`) — what the reef reads/writes on the shell:
- `get/set state` — the top-level machine state; the reef sets it on dive transitions (`'gameover'`, `'shop'`, `'drydock'`, `'sail'`, `'paused'`, `'playing'`).
- `get controlScheme` — for HUD hints / control prompts.
- `get/set hi`, `get/set hiReef`, `saveHi()` — the persisted best score/reef (menu displays them; reef updates at game-over; shell owns the `HI_KEY`/`HI_REEF_KEY` persistence).

**`this._reef` public surface** — what the shell's router + screens read/call:
- MiniGame shape: `enter(host)`, `update(dt)`, `render(ctx)`, `exit()`, plus `start(startReef)`.
- Router hooks: `togglePause()`, `resume()` (sets fire-grace), `shopBuy()`, `dryDockAct()` (called from `Game.onAction`).
- Screen reads: `score`, `gold`, `lives`, `reef` (number), `reefName`, `carried`, `carriedPearls`, `won`, `newHi`, `deathCause`, `lastPayout`, `newBadges`, `newTiers`, `canSail`, `sailT`, `shopSel`, `shopDeny`, `shopItems()`, `shopRow(i)`, `dryDockSel`, `dryDockRows()`, `ddRow(i)`, `finalStats()`.
- Screen actions: `shopMove(dir)`, `dryDockMove(dir)`, `setSail()`.

(Exact member set may grow by one or two during the move; keep it minimal — anything only the dive uses stays private to the reef.)

## Member move manifest (from spec §3a — the reef module receives ALL of these)

Move verbatim from `Game` into `Reef`, rewiring per the rules below:

- **Lifecycle/state:** `start`, `_generateWorld`, `_newReef`, `_setSail`, `_bankLoot`, `_win`, `_newReefName`, and the game-over gameplay half (`_gameOver` split — see Task 2 step), `_runStats`, `_runDelta`, plus every dive run-state field the ctor/`start` set (score, gold, lives, carried, carriedPearls, loadout `owned/weapons/weaponIdx/weaponLevel/*Ammo*/armedCharge/flares/torch*`, buffs `shieldT/speedT/magnetT/buffT`, all entity arrays, `zone`/reef-name/theme/goal/banked, `t/shake/flash/bankPulse/zoneFade/dockHold/sailT`, relic run-flags via `applyLoadout`, life/badge run-counters, aim state, `_fireGrace`).
- **In-dive tick/render:** the `update(dt)` playing branch + all zone-entry/exit detection currently inline in it, `draw()` playing render + inline zone backdrops/tints, `_collisions`, `_explode`, `_hit`, `_loseLife`, `get weapon`, `_cycleWeapon`, `fire`, `_fire*`, `_spear`, `_acquireAimTarget`, `_nearestThreat`, `_angleDiff`, `_angleToward`, `_damageCreature`, `_applyPowerUp`, `_makePowerups`, `_openCrate`, `_makeCurrents`, `_hud`, `_minimap`, `_weaponCarousel`, `_puFlourish`, `_enqueueToast` + toast queue + reef-intro flashes, `_orientShells`, `_clearCreaturesNearPortals`, `_placeDiver`, `_blockDoor`, `_exitLocator`.
- **Cave zones:** `_generateTemple`, `_generateAbyss`, `_generateBelly`, `_snapshotReef`, `_restoreReef`, `_enterWhale`/`_exitWhale`, `_enterTemple`/`_exitTemple`, `_enterAbyss`/`_exitAbyss`, `_ejectFromAbyss`, `_nearestExit`.
- **Mini-sub:** `hasSub`/`inSub`/`subArmor`, `_subLighting`, `_abyssEntryCarried`/`_abyssEntryPearls`, sub weapon/movement/oxygen weaving (inside the moved methods).
- **Extraction:** `_tripExtraction`, `_updateExtraction`, `extractActive`/`extractT`/`extractLapsed`.
- **Shop/dry-dock logic:** `_shopItems`, `_shopRow`, `_shopBuy`, `_openShop`, `_closeShop`, `_shopMove`, `_dblCost`, `_dryDockRows`, `_ddRow`, `_openDryDock`, `_closeDryDock`, `_dryDockMove`, `_dryDockAct` (they mutate loadout/gold/relics — reef-owned; the shell only renders `_shopScreen`/`_dryDockScreen`). `_openShop`/`_openDryDock`/`_setSail` flip `this._shell.state`.
- **Nested modules:** `_whirlReef`, `_stageReef`, the `mgHost` bundle, and the `_whirl`/`_stage` construction.

**Stays in the shell (`game.js`):** `onAction` (delegating), `_menu`/`_menuButtons`/`_cycleStartReef`, `_help*`, `_badgesScreen`/`_openBadges`/`_closeBadges`, `_shopScreen`/`_dryDockScreen`/`_sailScreen`/`_gameOverScreen` (render only), `_setScheme`/`_cycleScheme`/`_autoDetectScheme`/`_key`/`_applyHintStrip`, `_overlay`/`_panel`/`_keycap`/`_text`/`_fmtStat`/`_mmss`, `_syncTouchButtons`/`_touchBtn`, `hi`/`hiReef`/persistence, `state`, `controlScheme`, services/world refs, `pendingStartReef`, `_reefShell()`, and the `setViewport`/module-level viewport exports.

## Mechanical rewrite rules (apply to every moved line)

1. `this.audio` → `host.audio`; `this.input` → `host.input`; `this.particles` → `host.particles`. (Store `this.host = host` in the Reef ctor.)
2. `this.ctx` / `this.bg` → unchanged (passed into `makeReef` and stored on the Reef).
3. `this.diver/camX/camY/air/airMax` → unchanged; install the same `Object.defineProperty` instance accessors routing to `host.world` at the top of the Reef ctor (copy the block from game.js:148-157).
4. Meta/persistent writes → services: `this.meta.salvage += x; saveSalvage(...)` → `host.economy.earn({ salvage: x })` (**includes the abyss exit-bonus at game.js:1704** — the spec's one salvage cleanup); badges/stats/Steam at game-over → `host.progression.recordRun(...)` / `host.achievements.unlock(...)`, preserving the exact order `_gameOver` used.
5. Shell-owned reads/writes → `this._shell.*`: `this.state` → `this._shell.state`, `this.controlScheme` → `this._shell.controlScheme`, `this.hi`/`this.hiReef` → `this._shell.hi`/`this._shell.hiReef` (+ `this._shell.saveHi()`).
6. Everything else (reef-owned fields, entity arrays, dive helpers) keeps `this.` — `this` is now the Reef.
7. Inside `_whirlReef`/`_stageReef`, `const g = this` continues to resolve to the Reef (all referenced members moved with it); the sole exception is `controlScheme` → `this._shell.controlScheme`.

---

## Task 1: Scaffold the reef module + facades + ctor wiring (no delegation yet)

**Files:**
- Create: `src/minigames/reef/index.js`
- Create: `tests/minigames/reef.test.mjs`
- Modify: `src/game.js` (ctor: add `_reefShell()` + build `this._reef`; do NOT delegate)

**Interfaces:**
- Produces: `makeReef({host, shell, ctx, bg})` → object with `{ id: 'reef', enter(){}, update(){}, render(){}, exit(){} }` (stubs this task); `Game._reefShell()` → the `shell` facade object.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing module-shape test**

```js
// tests/minigames/reef.test.mjs
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null };
import { makeReef } from '../../src/minigames/reef/index.js';
let passed = 0, failed = 0;
const check = (n, c) => c ? passed++ : (failed++, console.error(`  FAIL: ${n}`));
const noop = new Proxy({}, { get: () => () => {} });
const host = { audio: noop, input: noop, particles: noop, viewport: { W: 900, H: 600 },
  world: { diver: {}, camX: 0, camY: 0, air: 100, airMax: 100, placeDiver() {} },
  economy: { earn() {}, state: {} }, progression: { recordRun: () => ({ newBadges: [], freshTiers: [] }) },
  achievements: { unlock() {} } };
const shell = { state: 'menu', controlScheme: 'keys', hi: 0, hiReef: 1, saveHi() {} };
const reef = makeReef({ host, shell, ctx: noop, bg: noop });
check('id is reef', reef.id === 'reef');
check('has MiniGame shape', ['enter','update','render','exit'].every(m => typeof reef[m] === 'function'));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/minigames/reef.test.mjs`
Expected: FAIL — `Cannot find module .../src/minigames/reef/index.js`.

- [ ] **Step 3: Create the module skeleton**

Create `src/minigames/reef/index.js` with a top-of-file doc comment (mirroring `stage/index.js`: SHAPE = nested reef-driven MiniGame; BOUNDARY = host.world/economy/progression/achievements + the `shell` facade; note it OWNS the run-state and builds the nested whirl/stage). Define `class Reef` with a ctor storing `{host, shell, ctx, bg}` as `this.host/_shell/ctx/bg` and stub `enter/update/render/exit`. Export `export function makeReef({ host, shell, ctx, bg }) { return new Reef({ host, shell, ctx, bg }); }` and set `id = 'reef'` on the instance.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/minigames/reef.test.mjs`  → Expected: `2 passed, 0 failed`.

- [ ] **Step 5: Wire construction in game.js (no delegation)**

In `game.js`, import `makeReef`. Add a `_reefShell()` method returning the `shell` facade (per the contract above). In the ctor, after `_whirl`/`_stage` are built, add:
```js
this._reef = (world && services)
  ? makeReef({ host: mgHost, shell: this._reefShell(), ctx: this.ctx, bg: this.bg })
  : null;
```
Do NOT call it from `update`/`draw` yet. (`mgHost` will be moved into the reef in Task 2; for now the reef stub ignores it.)

- [ ] **Step 6: Run the full suite**

Run: `node --test 'tests/**/*.mjs'`  → Expected: `fail 0` (now 63 files pass — nothing behavioral changed).

- [ ] **Step 7: Commit**

```bash
git add src/minigames/reef/index.js tests/minigames/reef.test.mjs src/game.js
git commit -m "Platform P6 T1: scaffold reef MiniGame module + shell facade + ctor wiring"
```

---

## Task 2: Port the full dive engine into the reef module + wire delegation (game.js code left in place)

This is the atomic cutover. Behavior flows through the reef module by the end; `game.js`'s original dive methods are left in place as dead code (deleted in Task 3) so this diff is **additive + delegation wiring** and easy to review against the originals.

**Files:**
- Modify: `src/minigames/reef/index.js` (port all members from the manifest)
- Modify: `src/game.js` (delegate `update`/`draw`/`onAction`/screens to `this._reef`; move `mgHost` + `_whirl`/`_stage` construction into the reef)
- Modify: `tests/minigames/whirlpool-seam.test.mjs`, `tests/minigames/stage-seam.test.mjs` (if they reach `game._whirl`/`game._stage`, point at `game._reef._whirl`/`._stage`)

**Interfaces:**
- Produces: the full `this._reef` public surface + `shell` facade contract above.
- Consumes: `host.world/economy/progression/achievements/audio/input/particles/viewport`, the `shell` facade, `ctx`, `bg`.

- [ ] **Step 1: Port state + lifecycle + core loop into `Reef`**

Move (copy) into `Reef`, per the manifest and the six rewrite rules: all dive run-state fields (ctor + a `start()` that does the run reset), `_generateWorld` + world-gen helpers, the `update(dt)` playing branch (rename the method `update`; it no longer has the menu/shop/sail/gameover branches — those stay in the shell), `draw()`→`render(ctx)` playing render (store `this.ctx = ctx` at entry so the moved draw helpers using `this.ctx` work), and every combat/loot/weapon/HUD/minimap/collision helper. Install the world accessors in the Reef ctor.

- [ ] **Step 2: Port the three cave zones + mini-sub + extraction**

Move the zone generators, snapshot/restore, enter/exit, `_ejectFromAbyss`, `_nearestExit`, mini-sub weaving, `_subLighting`, and the extraction timer. Route the abyss exit-bonus through `host.economy.earn({ salvage })` (rewrite rule 4). Keep the inline zone branches inside the moved `update`/`render`.

- [ ] **Step 3: Move the nested whirl/stage + their facades into the reef**

Move `mgHost`, `_whirlReef`, `_stageReef`, and the `_whirl`/`_stage` construction into the `Reef` ctor. Their facade closures now close over the Reef (`const g = this`); change only `controlScheme` → `this._shell.controlScheme`. Remove the `_whirl`/`_stage`/`_whirlReef`/`_stageReef`/`mgHost` build from the `Game` ctor.

- [ ] **Step 4: Split game-over into gameplay (reef) + render (shell)**

In `Reef`, port the `_gameOver` logic: freeze run state, compute `_runStats`/`_runDelta`, credit via `host.progression.recordRun` / `host.economy.earn` / `host.achievements` in the **same order** as the original, store `won`/`newHi`/`deathCause`/`lastPayout`/`newBadges`/`newTiers`, update `this._shell.hi`/`hiReef` + `this._shell.saveHi()`, and set `this._shell.state = 'gameover'`. Expose `finalStats()` + the individual reads. The shell's `_gameOverScreen` reads them via `this._reef`.

- [ ] **Step 5: Wire the shell router to delegate**

In `Game.update(dt)`: keep the top-level `switch(state)`; for `'playing'` call `this._reef.update(dt)`; the reef sets `this._shell.state` on transitions (gameover/shop/sail), so the shell just reads it next frame. In `Game.draw()`: for `'playing'` call `this._reef.render(this.ctx)`; keep the screen renders. In `Game.onAction()`: `'shop' → this._reef.shopBuy()`, `'drydock' → this._reef.dryDockAct()`, `'paused' → { this.state='playing'; this._reef.resume(); }`, `'playing' → this.state='paused'`, `'menu'/'gameover' → this._reef.start(this.pendingStartReef)` (which also sets state to `'playing'`). Point `_shopScreen`/`_dryDockScreen`/`_sailScreen`/`_gameOverScreen` at `this._reef` reads; `_shopMove`/`_dryDockMove` → `this._reef.shopMove/dryDockMove`. `frame()` in `main.js` reads `game.camX`/`game.camY` for ambient bubbles on the menu — those accessors still resolve on `Game` (world is shared) so `main.js` is unchanged.

- [ ] **Step 6: Update the whirl/stage seam tests for reparenting**

If `whirlpool-seam.test.mjs` / `stage-seam.test.mjs` reference `game._whirl` / `game._stage`, change to `game._reef._whirl` / `game._reef._stage`. Run each: `node tests/minigames/whirlpool-seam.test.mjs` and `node tests/minigames/stage-seam.test.mjs` → both `0 failed`.

- [ ] **Step 7: Run the full suite**

Run: `node --test 'tests/**/*.mjs'` → Expected: `fail 0`. If red, diff the reef method against its `game.js` original (still present) to find the divergence.

- [ ] **Step 8: Commit**

```bash
git add src/minigames/reef/index.js src/game.js tests/minigames/whirlpool-seam.test.mjs tests/minigames/stage-seam.test.mjs
git commit -m "Platform P6 T2: port dive loop + cave zones + mini-sub + extraction into reef module; delegate"
```

---

## Task 3: Delete the now-dead dive code + unused imports from game.js

Pure deletion; `game.js` becomes the shell. The reef module already carries every moved member.

**Files:**
- Modify: `src/game.js`

- [ ] **Step 1: Delete the migrated methods + fields from `Game`**

Remove every member in the "move manifest" from `Game` (they now live only in `Reef`). Keep the "stays in the shell" list. Delete dive run-state field initializations from the `Game` ctor/`start` (the shell no longer has `start`; menu→dive goes through `this._reef.start`).

- [ ] **Step 2: Drop now-unused imports**

Remove imports only the dive code used (entities, gameplay config bags, render props for zones/sub, `makeWhirlpool`/`makeStage` — now imported by the reef module, and `applyLoadout`/relic gameplay helpers). Keep shell imports (controls, meta persistence used by menu/Trophy Wall, viewport/config the shell still references). Grep to confirm nothing dangling: `node --check src/game.js`.

- [ ] **Step 3: Run the full suite**

Run: `node --test 'tests/**/*.mjs'` → Expected: `fail 0`.

- [ ] **Step 4: Sanity-check the shrink**

Run: `wc -l src/game.js src/minigames/reef/index.js` — game.js should be markedly smaller (target: gameplay gone; ~1,000–1,400 lines of shell), reef module correspondingly large.

- [ ] **Step 5: Commit**

```bash
git add src/game.js
git commit -m "Platform P6 T3: delete migrated dive code + dead imports from game.js (now the shell)"
```

---

## Task 4: Add the reef seam test (real Game driven through the reef module)

**Files:**
- Create: `tests/minigames/reef-seam.test.mjs`

**Interfaces:**
- Consumes: `Game` (from `src/game.js`), `makeDiverWorld`, minimal Core services (mirror `whirlpool-seam.test.mjs`'s setup).

- [ ] **Step 1: Write the seam test**

Following `whirlpool-seam.test.mjs`'s harness (inert deps, real `makeDiverWorld`, minimal economy/progression), construct a real `Game` with world + services and assert, via the facades:
```
- game._reef exists and game._reef !== null
- run-state ownership: game._reef.score / .lives live on the reef, not on game
- shared world: driving game._reef.update(dt) moves game.diver === host.world.diver
- shared wallet: a reef salvage credit reaches host.economy.state (same wallet)
- transition signal: forcing a death sets game.state === 'gameover' via the shell facade
- nested modules: game._reef._whirl and game._reef._stage exist and enter from the reef
```

- [ ] **Step 2: Run it**

Run: `node tests/minigames/reef-seam.test.mjs` → Expected: all pass, `0 failed`. (Iterate the assertions against the real seam if any is mis-stated — this test documents the true wiring.)

- [ ] **Step 3: Run the full suite**

Run: `node --test 'tests/**/*.mjs'` → Expected: `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add tests/minigames/reef-seam.test.mjs
git commit -m "Platform P6 T4: reef seam test — real Game driven through the reef module"
```

---

## Task 5: Browser-verify full playthrough parity + ship

**Files:**
- Modify: `src/version.js` (`BUILD='platform-p6'`)
- Modify: memory `platform-migration.md` + `docs/platform/migration-plan.md` (Phase 6 → SHIPPED)

- [ ] **Step 1: Bump the build marker**

Set `export const BUILD = 'platform-p6';` in `src/version.js`.

- [ ] **Step 2: Serve on a FRESH PORT**

Run (background): `python3 -m http.server 8106 --directory .` (a port not used before — ES-module cache gotcha). Open `http://localhost:8106/` (assuming `index.html` at repo root; confirm the entry path).

- [ ] **Step 3: Full playthrough parity check (browser)**

Drive via Chrome automation or by hand; confirm zero console errors and boot banner shows `platform-p6`. Exercise the full loop and each zone:
```
- Menu → start; reef dive plays identically (diver, air, camera, enemies, loot, banking).
- Abyss: board mini-sub (net-only, sub movement/oxygen), first loot arms the extraction timer, extract at a hatch pays the salvage bonus (now via economy), hull-breach ejects without a life loss.
- Temple: key → door → treasures → exit.
- Whale belly: swallow → loot → exit.
- Whirlpool: entry, 3 hull lives, tier salvage, bail-out restores the reef.
- Stage: enter → platforming → a hit costs a run-life → forward exit completes.
- Shop + dry-dock: buy weapon/ammo/relic, gold/loadout update; sail to next reef keeps score/lives.
- Death → game-over screen (score/payout/new badges) → badges/Trophy Wall → back to menu.
- Both control schemes + both themes render clean.
```
If any divergence: `git diff baseline/v1.0-pre-platform -- src/game.js` and compare the reef method to the baseline original.

- [ ] **Step 4: Run the full suite once more**

Run: `node --test 'tests/**/*.mjs'` → Expected: `fail 0`.

- [ ] **Step 5: Commit the build bump + doc updates**

Update `docs/platform/migration-plan.md` Phase 6 → SHIPPED (commit hash, suite count, BUILD). Then:
```bash
git add src/version.js docs/platform/migration-plan.md
git commit -m "Platform P6: reef extracted as the main MiniGame — game.js is now the shell (BUILD=platform-p6)"
```

- [ ] **Step 6: Merge to main + push**

```bash
git checkout main
git merge --no-ff feat/platform-p6 -m "Merge platform P6: extract the reef (absorbing cave zones) as the main MiniGame"
git push origin main
```

- [ ] **Step 7: Update memory**

Update `platform-migration.md`: Phase 6 SHIPPED (main hash, BUILD, what moved, the shell/reef split, the two facades, the salvage cleanup); next up = Phase 7 (consolidate DiverWorld engine + drop accessor shims). Note the god-object is gone.

---

## Self-review (completed by planner)

- **Spec coverage:** §1 aim → T2/T3; §2 decision 1 (nested seam) → T1/T2 delegation; §2 decision 2 (reef owns state) → T2 manifest + facades; §3 boundary → move manifest + "stays in shell"; §3c facade → facade contracts + T1; §4 boot flow → T2 step 5 (main.js unchanged); §5 game-over split → T2 step 4; §6 testing → T1/T4 tests + T5 browser parity; §7 deliverables → all tasks + T5; §8 out-of-scope → not touched. No gaps.
- **Placeholder scan:** none — every step has a concrete command/action; the "code move" steps name exact members (the manifest) rather than reproducing 1,800 lines, which is the correct granularity for an extraction.
- **Type/name consistency:** `makeReef({host, shell, ctx, bg})`, `this._reef`, `this._shell`, `_reefShell()`, `game._reef._whirl/_stage`, `shopBuy/dryDockAct/shopMove/dryDockMove/finalStats/resume/setSail`, `host.economy.earn({salvage})` used consistently across tasks and the facade contract.
