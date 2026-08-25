# Guardian Chest → Treasure Chest Madness — Design Spec

**Date:** 2026-08-24
**Status:** Approved design; pending implementation plan.

## Goal

Add an in-dive reward gate to the reef: a rare **ornate chest** guarded by a
new **guardian** monster. Kill the guardian → the chest opens → the diver
enters, launching the **Treasure Chest Madness** (match-3) minigame. Each
cleared match-3 level earns salvage to the shared economy. Ship a set of
**lifetime accumulators + badges** for match-3 and chest activity.

## Locked decisions

- **Spawn odds:** base ramps `min(0.25, 0.05 + 0.025·(reef−1))` — 5% at reef 1,
  reaching the 25% cap around reef 9. A **Dry Dock upgrade adds +20 percentage
  points** (boosted cap 45%).
- **Depth gate:** chest only spawns in the **last third of depth** (`y > WH·2/3`).
  Never higher. At most one per dive.
- **Guardian:** a **new, distinct** monster (not a regular kraken). Killing it is
  **required** to open the chest.
- **Dive state:** entering the chest **pauses** the dive (air/timer freeze);
  salvage banks to the shared economy; on finishing you **resume the dive**.
- **Per-level salvage:** each cleared match-3 level earns salvage (existing).

## Architecture

Entering the chest calls **`host.open('match3')`** (the Core stack), not the
nested-zone pattern. Pushing match-3 over the reef makes the Core tick only the
top-of-stack, so the reef (air, timers, enemies) freezes automatically; a later
`host.close()` pops back and resumes. This reuses the input plumbing that
already routes pointer/gamepad to match-3 when it is the active minigame
(`main.js`, `core.activeId()==='match3'`).

**Minor Core enhancement:** add an optional context arg —
`host.open(id, ctx?)` → `core.open(id, ctx?)` → `mg.enter(host, ctx?)` — so the
reef can tell match-3 it was chest-entered (`{ source: 'chest' }`). Backward
compatible (ctx optional; existing `enter(host)` unaffected). Enables the
"Hoard Cleared" badge and any future entry-specific flavor. Salvage per level is
unchanged regardless of source.

## Components

### A. Config — `src/config.js`
```js
export const SPECIAL_CHEST = {
  base: 0.05, perReef: 0.025, cap: 0.25,   // spawn chance ramp
  dryDockBoost: 0.20, boostedCap: 0.45,     // Dry Dock upgrade: +20pp
  minDepthFrac: 2 / 3,                       // last third of depth only
};
export function specialChestChance(reef, boosted) {
  const base = Math.min(SPECIAL_CHEST.cap, SPECIAL_CHEST.base + SPECIAL_CHEST.perReef * Math.max(0, reef - 1));
  return boosted ? Math.min(SPECIAL_CHEST.boostedCap, base + SPECIAL_CHEST.dryDockBoost) : base;
}
export const GUARDIAN = { hp: 14, radius: 60, killBonus: 4000, range: 340 };
```
(Values tunable. Guardian hp 14 vs kraken 8 — a real gate.)

