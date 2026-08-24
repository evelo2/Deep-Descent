# Timed Salvage Rentals — design

**Status:** design approved (2026-08-23), ready for implementation plan.
**Backlog item:** `backlog-balance-2026-08-23` (b). Turns permanent Dry Dock relic
unlocks into pricier, expiring **rentals** so Salvage stays a meaningful sink
late-game instead of a one-time unlock-everything endpoint.

## 1. Aim

Today the Dry Dock spends Salvage to **permanently** unlock relics (`meta.unlocked`),
then equip up to `meta.slots` of them. Once you've unlocked everything, Salvage has
no further use. This redesign makes each relic a **timed rental** metered in
**dives**, ticking down **only on dives where it was equipped**; when a rental
lapses you re-pay to renew. Permanent unlocks are removed entirely.

## 2. Approved decisions (brainstormed 2026-08-23)

1. **Meter = dives, ticking only when equipped.** A rental is "good for N dives";
   its counter drops by 1 only on a run where the relic was in the loadout. A
   "dive" = one run (start → game-over). Unequipped-but-rented relics are benched:
   their dives are frozen.
2. **Rentals replace permanent unlocks.** No permanent ownership; access to a relic
   = `rentals[id] > 0`.
3. **Dry Dock controls:** Confirm (Space/A/click/tap-row) = **rent/renew** (spend
   the relic's cost, refill remaining to the full period — works expired or
   running-low, even while equipped). Left/Right (or tap an equip chip) = **equip /
   bench** toggle (requires `rentals[id] > 0` and a free slot).

## 3. Data model + migration (`src/meta/salvage.js`)

- **State shape:** replace `unlocked: []` with `rentals: {}` (a bag of
  `relicId → divesRemaining`, positive integers). `defaultSalvage()` →
  `{ salvage: 0, rentals: {}, slots: SALVAGE.startSlots, loadout: [], reefRelics: {} }`.
- **Storage key** bumps `deepdescent.salvage.v1` → `deepdescent.salvage.v2`.
- **Migration** (`loadSalvage`): read v2 if present; else read the v1 key and
  migrate: for each id in legacy `unlocked[]` that is a real relic, set
  `rentals[id] = RENTAL.dives` (grandfather one full period so existing players
  keep their kit), drop `unlocked`, and persist under v2. A save with neither key →
  defaults. (Keep reading v1 as the migration source; do not delete the v1 key —
  harmless, and a safety net.)
- **Sanitize `rentals`:** object; keep only keys that are real relic ids with a
  finite integer value in `[1, RENTAL.maxDives]` (a generous cap, e.g. 999). Values
  ≤ 0 are dropped (expired).
- `slots` (permanent, buy-once), `loadout`, `reefRelics` — unchanged. On load,
  **prune `loadout`** to ids with `rentals[id] > 0` (a save could carry a stale
  equipped id whose rental expired).
- `saveSalvage` persists `{ salvage, rentals, slots, loadout, reefRelics }` under v2.

## 4. Rental mechanics (`src/config.js`, `src/meta/relics.js`)

- **Config** (`config.js`): `export const RENTAL = { dives: 20, maxDives: 999 };`
  (period length; `maxDives` = sanitize cap). Per-relic **rent price = the existing
  `relic.cost`** (120–280), now recurring per period — the recurrence is the added
  expense; costs stay config-driven for post-playtest tuning.
- **Rent / renew** — pure helper in `meta/relics.js`:
  `rentRelic(state, id)` → if `state.salvage >= relic.cost`, subtract cost and set
  `state.rentals[id] = RENTAL.dives` (refill to full — renew tops back up), return
  `true`; else return `false` (caller plays the deny sfx). Does NOT auto-equip
  (equip is a separate action); EXCEPT the Dry Dock convenience in §5.
- **Tick (only equipped)** — pure helper:
  `tickEquippedRentals(state)` → for each id in `state.loadout`, if
  `rentals[id] > 0` decrement by 1; collect ids that reach 0, remove them from both
  `rentals` (delete key) and `loadout`. Returns the array of lapsed relic ids (for
  the game-over notice). Idempotent per call; call exactly once per dive.
- **`getRelic`/`applyLoadout`/`RELICS`/`resetRelicFlags`** unchanged — `applyLoadout`
  still applies whatever is in `loadout` each run (loadout is already pruned to
  rented ids by the tick + load-time prune).

## 5. Run-end wiring (`src/minigames/reef/index.js`)

- In `_gameOver` (the once-per-run credit point, already guarded against
  double-fire), after the Salvage payout, call `tickEquippedRentals(this.meta)` and
  `saveSalvage(this.meta)`. Store the returned lapsed ids on the run summary
  (`this.lapsedRentals = [...]`) and expose them via `finalStats()`.
