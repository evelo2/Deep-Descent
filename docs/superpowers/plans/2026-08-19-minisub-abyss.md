# Mini-Sub / Deep-Dive Abyss — Spec + Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Playable push per phase.

**Goal:** A new "abyss" special zone reached from the reef — extreme depth, rich loot + Black Pearls — where **air drains 150% on foot**, plus a **buyable mini-sub** that negates the penalty while aboard. From the roadmap (item 2); design in memory `special-levels-design`.

**Architecture:** A new `zone === 'abyss'` built on the existing special-zone scaffold (mirrors whale/temple: `_enterAbyss`/`_exitAbyss`, `_snapshotReef`/`_restoreReef`, an entrance portal on the reef, an ascent exit portal, `reentryT` grace). Air-drain reuses the existing per-reef `oxyMult` path with an extra zone multiplier (C5). Loot reuses treasures + Black Pearls (C2). The sub reuses the shop-purchase pattern (spend gold).

**Tech:** Vanilla ES modules, Canvas. No build step, no deps. Node tests for pure logic.

## Global Constraints
- No build step, no deps. `src/stage/*` untouched (this is reef/zone code).
- Reuse the whale/temple zone machinery — do NOT reinvent enter/exit/snapshot.
- All existing tests stay green. Pure logic (air-mult, sub-owned gating) Node-testable.

## Design
- **Entrance:** on some reefs, an **abyss entrance** portal (like `templeGate`/stage entrance) spawns on the reef (deep, near the floor). Swimming into it enters the abyss.
- **The abyss zone:** a deep, dark, loot-rich cave (generate below the normal world depth or a dedicated deep cave). Seed rich treasures + extra Black Pearls. An **ascent exit portal** near its top returns you to the reef.
- **Air pressure:** on foot in the abyss, air drains at **150%** (`ABYSS.airMult = 1.5`) on top of the reef `oxyMult`. This is the risk of going without the sub.
- **The mini-sub:** a **buyable** vehicle (gold, one-time **per reef** — resets when you sail on). Bought at a **sub dock** by the abyss entrance (a shop-style "Buy Sub" — reuse the purchase/deduct-gold pattern). Once owned (`this.hasSub` for the reef), **entering the abyss puts you in the sub**: the 150% penalty is negated (normal drain) and the diver is tougher (e.g. contact does not cost a life while the sub has hull — or simply negates the first hit per dive) and reads as a sub (bigger body/visual). You **disembark by ascending to the exit** (leaving the abyss). Diving the abyss without the sub = on foot at 150%.

## Phases (each a playable push)

### Phase 1 — The abyss zone (on foot, risky)
- Config `ABYSS = { airMult: 1.5, subCost: 400, ... }`.
- Spawn an abyss entrance portal on some reefs (in `_generateWorld`, like the temple gate — gate by reef/chance).
- `_enterAbyss(entrance)` / `_exitAbyss()` mirroring `_enterTemple`/`_exitTemple` (snapshot reef, `_generateAbyss()`, set `zone='abyss'`, `reentryT` on exit).
- `_generateAbyss()`: a deep loot-rich cave (reuse Cave + treasure/pearl seeding) with an ascent exit portal (`this.abyssExit = {x, y:OPEN_BAND-6, r:46}` style) — reuse the temple/whale exit pattern + the portals list (`~357-365`).
- Air drain: in the drain path (`~1160`), when `zone==='abyss'` and NOT in the sub, multiply drain by `ABYSS.airMult`.
- Reef-side hint + entry proximity (mirror stage/temple entry at `~1236`).
- TEST: pure — the abyss air multiplier applies only in the abyss on foot; a small `_generateAbyss` smoke (spawns exit + some treasures).
- **Playable:** dive the abyss on foot, grab rich loot + pearls at 150% air, ascend to leave.

### Phase 2 — The buyable mini-sub
- A **sub dock** near the abyss entrance offering "Buy Sub" (gold, `ABYSS.subCost`, once per reef; `this.hasSub` reset each reef in the sail/newReef path).
- Entering the abyss with `hasSub` → `this.inSub = true` (board); the 150% drain is negated; add a modest toughness (negate first-hit per dive, reuse the plating pattern) and a sub visual/bigger body. `inSub=false` on exit/disembark.
- Reuse the shop purchase/deduct-gold code; a prompt/button by the entrance.
- TEST: sub-owned negates the abyss air multiplier; sub resets per reef.
- **Playable:** buy the sub, dive the abyss safely, ascend to disembark.

### Phase 3 — Polish
- Sub movement/feel (heavier/slower or a headlight in the dark abyss), loot balance, HUD ("IN SUB" / air-penalty warning on foot), audio. Docs.

## Compression notes
- Enter/exit/snapshot/portals: copy the temple pattern verbatim, rename to abyss.
- Black Pearls + treasures: reuse as-is (deep placement = the abyss's whole point).
- Air mult: one extra factor in the existing drain line.
- Sub purchase: reuse `_shopBuy`-style gold deduction.
