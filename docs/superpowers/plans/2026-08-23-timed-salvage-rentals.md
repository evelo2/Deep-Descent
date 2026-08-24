# Timed Salvage Rentals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert permanent Dry Dock relic unlocks into pricier, dive-metered rentals so Salvage stays a meaningful late-game sink.

**Architecture:** `meta.unlocked[]` becomes `meta.rentals{ id→divesRemaining }`; a relic is equippable iff `rentals[id]>0`. Rent/renew refills to a full period; at run-end each *equipped* relic ticks −1 and lapses (auto-benched) at 0. Pure/Node-testable meta helpers; the reef fires the tick once per dive in `_gameOver`; the shell's Dry Dock gains a rent/renew (confirm) + equip/bench (←/→) split.

**Tech Stack:** Vanilla ES modules, Canvas 2D, no build step. Tests are plain `.mjs` with a hand-rolled `check()` harness, run via `node --test 'tests/**/*.mjs'` (and individually `node tests/<file>`). `meta/*` modules are storage-injectable (pass a fake `store`).

**Spec:** `docs/superpowers/specs/2026-08-23-timed-salvage-rentals-design.md` (read alongside).

## Global Constraints

- **No build step**; plain ES modules, no new deps.
- **Meta is Node-testable**: `meta/salvage.js` + `meta/relics.js` stay pure + storage-injectable (no DOM).
- **Persistence:** storage key `deepdescent.salvage.v1` → `deepdescent.salvage.v2`; `loadSalvage` migrates v1 (`unlocked[]` → full-period `rentals`) so existing players keep their kit. Never throw from persistence.
- **Config-driven:** `RENTAL = { dives: 20, maxDives: 999 }`; rent price = the relic's existing `cost`. No number is hardcoded in logic.
- **Suite gate:** `node --test 'tests/**/*.mjs'` reports `fail 0` at the end of every task (currently 65 pass on `main`; this branch adds tests).
- **Ship:** work on branch `feat/salvage-rentals` (already created; the spec is committed there). Final `--no-ff` merge to `main` + push in the last task. Browser-verify on a FRESH PORT.

## File structure

- **Modify** `src/config.js` — add `RENTAL`.
- **Modify** `src/meta/salvage.js` — `rentals` state, `sanitizeRentals`, v2 load/save + v1 migration, load-time `loadout` prune.
- **Modify** `src/meta/relics.js` — add `rentRelic(state,id)` + `tickEquippedRentals(state)`.
- **Modify** `src/minigames/reef/index.js` — call `tickEquippedRentals` in `_gameOver`; expose `lapsedRentals` via `finalStats()`.
- **Modify** `src/game.js` — Dry Dock rows/render/act + `_dryDockEquipToggle` + ←/→ wiring in `_updateDryDock` + touch equip-chip in `_syncTouchButtons` + game-over "rental expired" line in `_gameOverScreen`.
- **Create** `tests/game/rentals.test.mjs`; **Modify** `tests/game/salvage.test.mjs` (v2 shape / `unlocked`→`rentals`).

---

## Task 1: Rental data model + migration (`meta/salvage.js`)

**Files:**
- Modify: `src/config.js`, `src/meta/salvage.js`
- Create: `tests/game/rentals.test.mjs`
- Modify: `tests/game/salvage.test.mjs`

**Interfaces:**
- Produces: `RENTAL = { dives, maxDives }` (config); `defaultSalvage()` → `{ salvage, rentals:{}, slots, loadout, reefRelics }`; `loadSalvage(store)` reads v2 and migrates v1; `saveSalvage(state, store)` writes v2.
- Consumes: existing `SALVAGE`, `RELICS` (to validate rental ids on migrate/sanitize — import `getRelic` from `meta/relics.js`).

- [ ] **Step 1: Add `RENTAL` to config.js**

```js
// Salvage-Log rentals: relics are rented for a number of DIVES (one run each),
// ticking down only on dives where the relic was equipped. Rent/renew refills to
// `dives`; `maxDives` is the load-time sanitize cap.
export const RENTAL = { dives: 20, maxDives: 999 };
```

- [ ] **Step 2: Write failing migration/model tests** in `tests/game/rentals.test.mjs`

