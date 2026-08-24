# Salvage Match — a match-3 minigame (Platform Phase 9)

**Status:** design / spec
**Date:** 2026-08-24
**Depends on:** platform migration P1–P8 (Core + MiniGame/Host contract, shared
economy, typed boundary). See `docs/platform/`.

## 1. Overview

**Salvage Match** is the first genuinely *new* minigame in the Deep Descent
collection and the concrete proof of Phase 9: a **bring-your-own-engine**
MiniGame that ignores `host.world` (no diver/cave/physics), runs its own grid
update/render, and feeds the **one shared salvage economy** via
`host.economy.earn({ salvage })`.

It is a **Candy-Crush-style match-3**: swap adjacent treasure tiles to make lines
of 3+, which clear, drop, refill, and cascade. Play is structured as **objective
levels** (collect N of a target treasure within a move budget); clearing a level
pays out salvage.

**Integration, staged (user-approved):**
- **Now — a main-menu item** ("⚓ SALVAGE MATCH"), launched as a second Core
  minigame, for easy testing and refinement. Both the dive and the match-3 feed
  the same wallet.
- **Later — a nested reef special-level** (like the whirlpool/stage zones), found
  mid-dive. The module is written self-contained (no menu assumptions in
  `enter`/`exit`) so the *same* module drops into that seam later with no rewrite.

**Guardrails:**
- **No build step.** A self-contained vanilla-canvas match-3 needs no bundler;
  Phase 9's esbuild/TS trigger stays unfired (it only fires for a heavy
  engine wanting lazy-load/minify).
- **No behavior change to the existing game.** Everything here is additive: a new
  menu item, a new Core minigame, and a mode-switch seam. The reef dive is
  untouched except for the additive menu wiring.
- **One shared economy.** Salvage earned here is the same currency a dive earns.
- **`// @ts-check` the new code** (engine + module), consistent with P8.

## 2. Architecture

Follows the proven **Stage pattern** — a canvas-free engine + data + renderer +
a thin MiniGame module — so the core logic is Node-unit-testable and the module
only wires it to the Host.

```
src/minigames/match3/
  board.js     Pure match-3 engine (no canvas, no DOM). Deterministic via rng.
  levels.js    Level table (data): objectives, move budgets, rewards, tile sets.
  index.js     The MiniGame module: makeMatch3({ host }) → id/enter/update/render/exit.
src/render/
  match3.js    Canvas renderer: board, tiles, HUD, swap/clear/cascade animation.
tests/minigames/match3/
  board.test.mjs      engine unit tests
  levels.test.mjs     level-table sanity
  seam.test.mjs       module credits host.economy on win
```

Plus the **platform seam** (new, small, shared): a minigame *stack* on the Core
(§8.1) and its `host.open`/`host.close` facade.

## 3. The engine — `board.js`

Pure and deterministic. No timers, no canvas: it computes **discrete resolution
steps** that the module animates.

### 3.1 Data model
- `cols`, `rows` (default 8×8).
- `tiles`: a `rows × cols` grid of tile objects `{ type, special }`, where
  `type` is an integer `0..T-1` (T = tile-kind count, default 6) and `special` is
  `null | 'line' | 'bomb'`. `null` cells are transient (mid-resolution holes).
- `rng`: injected `() => [0,1)` (default `Math.random`), so tests are
  reproducible with a seeded source (e.g. `mulberry32`, as Stage does).

### 3.2 Operations (the public API)
- `makeBoard({ cols, rows, types, rng })` → board, filled with **no initial
  matches** and **guaranteed ≥1 legal move** (reshuffle/regenerate until so).
- `legalSwap(r1,c1,r2,c2)` → boolean: are the cells adjacent AND does swapping
  create a match (or involve an already-`special` activation)?
