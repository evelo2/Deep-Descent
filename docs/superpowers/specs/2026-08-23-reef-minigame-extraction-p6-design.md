# Phase 6 — Extract the reef (absorbing the cave-reusing zones) as the main MiniGame

**Status:** design approved (2026-08-23), ready for implementation plan.
**Scope:** the whole of migration Phase 6 in one phase (user-approved: "full P6 in one go").
**Canonical context:** `docs/platform/migration-plan.md` (Phase 6), `docs/platform/architecture.md`, memory `platform-migration`.

## 1. Aim

The core reef dive loop — plus the three cave-reusing zones it shares its
update/draw loop with (**abyss + mini-sub**, **temple**, **whale belly**) and the
**extraction timer** — moves out of the 3,224-line `src/game.js` god-object into a
new MiniGame module `src/minigames/reef/index.js`. After P6 the god-object is gone:
`game.js` remains as the **Core shell** (menu/router/screens/services), holding no
dive gameplay.

This completes the strangler-fig: whirlpool (P4) and stage (P5) were the two
self-contained zones; the reef + its cave-reusing zones are the remaining bulk.

## 2. Approved design decisions

Two forks were decided during brainstorming (2026-08-23):

1. **Nested delegated module seam** (NOT Core-booted). Same proven seam as P4/P5:
   `game.js` keeps the top-level state-machine router and builds
   `this._reef = makeReef({ host, shell })` in its ctor; `update`/`draw` delegate
   the in-dive tick/render to the reef module. The reef is **not** `Core.boot`-ed
   by `main.js` this phase — promoting it to a Core-level registered MiniGame
   (real `host`, `main.js` boots it on dive-start) is deferred (candidate for P7
   or later). `main.js` construction of `Game` is unchanged.

2. **The reef module owns the run-state.** Ephemeral per-dive gameplay state
   (score/gold/lives/carried, loadout, entity arrays, zone/sub state, extraction)
   lives on the reef module (its methods use natural `this.x`). The shell's four
   run-coupled screens read/act on it through a **small reef facade**
   (`this._reef.score`, `this._reef.shopBuy(i)`, `this._reef.finalStats()`, …),
   not the ~40-member reach-back a shell-owned-state design would need.

**No impact on badges/salvage.** Those are persistent meta-progression owned by
the Core services (`host.economy` = salvage wallet, `host.progression` =
badges/ranks/lifetime stats, `host.achievements` = Steam), established in P2. Run
outcome is credited into them at game-over exactly as today. The run-state this
phase relocates is ephemeral and separate from the persistent wallet/unlocks.

## 3. The boundary — what goes where

### 3a. Reef module (`src/minigames/reef/index.js`) owns

**Run lifecycle & state:** `start`/`_generateWorld`, `_newReef`/`_setSail`,
`_bankLoot`, `_win`, and the gameplay half of game-over (see §5); all run-state
fields currently on `Game` for the dive (score, gold, lives, carried,
carriedPearls, loadout `owned/weapons/weaponIdx/weaponLevel/*Ammo*`, buffs, all
entity arrays `cave/creatures/shells/treasures/vents/wrecks/flora/skeletons/
bigBubbles/whales/ribs/currents/krakens/powerups/bells/crates/darkZones`, relic
run-flags via `applyLoadout`, `reef`/`reefName`/`reefTheme`/`reefGoal`/
`reefBanked`, `t`/`shake`/`flash`/`bankPulse`/`zoneFade`, `dockHold`/`sailT`).

**In-dive tick & render:** the `update(dt)` playing branch (diver control,
collisions, combat, loot, banking, depth), `draw()` playing render, `_collisions`,
`_explode`, `_hit`, `_loseLife`, weapons (`get weapon`, `_cycleWeapon`, `fire` and
all `_fire*`/`_spear`/aim helpers, `_damageCreature`), loot/economy helpers
(`_applyPowerUp`, `_makePowerups`, `_openCrate`, `_makeCurrents`), HUD/overlays
tied to the dive (`_hud`, `_minimap`, `_weaponCarousel`, `_puFlourish`,
`_enqueueToast`/toast queue + reef-intro flashes, `_newReefName`), portal
placement (`_orientShells`, `_clearCreaturesNearPortals`, `_placeDiver` delegating
to `world.placeDiver`, `_blockDoor`).