```js
// Timed salvage rentals: v1 unlocked[] -> v2 rentals{}, sanitize, loadout prune.
// Run: node tests/game/rentals.test.mjs
import { loadSalvage, saveSalvage, defaultSalvage } from '../../src/meta/salvage.js';
import { RENTAL } from '../../src/config.js';
let passed = 0, failed = 0;
const check = (n, c) => c ? passed++ : (failed++, console.error(`  FAIL: ${n}`));
const store = (val) => { let v = val; return { getItem: (k) => (k === 'deepdescent.salvage.v2' ? v.v2 : k === 'deepdescent.salvage.v1' ? v.v1 : null), setItem: (k, s) => { if (k === 'deepdescent.salvage.v2') v.v2 = s; }, removeItem() {} }; };

// default shape has a rentals bag, no `unlocked`.
{ const d = defaultSalvage(); check('default has rentals {}', d.rentals && typeof d.rentals === 'object' && Object.keys(d.rentals).length === 0);
  check('default has no unlocked', !('unlocked' in d)); }

// v1 migration: unlocked -> full-period rentals; unlocked dropped.
{ const v1 = JSON.stringify({ salvage: 50, unlocked: ['sonar', 'fins'], slots: 3, loadout: ['sonar'], reefRelics: {} });
  const r = loadSalvage(store({ v1 }));
  check('v1 unlocked migrates to full-period rentals', r.rentals.sonar === RENTAL.dives && r.rentals.fins === RENTAL.dives);
  check('migration keeps salvage/slots/loadout', r.salvage === 50 && r.slots === 3 && r.loadout.includes('sonar'));
  check('no unlocked after migration', !('unlocked' in r)); }

// bogus unlocked ids are dropped on migration.
{ const v1 = JSON.stringify({ salvage: 0, unlocked: ['sonar', 'notarelic'], slots: 2, loadout: [] });
  const r = loadSalvage(store({ v1 }));
  check('unknown relic id dropped in migration', !('notarelic' in r.rentals) && r.rentals.sonar === RENTAL.dives); }

// v2 round-trips and wins over v1.
{ const s = store({ v1: JSON.stringify({ unlocked: ['fins'] }) });
  saveSalvage({ salvage: 7, rentals: { sonar: 5 }, slots: 2, loadout: ['sonar'], reefRelics: {} }, s);
  const r = loadSalvage(s);
  check('v2 read wins over v1', r.rentals.sonar === 5 && !r.rentals.fins && r.salvage === 7); }

// sanitize: junk rental values dropped; cap enforced.
{ const s = store({ v2: JSON.stringify({ salvage: 0, rentals: { sonar: -3, fins: 'x', lungs: 99999, barbs: 4 }, slots: 2, loadout: [] }) });
  const r = loadSalvage(s);
  check('non-positive rental dropped', !('sonar' in r.rentals));
  check('non-number rental dropped', !('fins' in r.rentals));
  check('rental capped at maxDives', r.rentals.lungs === RENTAL.maxDives);
  check('valid rental kept', r.rentals.barbs === 4); }

// load-time loadout prune: an equipped id with no rental is dropped.
{ const s = store({ v2: JSON.stringify({ salvage: 0, rentals: { sonar: 3 }, slots: 2, loadout: ['sonar', 'fins'] }) });
  const r = loadSalvage(s);
  check('equipped-but-unrented pruned from loadout', r.loadout.includes('sonar') && !r.loadout.includes('fins')); }

console.log(`rentals-model: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node tests/game/rentals.test.mjs` → Expected: FAIL (default still has `unlocked`; no `rentals`).

- [ ] **Step 4: Implement the v2 model + migration in `src/meta/salvage.js`**

- Import `RENTAL` from config and `getRelic` from `./relics.js`.
- Add `const KEY_V2 = 'deepdescent.salvage.v2'; const KEY_V1 = KEY;` (rename the existing `KEY` const usage or keep `KEY` = v1).
- `defaultSalvage()` → `{ salvage: 0, rentals: {}, slots: SALVAGE.startSlots, loadout: [], reefRelics: {} }`.
- Add `sanitizeRentals(o)`: return an object keeping only keys where `getRelic(k)` exists and the value is a finite integer ≥ 1, clamped to `RENTAL.maxDives` (`Math.min(RENTAL.maxDives, Math.floor(v))`).
- `loadSalvage(store)`: resolve store; read v2 (`JSON.parse(s.getItem(KEY_V2))`). If no v2, read v1; if v1 present, migrate: `rentals = {}` from `sanitizeArray(v1.unlocked)` filtered by `getRelic`, each set to `RENTAL.dives`; carry salvage/slots/loadout/reefRelics through the same sanitizers. Build the merged v2 state; **prune loadout** to ids with `rentals[id] > 0`; return it. (No `unlocked` key on the result.)
- `saveSalvage(state, store)`: write `{ salvage, rentals, slots, loadout, reefRelics }` to `KEY_V2`.

- [ ] **Step 5: Run rentals model tests → pass**

Run: `node tests/game/rentals.test.mjs` → Expected: all pass.

- [ ] **Step 6: Update `salvage.test.mjs` for the v2 shape**

Replace `unlocked`-based assertions with `rentals`: the `defaultSalvage` deep-equals still hold (new default); change the "partial merge: unlocked defaulted to []" check to "rentals defaulted to {}"; in the save round-trip + slots-clamp + salvage-sanitize fixtures, swap `unlocked: [...]` for `rentals: {...}` (or drop the field — sanitizers default it). Keep the `runPayout`/reef-relic/bank tests untouched. Run: `node tests/game/salvage.test.mjs` → pass.

- [ ] **Step 7: Full suite + commit**

Run: `node --test 'tests/**/*.mjs'` → `fail 0`.
```bash
git add src/config.js src/meta/salvage.js tests/game/rentals.test.mjs tests/game/salvage.test.mjs
git commit -m "Rentals T1: salvage v2 model + v1->v2 migration (unlocked -> rentals bag)"
```

---

## Task 2: Rental mechanics (`meta/relics.js`)

**Files:**
- Modify: `src/meta/relics.js`
- Modify: `tests/game/rentals.test.mjs` (append)

**Interfaces:**
- Produces: `rentRelic(state, id) → boolean` (spends `relic.cost`, refills `rentals[id]` to `RENTAL.dives`; false if unknown id or insufficient salvage, no mutation on false); `tickEquippedRentals(state) → string[]` (decrements each equipped relic, removes lapsed from `rentals`+`loadout`, returns lapsed ids).
- Consumes: `RELICS`/`getRelic`, `RENTAL`.

- [ ] **Step 1: Append failing mechanics tests** to `tests/game/rentals.test.mjs`

```js
import { rentRelic, tickEquippedRentals } from '../../src/meta/relics.js';
import { getRelic } from '../../src/meta/relics.js';