- `applySwap(r1,c1,r2,c2)` → `{ ok, steps }`: if `legalSwap`, perform the swap and
  resolve to stable, returning an ordered list of **resolution steps** for
  animation; else `{ ok:false }` (no state change — a wasted swap doesn't count).
- `hasAnyMove()` → boolean; `reshuffle()` → re-arranges existing tiles into a
  legal, match-free board (used when a resolution ends with a dead board).

### 3.3 Match detection
Scan rows and columns for runs of ≥3 same `type`. A cleared *set* is the union of
all runs (so an L/T intersection clears both arms). Track, per resolution, the
per-type counts cleared (drives objective progress) and a running score.

### 3.4 Specials (spawn + activate)
- A straight run of **4** spawns a **`line`** piece at the swapped-into cell
  (clears its full row or column when later activated — orientation = the run's
  axis).
- A straight run of **5** spawns a **`bomb`** (clears a 3×3 area when activated).
- **Activation**: a special is consumed when it is part of a cleared set (matched
  again, or included in another clear); its effect adds its footprint to the
  cleared set, which can chain further cascades. (Special×special combos are a
  later addition — see §12.)

### 3.5 Gravity, refill, cascade
After a clear: existing tiles **fall** into holes (per column), new tiles
**spawn** at the top (via `rng`), then **re-scan** for matches; repeat until
stable. Each iteration is one or more `steps`. When stable, if `!hasAnyMove()`,
`reshuffle()` and emit a `reshuffle` step.

### 3.6 Resolution steps (the animation contract)
`applySwap` returns steps like:
```
{ kind:'swap',    a:[r1,c1], b:[r2,c2] }
{ kind:'clear',   cells:[[r,c]...], spawns:[{at:[r,c], special}], counts:{type:n} }
{ kind:'fall',    moves:[{from:[r,c], to:[r,c]}...] }
{ kind:'refill',  spawns:[{at:[r,c], type}...] }
{ kind:'reshuffle' }
```
The renderer tweens between steps; the engine itself is instantaneous and
fully testable on the step list + final grid.

## 4. Levels & objectives — `levels.js`

### 4.1 Schema
```js
{ id, goalType:'collect', targetTile, targetCount, moves, reward, tiles:6 }
```
`goalType` is `'collect'` in v1 (collect `targetCount` of `targetTile`). The
schema leaves room for future goal types (`'score'`, `'clear'` blockers) without
restructuring.

### 4.2 v1 table (5 levels, tunable)
| id | objective | moves | reward |
|----|-----------|-------|--------|
| 1 | collect 12 🫧 pearls | 20 | 6 |
| 2 | collect 16 💎 gems | 20 | 8 |
| 3 | collect 20 🪙 coins | 18 | 10 |
| 4 | collect 24 🐚 shells | 18 | 12 |
| 5 | collect 30 🫧 pearls | 16 | 15 |

Rewards sit in a dive's ballpark (`SALVAGE.perReef=8`, `perRelic=15`; a reef-3 run
≈ 40) so grinding the set ≈ a short dive. **All numbers are playtest-tunable.**

### 4.3 Win / lose / bonus
- **Win**: `targetCount` reached with moves ≥ 0 remaining → pay `reward` +
  **leftover-move bonus** (`leftoverMoves × smallConst`, tunable) → unlock next
  level.
- **Lose**: moves hit 0 before the goal → offer retry (no salvage).
- Progress persists per session; whether cleared-levels persist across reloads is
  a v1 nicety (can reuse a localStorage key like the other meta), **defaulted OFF
  for v1** (levels reset each launch) to keep scope tight — revisit at review.

## 5. The MiniGame module — `index.js`

`makeMatch3({ host })` returns a MiniGame (`id:'match3'`, `enter/update/render/
exit`). It ignores `host.world`; it uses `host.input`, `host.audio`,
`host.particles`, `host.viewport`, `host.rng`, and `host.economy`.

### 5.1 Internal state machine
`intro` (level card: objective + moves) → `play` (the board) → `won`/`lost`
(result card) → next level or menu. A small `phase` field + timers; the module
owns all ephemeral state (board, level index, cursor, animation queue).