### B. Guardian entity — `src/entities/guardian.js` (new)
Modeled on `entities/kraken.js` structure: `hp`/`maxHp`, `takeDamage(n)`,
`harpoonHit(h)`, `hits(diver)`, `update(dt,t,diver,chest)`, `draw(ctx,cx,cy)`,
`dead` flag after a short death animation. Distinct visual — an **armored
leviathan** coiled around the chest (its own silhouette/palette, not the
kraken's). Behavior: patrols/orbits the chest, lunges at the diver within
`GUARDIAN.range`; while alive the chest stays **sealed**.

### C. Chest state — reef `index.js`
`this.specialChest = { x, y, r, opened: false }` (null when none). Reset to null
in each `_generate*`. Rendered sealed → open.

### D. Spawn — reef `_generateWorld` (near the bonus-zone roll, ~index.js:486)
```js
const boosted = this._hasChestRelic();
if (Math.random() < specialChestChance(this.reef, boosted)) {
  const cands = floors.filter((f) => f.y > WH * SPECIAL_CHEST.minDepthFrac);
  if (cands.length) {
    const f = pickOne(cands);
    this.specialChest = { x: f.x, y: f.y - 20, r: 26, opened: false };
    this.chestGuardian = new Guardian(f.x, f.y - 60);
    this._enqueueToast('✨ SOMETHING SPECIAL LURKS BELOW…', PAL.key, 2.4);
  }
}
```
Guarded by `cands.length` so it silently no-ops if no deep floor exists.

### E. Guardian combat + open — reef `update`
- Include `chestGuardian` in the harpoon/charge hit tests (mirror the kraken
  paths at index.js:1631/1686). On `hp === 0`: award `GUARDIAN.killBonus`,
  `shake`/`flash`, `this.runGuardiansFelled++`, set `this.specialChest.opened =
  true`, toast `'🗝 THE CHEST OPENS!'`.
- Boss health bar: extend the existing bar (index.js:2404) to also render the
  guardian's `hp/maxHp` when on-screen (label `⚔ GUARDIAN`).

### F. Enter flow — reef `update` (zone==='reef' contact tests, ~index.js:1478)
```js
if (this.reentryT <= 0 && this.specialChest && this.specialChest.opened &&
    Math.hypot(d.x - this.specialChest.x, d.y - this.specialChest.y) < this.specialChest.r + d.radius) {
  this.runChestsOpened++;
  this.specialChest = null;                 // consume — no re-enter
  this.reentryT = 1.5;                        // grace on return
  this.host.open('match3', { source: 'chest' });
  this.input.endFrame(); return;
}
```
Reef is paused while match-3 is on top; `host.close()` (match-3 bail/finish)
resumes the dive with the chest gone.

### G. Dry Dock relic — `src/meta/relics.js` + reef check
Add a rentable relic, e.g. `siren` — **"Siren's Lure"**, desc "+20% chance a
guarded chest appears". `this._hasChestRelic()` returns true when that relic is
equipped/active (mirror the existing relic-active check). Feeds `boosted`.

### H. Rendering — reef render (zone==='reef')
Sealed ornate chest (large, gilded, closed) with the guardian above it; when
`opened`, an open glowing chest + an **"⤓ ENTER"** prompt when the diver is
near. Draw in the reef entity pass; reuse `PAL.gold`/`PAL.key`.

## Accumulators, tracks & badges

### Lifetime stats — `src/meta/stats.js` `STAT_KEYS` (append)
`m3Pearls, m3Gems, m3Coins, m3Explosions, chestsOpened, guardiansFelled`.

### Progressive tracks — `src/meta/progressive.js` `TRACKS` (append 6)
| id | stat | label | glyph | tiers |
|---|---|---|---|---|
| m3pearls | m3Pearls | Pearl Diver | 🫧 | 100 / 500 / 2000 |
| m3gems | m3Gems | Gem Cutter | 💎 | 100 / 500 / 2000 |
| m3coins | m3Coins | Coin Collector | 🪙 | 100 / 500 / 2000 |
| m3boom | m3Explosions | Demolitionist | 💥 | 25 / 150 / 600 |
| chests | chestsOpened | Treasure Hunter | 🧰 | 1 / 10 / 50 |
| guardian | guardiansFelled | Leviathan Slayer | 🐉 | 1 / 10 / 50 |

`TRACKS.length` 10 → 16, `PROGRESSIVE_IDS.length` 30 → 48. **Update the count
assertions** in `tests/game/progressive-badges.test.mjs:17-19`.

### One-time badges — `src/meta/badges.js` `BADGES` (append 4)
| id | name | glyph | test(s) |
|---|---|---|---|
| firsttreasure | First Treasure | 🧰 | `s.chestsOpened >= 1` |
| guardiandown | Guardian Down | 🐉 | `s.guardiansFelled >= 1` |
| comboartist | Combo Artist | 🎇 | `s.m3Combo >= 1` |
| hoardcleared | Hoard Cleared | 🏆 | `s.hoardCleared` |

### Credit paths (canonical)
- **Salvage:** `host.economy.earn({ salvage })` per level (already wired).
- **Match-3 stats/badges/tiers:** accumulate during play into module fields —
  `m3Pearls/m3Gems/m3Coins` from `res.cleared[0|1|2]`, `m3Explosions` from
  `res.blasts`, `m3Combo` when a swap moves two specials together (module-side
  check, no engine change), `hoardCleared` when a `source:'chest'` run clears
  its last level — then on **`exit()`** call
  `host.progression.recordRun({ runStats, runDelta })` and
  `host.achievements.unlock(id)` for each returned `newBadges`/`freshTiers`.
- **Reef chest/guardian stats/badges:** add `chestsOpened`/`guardiansFelled` to
  the reef `_runDelta()` and `_runStats()`, folded at `_gameOver` (existing
  path). Reef awards `firsttreasure`/`guardiandown`.
- **Steam mirror:** add all 6 tier-id roots (18 ids) + 4 badge ids to
  `desktop/achievements.json`.

Partial-summary safety: badge predicates read fields absent from the other
summary as `undefined` (→ false via `safeTest`), so match-3 never awards reef
badges and vice-versa.

## Testing

- **Pure engine/config:** `specialChestChance(reef, boosted)` ramp + both caps;
  depth-gate placement (`y > WH·2/3`); `Guardian.takeDamage`/death (mirror
  kraken tests).
- **Meta:** new `STAT_KEYS` round-trip via `addRun`; new `TRACKS` bind real
  stats + ascending tiers (update 10/30 → 16/48 counts); new badge predicates
  spot-checked; `recordRun` folds a match-3 delta and awards.
- **Match-3 counting:** accumulation from `applySwap` results (reuse the board
  result shape already under test).
- **Browser E2E:** force a chest spawn (temp high odds), verify the tell toast,
  guardian fight, chest open, ENTER prompt, enter → match-3 → close → dive
  resumes with air frozen during; Trophy Wall shows new tracks/badges.

## Edge cases

- No deep floor in a reef → chest silently doesn't spawn (guarded).
- Die during the guardian fight → chest never opens; stats fold normally.
- Bail out of match-3 (Esc) → returns to dive, chest already consumed.
- `reentryT` grace prevents an instant re-trigger on return (chest is null
  anyway).
- `host.open` context is optional — existing menu launch (`enter(host)`)
  unaffected.

## Out of scope / tunables

- Combo-only "reward round" (fewer levels when chest-entered) — not now; play the
  normal level set.
- Exact tier thresholds, guardian hp, and spawn constants are all tunable.
- Distinct guardian art can start simple (silhouette + palette) and be polished
  later.
