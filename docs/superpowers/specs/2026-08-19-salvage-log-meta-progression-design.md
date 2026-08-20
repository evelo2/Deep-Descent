# The Salvage Log — Meta-Progression Design Spec

**Date:** 2026-08-19
**Status:** Approved for planning (design settled in brainstorm; user wants incremental playable delivery)
**Related:** the "Economy of Descent" critique (fix P2), memory `meta-progression-design`.

## Problem

Deep Descent is a fun ~15-minute score-chase roguelike, but a run leaves nothing
behind except a high-score number. There is no persistent character progression —
every game restarts from reef 1 with a bare harpoon + net, 0 gold. The player asked
for "some kind of progression of character that remains."

## Goals

- A **persistent layer** that grows across runs and makes a veteran account
  meaningfully stronger — a **strong power fantasy expressed through unlockable
  content (relics), not stat inflation** (the Dead Cells / Hades model: unlocks are
  powerful AND reliably available, so your growing collection is the fantasy).
- Keep the **roguelike stakes** intact: in-run gold, lives, weapons, and reef all
  still reset each run. Only the meta layer persists.
- Every run — win or death — **feeds progression**, so failure still rewards.

## Non-Goals (v1)

Deferred to later passes: consumable weapon power-ups, gating the advanced weapons
behind meta-unlocks, new reef biomes/creatures. v1 is **relics only**.

## Global Constraints

- No build step, no dependencies. Vanilla ES modules on the 2D canvas.
- Persistence via `localStorage` (as the high-score already uses), under a
  **versioned key** so the schema can evolve safely.
- `src/stage/*` stays canvas-free; game/render logic in `src/game.js` / `src/render/*`.
- Pure economy/relic/persistence logic must be **Node-testable** (no DOM) — factor
  it into a testable module (`src/meta/salvage.js`) the Game imports.
- All existing `tests/**/*.test.mjs` stay green.

## The Currency — Salvage

A single persistent currency, **Salvage** (renameable), stored in `localStorage`.
Earned two ways:

1. **Run-end milestones** — computed when a run ends (game-over OR victory):
   `salvage = deepestReef * PER_REEF + bossesFelled * PER_BOSS + relicsBanked * PER_RELIC + blackPearlsBanked * PER_PEARL`
   (constants in `config.js SALVAGE`). Shown on a **payout screen** appended to the
   game-over/victory flow ("SALVAGE EARNED +N", running total).
2. **Black Pearls** — a rare collectible (see below) that converts to Salvage when
   banked.

Salvage only accumulates; it is spent in the Dry Dock. (Unlike in-run gold, it never
resets.)

## Black Pearls — the hunt

- A distinct collectible, **1–2 per reef**, seeded **deep and/or guarded** (riskier
  placement than normal loot — near the bottom, in dark zones, or by a guardian).
- Must be **banked** (like loot) to be kept; a Black Pearl in `carried` is lost on a
  fatal run just like loot. Banking a pearl grants Salvage immediately (tracked in a
  per-run `blackPearlsBanked` counter for the payout, plus direct Salvage).
- Distinct sprite/color so it reads as special. Counts toward the milestone payout.

## Relics — the unlockable passives

~10 starter relics, **utility/variety-leaning** (deliberately NOT "+gold/+air" that
merely duplicate the in-run shop and worsen gold-inflation). Each is a passive applied
for the whole run when equipped. Data-driven in `src/meta/relics.js`:

```
{ id, name, desc, cost /* Salvage */, apply(game) /* sets a flag/modifier */ }
```

Starter pool (exact effects tuned in the balance task):
| id | name | effect |
|----|------|--------|
| lungs | Reinforced Lungs | start each reef with +air (airMax bump at run start) |
| sonar | Sonar | loot + Black Pearl blips on the minimap |
| fins | Ballast Fins | faster swim, less current shove |
| barbs | Barbed Harpoon | harpoon pierces / +damage |
| secondwind | Second Wind | air floors higher after a hit |
| plating | Pressure Plating | negate the first hit each dive |
| chum | Chum Ward | creatures notice you from farther away is reduced (stealth) |
| eye | Salvager's Eye | Black Pearls easier to spot; +hunt yield |
| bellrig | Bell Rigging | bank at a dive bell for FULL value (erases the depth discount) |
| ballast2 | (reserve) | (spare slot for a 10th during balance) |