### 5.2 Lifecycle
- `enter(host)`: initialize to level 1 (or a chosen start), build the board via
  `makeBoard({ rng: host.rng })`, set `phase='intro'`. (Written so re-entry always
  re-initializes — no menu/reef assumptions.)
- `update(dt)`: poll `host.input`; advance the animation queue (tween timers);
  when a swap resolves, fold cleared-type counts into objective progress, decrement
  moves on a *successful* swap only, and check win/lose.
- `render(ctx)`: delegate to `src/render/match3.js`.
- `exit()`: return a `MiniGameResult` — `{ outcome:'won'|'bailed', salvage,
  credited:false }`. Salvage is credited by **Core.creditResult** on close (single
  uniform path — this is the first mode to actually use it, vs the legacy's
  self-credit). Alternatively the module may credit per-level via
  `host.economy.earn` as levels are cleared (so progress banks even if you quit
  mid-run) and flag the exit result `credited:true`; **decision at review** — default
  to **per-level credit** so cleared salvage is never lost on quit.

### 5.3 Quitting back to the menu
A "Quit" affordance (key/back button / on-screen ✕) calls `host.close(result)`
(§8) → Core credits the result and resumes the menu underneath.

## 6. Renderer — `src/render/match3.js`

Layered, reusing existing art where possible:
- **Backdrop**: a calm underwater panel (reuse `PAL` + a simple gradient; the
  menu already paints an ocean, so the board sits on a framed panel over it).
- **Board grid**: rounded cells; **tiles reuse treasure iconography**
  (`render/sprites.js` / `props.js` — pearl/gem/coin/shell/starfish/coral) so it
  reads as the same world. Specials get an overlay (line = directional streaks,
  bomb = glow ring).
- **Animation**: tween tile positions/opacity across the engine's resolution
  steps (swap slide, clear pop + particle via `host.particles`, fall, refill drop).
- **HUD**: objective (target tile + `have/need`), **moves left**, level label,
  score; result cards for win/lose with the salvage delta.
- **Cursor/selection**: highlight the selected tile + legal adjacent targets
  (keyboard/gamepad); hover/press feedback (mouse/touch).

Chrome helpers reuse `src/render/chrome.js` (`_text`/`_panel`/`_overlay`, the P7
shared canvas helpers).

## 7. Input & controls (multi-scheme parity)

Matches the rest of the game (keyboard + mouse + touch + gamepad):
- **Mouse/touch**: click/tap a tile to select, then click/tap an adjacent tile (or
  drag) to swap.
- **Keyboard/gamepad**: a cursor moves with the swim/`←↑↓→` directions; a
  grab/confirm key selects; a direction then swaps with the neighbor. Reuse
  existing action names where sensible (`swim` dirs, confirm).
- New actions added to `KEYMAP` (input.js): a **match3-select/confirm** and a
  **quit/back**; a touch button for quit. The module polls these via
  `host.input.pressed(...)` / `consumeButton(...)` in `update()`.

## 8. Platform seam — mode switching

### 8.1 Core minigame stack
Today `Core` holds a single `active`. Generalize to a small **stack** (the base
is the persistent legacy/home minigame; pushes are session minigames):
- `Core.open(id)`: push `registry.get(id)` and call its `enter(host)`. The
  previously-active mode is paused (simply not updated/rendered — top-of-stack
  drives the frame).
- `Core.close(result)`: pop the top; route `result` through `creditResult`
  (existing uniform credit path); resume the mode beneath (**no** re-`enter` — it
  keeps its state, e.g. the menu). No-op if only the base remains.
- `update`/`render` drive **only the top** of the stack.
- The switch is applied at a **frame boundary** (a `_pending` open/close applied at
  the top of `update`) so a mode never mutates the stack mid-frame.

This mirrors the reef's own internal zone-stack concept and sets up both the
"collection" menu and future nested modes. Fully unit-testable on the Core.