// rentRelic: spends cost + refills to full; insufficient salvage is a no-op.
{ const cost = getRelic('sonar').cost;
  const st = { salvage: cost + 5, rentals: {}, loadout: [], slots: 2 };
  check('rentRelic succeeds with enough salvage', rentRelic(st, 'sonar') === true);
  check('rentRelic charged the cost', st.salvage === 5);
  check('rentRelic set full period', st.rentals.sonar === RENTAL.dives);
  check('rentRelic broke = no-op false', rentRelic(st, 'lungs') === false && !('lungs' in st.rentals) && st.salvage === 5);
  check('rentRelic unknown id = false', rentRelic(st, 'nope') === false); }

// renew tops a running-low rental back to full.
{ const cost = getRelic('fins').cost;
  const st = { salvage: cost, rentals: { fins: 2 }, loadout: ['fins'], slots: 2 };
  rentRelic(st, 'fins');
  check('renew refills to full period', st.rentals.fins === RENTAL.dives); }

// tick: equipped -1, unequipped frozen, lapse-at-0 removes + returns id.
{ const st = { salvage: 0, rentals: { sonar: 2, fins: 5, barbs: 1 }, loadout: ['sonar', 'barbs'], slots: 3 };
  const lapsed = tickEquippedRentals(st);
  check('equipped sonar ticked', st.rentals.sonar === 1);
  check('unequipped fins frozen', st.rentals.fins === 5);
  check('barbs lapsed (1->0) removed from rentals', !('barbs' in st.rentals));
  check('lapsed barbs removed from loadout', !st.loadout.includes('barbs'));
  check('lapsed list returned', lapsed.length === 1 && lapsed[0] === 'barbs'); }
