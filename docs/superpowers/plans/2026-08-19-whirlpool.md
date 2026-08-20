# Whirlpool — Survival Level — Spec + Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Playable push per phase.

**Goal:** A special "whirlpool" zone — the diver is sucked in and swept ever-faster down the throat; steer to dodge obstacles and grab bubbles (air) + loot; hitting an obstacle OR running out of air **exits the level with NO life lost** (it just ends). Stay-alive-as-long-as-you-can. **Speed breaks award Salvage-Log Salvage/relics** + score; collected loot banks on exit. Roadmap item 3; design in memory `special-levels-design` (user answers: rewards = Salvage-Log relics).

**Architecture:** New `zone === 'whirlpool'` on the special-zone scaffold (mirror `_enterAbyss`/`_exitAbyss`/`_snapshotReef`/`_restoreReef`, a maw-style entrance, `reentryT`). The "sweep" is a strong, accelerating downward current pulling the diver through a debris shaft (reuse `CURRENT`-style pull, ramped). Rewards call the already-built `src/meta` Salvage module (C3). Bubbles reuse `BigBubble`; loot/pearls reuse Treasure/Black-Pearl (C2).

**Tech:** Vanilla ES modules, Canvas. No build step, no deps. Node tests for pure logic (speed-break payout, exit conditions).

## Global Constraints
- No build step, no deps. `src/stage/*` untouched. Reuse the zone scaffold + current + meta module — don't reinvent.
- Neither exit condition (hit / air-out) costs a life — the whirlpool never calls `_loseLife`.
- All existing tests stay green. Pure logic (speed→reward, exit) Node-testable.

## Design
- **Entrance:** a whirlpool maw on some reefs (independent roll, like the abyss/stage entrances — coexists). Swim in → `_enterWhirlpool`.
- **The sweep:** the diver is pulled DOWN the whirlpool's throat by a strong current whose speed **ramps with time** (`whirlSpeed` grows). The player steers **laterally** (and can resist a little) to weave through obstacles. It reads as being dragged deeper and faster into the vortex.
- **Obstacles:** rock/debris chunks placed down the shaft (procedural, denser as you descend). **Contact = the run ends** → exit to the reef (no life).
- **Collectibles:** **bubbles** (air, reuse `BigBubble` +air on touch) and **loot/pearls** scattered down the shaft — grab while dodging. Collected loot goes to `carried` / pearls to `carriedPearls`, banked on exit.
- **Air:** drains as normal (bubbles refill). **Air ≤ 0 = the run ends** → exit (no life).
- **Speed breaks:** at `whirlSpeed` thresholds (tiers), award a chunk of **Salvage** + score ("SPEED II · +Salvage"), rising per tier — the deeper/faster you survive, the bigger the meta payout. (Pure `whirlpoolReward(tier)`.)
- **Exit:** on hit or air-out (or a manual bail via the entrance up top), `_exitWhirlpool` → `_restoreReef`, bank collected loot + pearls + the earned Salvage, show a survival summary (max speed tier reached, Salvage earned), `reentryT` grace. No life lost.

## Phases (each a playable push)

### Phase 1 — The whirlpool sweep + survival
- Config `WHIRL = { baseSpeed, accel, maxSpeed, entranceChance, tierStep, ... }`.
- `whirlpool` entrance spawn (independent roll, mirror abyss entrance). Reset `whirlEntrance` in all the generator/reset sites alongside `abyssEntrance` (avoid the ghost-portal class of bug).
- `_enterWhirlpool`/`_exitWhirlpool` (mirror abyss), `_generateWhirlpool()` — a tall shaft (Cave or a procedural column) seeded with **obstacles** down its length + an exit at the top.
- The sweep: while `zone==='whirlpool'`, apply an accelerating downward pull to the diver (`whirlSpeed += accel*dt`, capped); lateral steering from input; walls of the shaft bound it.
- Exit conditions: obstacle contact OR air≤0 → `_exitWhirlpool()` (NO `_loseLife`). Score accrues with survival (depth/time).
- HUD: a speed/tier readout; "no life lost — survive!" framing.
- TEST (pure): `whirlpoolReward(tier)` monotonic; the exit path never calls `_loseLife` (a small stub/inspection).
- **Playable:** dive the whirlpool, get swept down dodging rocks, exit on a hit (no life), keep your score.

### Phase 2 — Collectibles + Salvage speed-break rewards
- Seed bubbles (air) + loot/pearls down the shaft; collection → carried / carriedPearls / air.
- Speed-break tiers: when `whirlSpeed` crosses a tier, award `whirlpoolReward(tier)` Salvage (persist via `src/meta`) + score, with a flourish.
- On exit, bank collected loot + pearls (→ Salvage) and show a summary (tier reached, Salvage earned).
- TEST: crossing a tier awards once (no double); exit banks collected loot/pearls.
- **Playable:** full loop — survive deep, grab air/loot, earn Salvage at speed breaks, bank on exit.

### Phase 3 — Polish
- Swirl/vortex visual (rotating current field, spiral streaks), a speed meter, escalating audio, difficulty/reward balance. Docs.

## Compression notes (C-refs from the roadmap)
- C1: copy the abyss/temple enter/exit/snapshot/portal machinery, rename to whirlpool.
- C2: reuse Black Pearls + Treasure + BigBubble as the shaft collectibles.
- C3: rewards go straight into `src/meta` (Salvage) — no new progression system.
- Sweep: reuse the current-apply pattern, ramped.