Relic effects hook existing systems via flags the Game reads (airMax, diver speed,
harpoon damage, hit handling, minimap draw, bell bank rate). Each hook is small and
localized.

## Loadout & Slots — the power lever

- Relics are **equipped into a limited number of slots** before a run. The equipped
  loadout is applied at `start()`.
- **Slots start at 2 and unlock up to 5** by spending Salvage (escalating cost). Slot
  count is the primary power-fantasy escalator — a veteran running 5 stacked relics
  clearly out-dives a fresh account, but each run is still played on skill.

## The Dry Dock — the meta UI

A new game state `drydock`, reached from the main menu (a button/key on the menu and
game-over screens). Shows:
- Salvage balance.
- The **relic collection**: each relic as a row — locked (with its Salvage cost + a
  Buy action) or unlocked (with an Equip/Unequip toggle into a slot).
- The **loadout**: the N equipped slots; unlock-next-slot as a purchasable row.
- Navigation mirrors the shop (up/down select, action to buy/equip, close). Touch
  buttons per row, like the shop.
Leaving the Dry Dock returns to the menu. Starting a run applies the current loadout.

## Persistence

`localStorage` key `deepdescent.salvage.v1` holding JSON:
```
{ salvage: number, unlocked: string[] /* relic ids */, slots: number, loadout: string[] /* equipped ids */ }
```
Load at construct; save on every Salvage change / unlock / equip / slot purchase.
Versioned key; a malformed/absent value loads sane defaults (salvage 0, unlocked [],
slots 2, loadout []). All serialization is pure + Node-tested.

## Integration points (game.js)

- `constructor`: load the Salvage save; expose `this.meta`.
- `start()`: apply equipped relics' effects to the fresh run (reset per-run flags
  first, then apply).
- reef generation: seed 1–2 Black Pearls per reef (deep/guarded).
- banking (`_bankLoot`): a banked Black Pearl grants Salvage + increments the run
  counter. (Black Pearls are tracked separately from loot value.)
- run-end (`_gameOver` / `_win`): compute + award the milestone Salvage, set up the
  payout screen, persist.
- main menu / game-over: a "DRY DOCK" entry → `state = 'drydock'`.

## Balance philosophy

Strong power fantasy, but a skilled fresh run stays viable. Relics lean into utility
and reliability (sonar, fins, defense, the bell-rig) over raw gold/air that duplicate
the shop. Slot growth (2→5) is the main power ramp. Salvage earn rates tuned so the
first relic comes after ~1–2 runs and the full collection over many.

## Testing

- **Node (authoritative):** `tests/game/salvage.test.mjs` — milestone Salvage math;
  Black-Pearl → Salvage banking; persistence serialize/deserialize round-trip incl.
  malformed input → defaults; relic `apply` sets the expected flags on a stub game;
  slot-unlock cost curve.
- Existing suites stay green.
- **Visual:** Dry Dock UI + payout screen in-browser.

## Build phasing (→ implementation plan)

Each phase is a **playable push**:
1. **Salvage core + payout**: currency, persistence module, milestone computation,
   the run-end payout screen. (Testable; the number goes up each run.)
2. **Relic model + application**: relic data + `apply` hooks, applied at run start
   from a (temporary hardcoded) loadout. A couple of starter relics working in-run.
3. **Dry Dock UI**: view Salvage, unlock relics, equip loadout, buy slots. Now the
   loop is real end-to-end.
4. **Black Pearls**: spawn deep/guarded, bank → Salvage, on the payout.
5. **Full relic pool (~10) + effects + balance pass.**
6. **Polish**: HUD/menu integration, save-version safety, final balance.

## Risks

- Persistence corruption → guard with try/catch + defaults, versioned key.
- Relic effects touching many systems → keep each hook tiny + flag-based; test `apply`.
- Power creep vs. the gold economy → utility-leaning relics; balance task; monitor.