**The three cave-reusing zones (absorbed here, not standalone):**
- generators `_generateTemple`/`_generateAbyss`/`_generateBelly`;
- snapshot/restore `_snapshotReef`/`_restoreReef` (the 24-field reef snapshot);
- enter/exit `_enterWhale`/`_exitWhale`, `_enterTemple`/`_exitTemple`,
  `_enterAbyss`/`_exitAbyss`, `_ejectFromAbyss`, `_nearestExit`, `_nearestThreat`;
- zone entry/exit detection currently inline in `update` (belly swallow, temple
  gate, abyss entrance/hatch, whale exit, temple key/door/exit) and zone
  backdrops/tints/locators inline in `draw`, `_hud`, `_minimap`, `_exitLocator`.

**Mini-sub (untangled here):** `hasSub`/`inSub`/`subArmor`, sub weapon forcing in
`get weapon`, `SUB` movement profile in the diver-move branch, `oxygenMultiplier`
usage, sub-armor branch in `_hit` → `_ejectFromAbyss`, sub render + `_subLighting`,
`_abyssEntryCarried`/`_abyssEntryPearls`, and all `inSub` reset points.

**Extraction timer:** `_tripExtraction`/`_updateExtraction`, `extractActive`/
`extractT`/`extractLapsed`, armed on first abyss loot, ticked in the abyss update,
paid out at abyss hatch. **Cleanup:** the abyss exit-bonus (game.js:1704) that
currently writes `meta.salvage` + `saveSalvage` inline routes through
`host.economy.earn({ salvage })` — same numbers, one salvage path (matching what
the whirlpool already does).

**Nested sub-zones:** the reef module now builds and owns `_whirl` (`makeWhirlpool`)
and `_stage` (`makeStage`); their `reef` facades (`_whirlReef`/`_stageReef`) move
from `Game` onto the reef module and reference the reef module's own state. It also
owns the `mgHost` bundle they receive.

### 3b. Shell (`game.js`) owns

- Boot (self-boots to menu in ctor), the top-level `state` machine and its
  `update`/`draw` dispatch, `onAction` and the discrete input entry points that
  `main.js` wires (forwarding to the reef module when `state==='playing'`).
- Services + engine wiring: holds `services` (economy/progression/achievements)
  and `world`; builds `this._reef` (and passes `host`).
- **Pre-run / meta screens:** title/menu (`_menu`/`_menuButtons`, start-reef
  selector `_cycleStartReef`, hi-score display), help (`_help*`), Trophy Wall
  (`_badgesScreen`/`_openBadges`), control schemes (`_setScheme`/`_cycleScheme`/
  `_autoDetectScheme`/`_key`/`_applyHintStrip`), generic chrome helpers
  (`_overlay`/`_panel`/`_keycap`/`_text`/`_fmtStat`/`_mmss`), touch buttons
  (`_syncTouchButtons`/`_touchBtn`).
- **Run-coupled screens (render + nav in the shell; logic delegated):** shop
  (`_shopScreen`/`_openShop`/`_closeShop`/`_shopMove`), dry-dock
  (`_dryDockScreen`/`_openDryDock`/`_closeDryDock`/`_dryDockMove`), sail
  (`_sailScreen`), game-over (`_gameOverScreen`). These render/navigate against a
  **small reef facade**; the state they mutate (loadout, gold, relics) and the
  actions (`shopBuy`, `dryDockAct`, sail progression) live in the reef module and
  are invoked via that facade.
- **Game-over crediting** stays on the shell path (see §5).

### 3c. The shell↔reef facade

`this._reef` exposes a **small, explicit** surface for the shell's screens and
router, mirroring the P4/P5 facade style but pointing shell→module:

- **reads:** `state` (dive substate), `score`, `gold`, `lives`, `reef`/`reefName`,
  `carried`/`carriedPearls`, `canSail`, loadout view for the shop
  (`shopItems()`/`shopRow(i)`/`shopSel`), dry-dock view (`dryDockRows()`/`ddRow`),
  `finalStats()`/`deathCause`/`won`/`newHi` for game-over, `sailT` for the sail
  screen.
- **actions:** `enter(host)`/`start(startReef)`, `update(dt)`, `render(ctx)`,
  `onAction(...)`/input forwarders, `shopMove`/`shopBuy`, `dryDockMove`/`dryDockAct`,
  `setSail`, and a run-end signal the shell observes to switch to `gameover`.

## 4. Construction & boot flow (unchanged externally)