```

- [ ] **Step 2: Run → fail** (`rentRelic`/`tickEquippedRentals` not defined). Run: `node tests/game/rentals.test.mjs`.

- [ ] **Step 3: Implement in `src/meta/relics.js`**

```js
import { RENTAL } from '../config.js';
// (getRelic already defined in this file.)

// Rent or renew a relic: spend its cost, refill its rental to a full period.
// Returns false (no mutation) if the id is unknown or salvage is insufficient.
export function rentRelic(state, id) {
  const r = getRelic(id);
  if (!r || state.salvage < r.cost) return false;
  state.salvage -= r.cost;
  if (!state.rentals || typeof state.rentals !== 'object') state.rentals = {};
  state.rentals[id] = RENTAL.dives;
  return true;
}

// Tick down each EQUIPPED relic's rental by one dive; lapse (remove from rentals
// AND loadout) any that reach 0. Returns the list of lapsed relic ids. Call once
// per completed dive.
export function tickEquippedRentals(state) {
  const lapsed = [];
  const rentals = state.rentals || (state.rentals = {});
  for (const id of [...(state.loadout || [])]) {
    if (rentals[id] > 0) {
      rentals[id] -= 1;
      if (rentals[id] <= 0) { delete rentals[id]; lapsed.push(id); }
    }
  }
  if (lapsed.length) state.loadout = (state.loadout || []).filter((id) => !lapsed.includes(id));
  return lapsed;
}
```

- [ ] **Step 4: Run → pass; full suite; commit**

Run: `node tests/game/rentals.test.mjs` then `node --test 'tests/**/*.mjs'` → `fail 0`.
```bash
git add src/meta/relics.js tests/game/rentals.test.mjs
git commit -m "Rentals T2: rentRelic + tickEquippedRentals mechanics"
```

---

## Task 3: Run-end tick wiring (reef `_gameOver` + `finalStats`)

**Files:**
- Modify: `src/minigames/reef/index.js`
- Modify: `tests/minigames/reef-seam.test.mjs` (append a lapse assertion)

**Interfaces:**
- Consumes: `tickEquippedRentals` (import into the reef module).
- Produces: `this.lapsedRentals` (array of relic ids) set at run-end; included in `finalStats()`.

- [ ] **Step 1: Import + wire the tick in `_gameOver`**

In `src/minigames/reef/index.js`: `import { ... , applyLoadout, getRelic } from '../../meta/relics.js'` → add `tickEquippedRentals`. In `_gameOver`, after the Salvage payout (`this.meta.salvage += this.lastPayout; saveSalvage(this.meta);`), add:
```js
this.lapsedRentals = tickEquippedRentals(this.meta);
saveSalvage(this.meta);
```
Initialize `this.lapsedRentals = []` in `start()` (near `this.newBadges = []`).

- [ ] **Step 2: Expose in `finalStats()`**

Add `lapsedRentals: this.lapsedRentals || []` to the object returned by `finalStats()`.

- [ ] **Step 3: Append a seam assertion** to `tests/minigames/reef-seam.test.mjs`

After the existing `_gameOver` block, before the nested-module checks:
```js
// Rentals tick at run-end: an equipped rented relic drops a dive; lapse benches it.
reef.meta.rentals = { sonar: 1 }; reef.meta.loadout = ['sonar'];
game.state = 'playing'; reef.won = false; reef.deathCause = null;
// re-arm the gameover guard so _gameOver runs again
game.state = 'playing';
reef._gameOver();
check('equipped rental lapsed at run-end (benched)', !reef.meta.loadout.includes('sonar') && !reef.meta.rentals.sonar);
check('finalStats surfaces the lapsed rental', reef.finalStats().lapsedRentals.includes('sonar'));
```
(Note: `_gameOver` is re-entrancy-guarded on `state==='gameover'`; set `game.state='playing'` immediately before the call.)

- [ ] **Step 4: Run seam test + full suite; commit**

Run: `node tests/minigames/reef-seam.test.mjs` then `node --test 'tests/**/*.mjs'` → `fail 0`.
```bash
git add src/minigames/reef/index.js tests/minigames/reef-seam.test.mjs
git commit -m "Rentals T3: tick equipped rentals at run-end; surface lapsed via finalStats"
```

---

## Task 4: Dry Dock UX + game-over notice (`game.js`)

**Files:**
- Modify: `src/game.js`

**Interfaces:**
- Consumes: `rentRelic`, `getRelic`, `RELICS`, `RENTAL`, `tickEquippedRentals` results via `this._reef.finalStats()`.

- [ ] **Step 1: Add imports**

In `src/game.js`: import `RENTAL` from `./config.js`; add `rentRelic` to the `./meta/relics.js` import (which already brings `RELICS`; add `getRelic` if not present).

- [ ] **Step 2: Rebuild `_dryDockRows()`** — rental-aware rows

```js
_dryDockRows() {
  const rows = [];
  for (const r of RELICS) {
    const dives = this.meta.rentals[r.id] || 0;
    rows.push({ kind: 'relic', id: r.id, name: r.name, desc: r.desc, cost: r.cost,
      dives, equipped: this.meta.loadout.includes(r.id) });
  }
  if (this.meta.slots < SALVAGE.maxSlots) {
    rows.push({ kind: 'slot', id: 'slot', label: `➕ Loadout slot (${this.meta.slots} → ${this.meta.slots + 1})`, cost: this._dblCost(SALVAGE.slotCostBase, this.meta.slots - SALVAGE.startSlots) });
  }
  rows.push({ kind: 'close', id: 'close', label: 'Close', cost: 0 });
  return rows;
}
```

- [ ] **Step 3: `_dryDockAct()`** — confirm = rent/renew (auto-equip a fresh rent if a slot is free)

```js
_dryDockAct() {
  const rows = this._dryDockRows();
  const row = rows[this.ddSel]; if (!row) return;
  if (row.kind === 'close') { this._closeDryDock(); return; }
  if (row.kind === 'slot') {
    if (this.meta.salvage < row.cost) { this.ddDeny = 0.6; this.audio.gasp(); return; }
    this.meta.salvage -= row.cost; this.meta.slots += 1; saveSalvage(this.meta); this.audio.bank();
  } else if (row.kind === 'relic') {
    const wasRented = (this.meta.rentals[row.id] || 0) > 0;
    if (!rentRelic(this.meta, row.id)) { this.ddDeny = 0.6; this.audio.gasp(); return; }
    // First rent of an idle relic auto-equips if a slot is free (one-press flow).
    if (!wasRented && !this.meta.loadout.includes(row.id) && this.meta.loadout.length < this.meta.slots) {
      this.meta.loadout.push(row.id);
    }
    saveSalvage(this.meta); this.audio.bank();
  }
  const n = this._dryDockRows().length;
  if (this.ddSel >= n) this.ddSel = n - 1;
}
```

- [ ] **Step 4: Add `_dryDockEquipToggle(dir)`** — ←/→ = equip/bench

```js
_dryDockEquipToggle() {
  const row = this._dryDockRows()[this.ddSel];
  if (!row || row.kind !== 'relic') return;
  if (row.equipped) {
    this.meta.loadout = this.meta.loadout.filter((id) => id !== row.id);
  } else if ((this.meta.rentals[row.id] || 0) > 0 && this.meta.loadout.length < this.meta.slots) {
    this.meta.loadout.push(row.id);
  } else { this.ddDeny = 0.6; this.audio.gasp(); return; }
  saveSalvage(this.meta); this.audio.pickup();
}
```

- [ ] **Step 5: Wire ←/→ in `_updateDryDock`** (the shell handler the reef routes to)

In `_updateDryDock(dt, startEdge)`, add after the up/down moves:
```js
if (this.input.pressed('left') || this.input.pressed('right')) this._dryDockEquipToggle();
```
(Keep the existing `startEdge → _dryDockAct`, up/down `_dryDockMove`, `dd{i}` buttons, and `ddDeny` decay.)

- [ ] **Step 6: Rebuild `_dryDockScreen()`** — per-relic rental state + equip chip + low warning + hint

Replace the `rows.forEach` body so a `relic` row draws: the `name — desc` on the left; on the right, if `dives > 0` → `{dives} dives left` (tint `PAL.danger`-ish when `dives <= 3`) plus an equip chip `[✓]`/`[equip]`; else → `RENT {RENTAL.dives}d · ⚙{cost}` (afford-tinted). `slot`/`close` rows draw as before. Update the hint line to: `↑/↓ select · Space/A rent/renew · ←/→ equip · R/Esc close` (touch: `Tap a row to rent · tap ✓ to equip · Close to leave`).

- [ ] **Step 7: Touch equip-chip in `_syncTouchButtons`**

In the `state === 'drydock'` branch, alongside each `dd{i}` row button, for `relic` rows with `dives > 0` push a small `ddeq{i}` chip rect at the row's right edge. In `_updateDryDock`, handle `consumeButton('ddeq'+i)` → `{ this.ddSel = i; this._dryDockEquipToggle(); }` (mirror the existing `dd{i}` loop).

- [ ] **Step 8: Game-over "rental expired" line in `_gameOverScreen`**

Where the screen reads `this._reef.finalStats()`, if `stats.lapsedRentals?.length`, draw one line: `⚙ ${lapsed.map(id => getRelic(id)?.name || id).join(', ')} rental${lapsed.length>1?'s':''} expired` (small, near the payout/new-badges lines).

- [ ] **Step 9: Syntax + full suite**

Run: `node --check src/game.js && node --test 'tests/**/*.mjs'` → `fail 0`.

- [ ] **Step 10: Commit**

```bash
git add src/game.js
git commit -m "Rentals T4: Dry Dock rent/renew + equip toggle UX + game-over expiry notice"
```

---

## Task 5: Browser playtest + ship

**Files:**
- Modify: memory `backlog-balance-2026-08-23.md`

- [ ] **Step 1: Serve on a FRESH PORT** — `python3 -m http.server 8108 --directory .` (a port not used this session); open `http://localhost:8108/`.

