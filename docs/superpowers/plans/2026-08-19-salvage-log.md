# The Salvage Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each phase is an independently testable, pushable increment.

**Goal:** A persistent relic meta-progression ("Salvage Log") that grows across runs, delivering a power fantasy through unlockable relics while keeping roguelike stakes.

**Architecture:** A Node-testable `src/meta/` module holds Salvage economy, relic definitions, and localStorage persistence (pure). `game.js` loads it, applies the equipped loadout at run start, seeds Black Pearls, awards milestone Salvage at run end, and hosts a new `drydock` UI state. Relic effects are small flag-based hooks into existing systems.

**Tech Stack:** Vanilla ES modules, Canvas 2D, localStorage. No build step, no deps. Node tests via `node tests/**/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-19-salvage-log-meta-progression-design.md`

## Global Constraints

- No build step, no dependencies. `src/stage/*` stays canvas-free.
- Persistence under a versioned localStorage key `deepdescent.salvage.v1`; malformed/absent → sane defaults; wrap in try/catch.
- Pure economy/relic/persistence logic lives in `src/meta/*` and is Node-testable (no DOM).
- All existing `tests/**/*.test.mjs` stay green.
- Salvage persists; in-run gold/lives/weapons/reef still reset each run.

---

## Phase 1: Salvage core, persistence, run-end payout

**Files:** Create `src/meta/salvage.js`, `src/config.js` (add `SALVAGE` constants), `src/game.js` (load/award/persist + payout screen), `tests/game/salvage.test.mjs`.

**Interfaces (produced):**
- `src/meta/salvage.js`: `loadSalvage()` → `{salvage,unlocked,slots,loadout}` (defaults on missing/bad); `saveSalvage(state)`; `runPayout({deepestReef,bosses,relicsBanked,pearls})` → number (pure milestone math from `SALVAGE`).
- `config.js SALVAGE = { perReef, perBoss, perRelic, perPearl, startSlots:2, maxSlots:5, slotCostBase }`.

Steps:
- [ ] Write `tests/game/salvage.test.mjs`: `runPayout` math for a sample run; `loadSalvage` defaults on `null`/malformed JSON; `saveSalvage`→`loadSalvage` round-trip (inject a fake storage object so it runs in Node — `loadSalvage(store)`/`saveSalvage(state,store)` take an optional storage, defaulting to `localStorage`).
- [ ] Implement `src/meta/salvage.js` (pure; storage injectable) + `SALVAGE` config.
- [ ] Wire `game.js`: load meta in constructor; track per-run `bossesFelled`, `relicsBanked`, `blackPearlsBanked` (pearls come in Phase 4 — default 0 for now); on `_gameOver`/`_win` compute payout, add to `this.meta.salvage`, persist, stash `this.lastPayout` for display.
- [ ] Add a payout line to the game-over/victory screen ("⚙ SALVAGE +N  ·  total M").
- [ ] Run the suite; in-browser confirm Salvage rises after a run and persists across reload. Commit + push.

## Phase 2: Relic model + application at run start

**Files:** Create `src/meta/relics.js`; modify `src/game.js` (`start()` applies loadout), `tests/game/salvage.test.mjs` (relic apply).

**Interfaces:** `src/meta/relics.js`: `RELICS` = array of `{id,name,desc,cost,apply(game)}`; `getRelic(id)`; `applyLoadout(game, loadoutIds)` (resets per-run relic flags, then calls each relic's `apply`).

Steps:
- [ ] Test: `applyLoadout` with `['lungs','fins']` sets the expected flags on a stub game (e.g. `game._airBonus`, `game._swimMult`); unknown ids ignored.
- [ ] Implement 3–4 starter relics (lungs, fins, plating, bellrig) as flag-setters.
- [ ] `game.start()`: reset relic flags, then `applyLoadout(this, this.meta.loadout)`. Read the flags where relevant (airMax, diver speed mult, first-hit negate, bell bank rate = 1 if bellrig).
- [ ] Temporarily hardcode a test loadout to verify in-browser; then rely on Phase 3 UI. Run suite; commit + push.

## Phase 3: The Dry Dock UI (unlock + equip + slots)

**Files:** Modify `src/game.js` (new `drydock` state, nav, buy/equip, render), touch-button + menu entry.

**Interfaces:** `_openDryDock()`/`_closeDryDock()`; `_dryDockRows()` (relic + slot rows, like `_shopItems`); `_dryDockAct()` (buy/equip/unequip/buy-slot); reuse the shop's row-render/nav pattern.

Steps:
- [ ] Menu + game-over: a "DRY DOCK" entry → `state='drydock'`.
- [ ] Render: Salvage balance; each relic row (locked → cost+Buy; unlocked → Equip/Unequip); the loadout slots; "Unlock slot (cost)" row when `slots<maxSlots`.
- [ ] Actions: buy (deduct Salvage, add to unlocked, persist); equip/unequip (respect slot count, persist); buy-slot (deduct, `slots++`, persist).
- [ ] In-browser: full loop — earn Salvage, unlock a relic, equip it, start a run, feel it. Commit + push.

## Phase 4: Black Pearls (the hunt)

**Files:** Create `src/entities/blackpearl.js` (or reuse treasure with a flag); modify `src/game.js` (spawn deep/guarded, bank → Salvage), `src/render/*` (sprite).

Steps:
- [ ] Seed 1–2 Black Pearls per reef, placed deep (below a depth frac) / in dark zones / by a guardian.
- [ ] Collect → carried-pearl; bank (`_bankLoot`) grants Salvage + increments `blackPearlsBanked`; a fatal run forfeits an un-banked pearl (like loot).
- [ ] Distinct sprite/color; counts on the payout. Test the bank-pearl→Salvage path. In-browser; commit + push.

## Phase 5: Full relic pool + balance

**Files:** `src/meta/relics.js` (fill to ~10), `src/game.js` (remaining hooks: sonar minimap blips, barbed harpoon, chum-ward, second-wind, salvager's-eye), `src/config.js` (tuning).

Steps:
- [ ] Implement the remaining relics + their hooks.
- [ ] Balance pass: earn rates, relic costs, slot costs, effect magnitudes (first relic ~1–2 runs; strong-but-fair). In-browser playtest. Commit + push.

## Phase 6: Polish + integration

Steps:
- [ ] HUD: show equipped relics briefly at run start; Dry Dock polish; payout screen polish.
- [ ] Save-version safety (bump key if schema changes); full suite green. Update `docs/DESIGN.md`. Commit + push.

## Self-Review Notes

- Spec coverage: Salvage+payout (P1), relics+apply (P2), Dry Dock (P3), Black Pearls (P4), full pool+balance (P5), polish (P6) — all spec sections mapped.
- Persistence is injectable-storage for Node testing; guarded with defaults.
- Roguelike stakes preserved: only `src/meta` state persists; `start()` still resets the run.