`main.js` still: builds raw deps + Core services + `world`, `makeHost(...)`,
`new Core({host})`, `createLegacyMiniGame({...})` → `new Game(...)`,
`core.register/boot('legacy')`, exposes `game` and wires DOM input to it, RAF →
`core.update/render` → `Game.update/draw`. **No `main.js` change** beyond what the
seam requires (ideally none). Inside `Game`:

```
ctor: this._reef = (world && services)
        ? makeReef({ host: <shared host bundle>, shell: this._reefShell() })
        : null;      // guarded like _whirl today
update(dt):
  switch(state) {
    'playing': this._reef.update(dt); if (this._reef.ended) this.state='gameover'; break;
    'menu'|'help'|'badges': ... shell ...
    'shop'|'dryDock'|'sail'|'gameover': ... shell screens reading this._reef ...
  }
draw():
  'playing' -> this._reef.render(this.ctx)
  else      -> shell screen render
```

The reef module builds `_whirl`/`_stage` internally (host + its own `_whirlReef`/
`_stageReef`), so the whirlpool/stage seam is preserved, just reparented from Game
to the reef module.

## 5. Game-over: gameplay vs crediting split

Today `_gameOver` (game.js:1933) does both: computes run outcome AND self-credits
(hi-score, salvage payout via services, badges/tiers via `recordRun`, Steam). Split:

- **reef module** detects death/win, freezes run state, computes the run summary
  (`_runStats`/`_runDelta`/`finalStats`, `deathCause`, `won`, `newHi`), and signals
  ended.
- **crediting stays on the existing services path.** Simplest faithful move: the
  reef module calls the same `host.economy.earn` / `host.progression.recordRun` /
  `host.achievements` it already reaches (it has `host`), keeping the legacy
  self-credit semantics (`credited:true`) so `Core.creditResult` still skips it —
  byte-identical award order to baseline. The shell then just renders
  `_gameOverScreen` from `this._reef.finalStats()`. (Formalizing a
  `MiniGameResult` → `Core.creditResult` handoff remains deferred, as noted in P4.)

Award order and the four `.v1` persistence keys are unchanged.

## 6. Testing & verification

**Mechanical-equivalence discipline** (as P3–P5): the extraction is a move +
`this.`→facade rewire; behavior must be byte-identical to baseline
`baseline/v1.0-pre-platform`.

- **Unit/module tests:** `tests/minigames/reef.test.mjs` (reef module logic in
  isolation against a stub host/shell) + `tests/minigames/reef-seam.test.mjs` (the
  first test to drive a real `Game` through the reef module via the shell facade —
  proving world/economy routing, shared wallet, run-state ownership, and that
  `_whirl`/`_stage` still enter/exit from the reef module). Existing suite (61)
  stays green; whirlpool/stage seam tests updated for the reparented facades.
- **Browser verification (fresh port — ES-module cache gotcha):** full playthrough
  parity vs baseline — reef → each zone (abyss+sub+extraction, temple key/door,
  whale belly, whirlpool, stage) → bank → sail → next reef → game-over → badges;
  both control schemes/themes; zero console errors; `BUILD` self-identifies.

**Test gate = the largest in the migration:** full playthrough parity.

## 7. Deliverables

- `src/minigames/reef/index.js` — the reef MiniGame (dive loop + 3 cave zones +
  mini-sub + extraction + nested whirl/stage).
- `src/game.js` — reduced to the shell: menu/router/screens/services/schemes;
  builds+delegates to `this._reef`; drops all migrated gameplay + now-unused
  imports; keeps the run-coupled screens rendering via the reef facade.
- `tests/minigames/reef.test.mjs`, `tests/minigames/reef-seam.test.mjs`; updates to
  whirlpool/stage seam tests for reparented facades.
- Salvage cleanup: abyss exit-bonus → `host.economy.earn`.
- `src/version.js` `BUILD='platform-p6'`; boot banner reflects it.
- Update memory `platform-migration` + `docs/platform/migration-plan.md` Phase 6
  to SHIPPED on completion.

## 8. Out of scope (deferred)

- Promoting the reef to a Core-booted registered MiniGame with the real `host` and
  `main.js`-driven boot (P7/later).
- `MiniGameResult` → `Core.creditResult` formalization (kept as legacy self-credit).
- Factoring a common base for the three `reef` facades (P7 consolidation).
- The deferred balance backlog items (`backlog-balance-2026-08-23`).
- Any DiverWorld engine dedup (that IS P7).