- [ ] **Step 2: Playtest the Dry Dock rental flow (browser)**
```
- Menu → DRY DOCK. Relic rows show 'RENT 20d · ⚙{cost}'.
- Rent one (salvage drops, it auto-equips). Rent a 2nd; bench/equip with ←/→ (or the ✓ chip). Confirm SLOTS x/y respects the cap.
- Renew a relic (Space again) → back to 20 dives.
- Start a dive with 1+ equipped rentals; die (or clean-sweep). Return to Dry Dock: the equipped relic dropped 1 dive; a benched rented relic is unchanged.
- Run a rental to 0 across dives → it lapses (auto-unequipped) and the game-over screen shows '⚙ {name} rental expired'.
- Zero console errors; boot banner intact.
```
- [ ] **Step 3: Verify migration** — before this build, an existing player's save had `deepdescent.salvage.v1` with `unlocked`. In DevTools console set a v1 fixture, reload, and confirm the relics appear as full-period rentals (or note the fresh-save path if no v1 exists). Then stop the server.

- [ ] **Step 4: Full suite once more** — `node --test 'tests/**/*.mjs'` → `fail 0`.

- [ ] **Step 5: Merge + push**
```bash
git checkout main
git merge --no-ff feat/salvage-rentals -m "Merge balance: timed salvage rentals (dive-metered relic rentals replace permanent unlocks)"
git push origin main
```