### 8.2 Host facade
Expose `host.open(id)` and `host.close(result)` (thin forwarders to the Core) so
the active minigame can request a switch without reaching Core internals — the
same facade discipline as the rest of the Host. Added to the `Host` typedef
(`core/contract.js`) and `makeHost`.

### 8.3 Registration (main.js)
Build and `core.register(match3)` alongside the legacy; keep `core.boot('legacy')`
as the base. `makeMatch3({ host })` receives the shared Host (economy/input/etc.).

## 9. The menu item

Additive wiring to launch match3 from the shell menu:
- **Render** (shell `game.js` `_menuButtons`/`_menu`): add an "⚓ SALVAGE MATCH (M)"
  button/prompt in the menu button bar (extend the 3-button bar to 4, or add a
  labeled prompt), matching the existing style.
- **Action** (reef menu input polling, where `badges`/`drydock` are handled): on a
  new `match3` action (pressed key **M** / touch button / gamepad button) while
  `shell.state` is `menu`/`gameover`, call `host.open('match3')`.
- **Touch**: register the button's hit-rect in `_syncTouchButtons` and hit-test it
  (same path as help/drydock/badges), so mouse + touch land identically (heed the
  P7 touch-button lesson).

### 9.1 Input gating (main.js)
`main.js`'s confirm/click/tap handlers are hard-wired to the legacy `game`
(`game.onAction()`), which on the menu starts a dive. While match3 is on top of
the stack, gate those handlers so they **only** drive the legacy when the legacy
is the top-of-stack (`core.top() === legacy` / `core.activeId() === 'legacy'`).
match3 handles all its own input via `host.input` polling in `update()`. (This is
the minimal, correct slice of the "formalize input" deferral — no full rework.)

## 10. Economy tie-in

`host.economy.earn({ salvage })` credits the shared wallet and persists (same
localStorage key as a dive's salvage). Default: **credit per level cleared** so
banked salvage survives a mid-run quit; the exit `MiniGameResult` is then
`credited:true` (Core skips re-crediting), consistent with the legacy's pattern.

## 11. Testing plan

Node unit tests driving the **real engine** (like Stage's `tests/stage/*`):
- `board.test.mjs`: match detection (row, col, L, T); wasted-swap revert (no
  state change, no move spent); gravity + refill correctness; cascade resolution
  reaches stable; special spawn (4→line, 5→bomb at the right cell/orientation);
  special activation footprint + chained cascade; dead-board detection +
  reshuffle; **determinism** (same seed ⇒ same steps + final grid); objective
  count accounting per cleared type.
- `levels.test.mjs`: table integrity (targets reachable in principle, rewards
  present, tile counts valid).
- `seam.test.mjs`: drive the module to a level win; assert
  `host.economy.earn`/`Core.creditResult` credited the expected salvage; assert
  the shared wallet object is the Core's (one economy).
- `core` stack tests (extend `tests/core/`): `open` pushes+enters, `close`
  credits+pops+resumes, base is never popped, frame-boundary application.

Browser smoke on a fresh port: launch from the menu, play a level to a win,
confirm salvage credited + banked, quit back to the menu, then start a normal dive
(prove the stack resumes and input gating works). Zero console errors, all shell
screens still clean.

## 12. Non-goals / future

- **Blocker objectives** (clear coral/ice tiles), `score`-threshold and
  timed goal types — schema leaves room; not in v1.
- **Color-bomb (match-5 variants), special×special combos** — v1 stops at
  line-clear + bomb.
- **Nested reef special-level embedding** — the module is written for it, but the
  entrance/portal + reef wiring is a later phase.
- **Cross-reload level progress persistence** — defaulted off for v1.
- **esbuild/TS build step** — not triggered by this module.

## 13. Open decisions (confirm at spec review)
1. Credit timing: **per-level** (recommended, banks on quit) vs on-exit only.
2. Cross-reload progress persistence: **off** for v1 (recommended) vs on.
3. Menu affordance: extend the button bar to 4 vs a separate labeled prompt.