- The game-over screen (`game.js` `_gameOverScreen`, reads `this._reef.finalStats()`)
  shows a small line per lapsed relic: `⚙ {name} rental expired`. (No line when
  none lapsed.)
- Note: `_gameOver` is the single run-end funnel — `_win()` (clean-sweep victory)
  calls `this._gameOver()`, and `_gameOver` is guarded against double-fire, so the
  tick fires **exactly once per completed dive** regardless of outcome. Placing the
  tick in `_gameOver` alone is correct.

## 6. Dry Dock UX (`src/game.js` shell)

- **`_dryDockRows()`** — for each relic, one row carrying rental state:
  `{ kind: 'relic', id, name, desc, dives: rentals[id]||0, equipped: loadout.includes(id), cost: relic.cost }`.
  Keep the `slot` row (buy loadout slot, permanent) and `close` row.
- **`_dryDockScreen()`** render per relic row:
  - expired / not-rented: `🔒 {name} — {desc}   ·   RENT {RENTAL.dives} dives · {cost}⚙`
  - rented: `{name} — {desc}   ·   {dives} dives left` + an **equip chip** (✓ when
    equipped) on the right; when dives are low (≤ 3) tint the count as a warning.
  - Footer hint updates: `↑/↓ select · Space/A rent/renew · ←/→ equip · P/Esc close`.
- **Confirm** (`_dryDockAct`, selected relic row) = **rent/renew**:
  `rentRelic(this.meta, id)` — on success `saveSalvage` + bank sfx; on fail
  `ddDeny` + gasp. Convenience: if the relic was **not equipped** and a slot is
  free, renting also equips it (so a first rent is one press). `slot`/`close` rows
  behave as today.
- **Equip toggle** (new `_dryDockEquipToggle(dir)`), bound to Left/Right in
  `_updateDryDock`: on the selected relic row, if equipped → unequip; else if
  `rentals[id] > 0` and `loadout.length < slots` → equip; else `ddDeny` + gasp.
  `saveSalvage` + pickup sfx. (Left and Right both toggle — the row has a binary
  state; no horizontal list to traverse.)
- **Touch:** the row's primary tap = rent/renew (existing `dd{i}` button); add a
  small equip-chip touch target per rented relic (id `ddeq{i}`) wired in
  `_syncTouchButtons` → `_dryDockEquipToggle`.

## 7. Testing

- **Unit** (`tests/game/rentals.test.mjs`, Node, storage-injectable — mirrors
  `salvage.test.mjs`):
  - migration: a v1 store with `unlocked:['sonar','fins']` loads as
    `rentals:{sonar:20,fins:20}`, no `unlocked`; v2 store round-trips; empty → defaults.
  - load-time `loadout` prune: equipped id with no rental is dropped.
  - `rentRelic`: spends cost + refills to `RENTAL.dives`; renew of a running-low
    rental tops back to full; insufficient salvage → false, no mutation.
  - `tickEquippedRentals`: equipped ticks −1; unequipped rented is frozen; a relic
    hitting 0 is removed from `rentals` + `loadout` and returned as lapsed.
  - sanitize: junk `rentals` values dropped; cap respected.
- **Suite stays green**; update `salvage.test.mjs` for the v2 shape /
  `defaultSalvage` change.
- **Browser playtest** (fresh port): Dry Dock shows rent prices; rent a relic
  (salvage spent, equips), bench/equip with ←/→, dive + die, return to Dry Dock and
  confirm the equipped relic dropped a dive while a benched one didn't; run a rental
  down to 0 and confirm it lapses + shows the game-over "rental expired" line + is
  unequipped. Verify an existing (pre-migration) save grandfathers relics.

## 8. Deliverables

- `src/config.js` — `RENTAL` config.
- `src/meta/salvage.js` — v2 state + migration + `rentals` sanitize + loadout prune.
- `src/meta/relics.js` — `rentRelic`, `tickEquippedRentals`.
- `src/minigames/reef/index.js` — tick wiring in `_gameOver` + `finalStats` lapsed list.
- `src/game.js` — Dry Dock rows/render/act + equip-toggle + touch chip + game-over
  "rental expired" line.
- `tests/game/rentals.test.mjs` (+ `salvage.test.mjs` update).

## 9. Out of scope / deferred

- Making loadout **slots** rentals (they stay a permanent buy).
- Reworking the reef-skip `reefRelics` tokens (separate mechanic, untouched).
- Rebalancing individual relic **costs** or the 20-dive period beyond exposing the
  config knobs (tune after playtest).
- Any change to what relics *do* (`RELICS` effects unchanged).