- [ ] **Step 6: Update memory** — mark item (b) SHIPPED in `backlog-balance-2026-08-23.md` (main hash; v2 model + migration; rent/renew + equip-tick; Dry Dock ←/→ UX). Note both backlog items now done.

---

## Self-review (completed by planner)

- **Spec coverage:** §3 data/migration → T1; §4 mechanics → T2; §5 run-end wiring → T3; §6 Dry Dock UX → T4; §7 testing → T1/T2/T3 unit + T4 syntax + T5 browser; §8 deliverables → all tasks; §9 out-of-scope (slots permanent, reefRelics untouched, effects unchanged) → respected (T4 keeps the slot row; no reefRelics/RELICS-effect edits). No gaps.
- **Placeholder scan:** none — every code step has real code or an exact edit description; render tinting/geometry in T4 steps 6–8 are described concretely against the existing `_dryDockScreen`/`_syncTouchButtons` shapes.
- **Type/name consistency:** `meta.rentals` (bag), `RENTAL.dives`/`RENTAL.maxDives`, `rentRelic(state,id)→bool`, `tickEquippedRentals(state)→string[]`, `this.lapsedRentals`, `finalStats().lapsedRentals`, `_dryDockEquipToggle`, `ddeq{i}` touch id, key `deepdescent.salvage.v2` — used consistently across tasks.
