# Deep Reefs — Depth Tiers, Crush Gear & the Deep Economy — Design

**Status:** approved in chat 2026-09-02. This is **Spec 1 of 3** in the "deep
descent" arc agreed in brainstorming:

1. **This spec** — the progression skeleton: a stepped world that gets deeper and
   wider, fixed absolute danger depths, tiered pressure gear, the crush alarm,
   and the treasure economy that pays for it all.
2. **Spec 2 (later)** — content: new enemy types (armoured variants) and new
   treasure kinds, slotted into the existing reef-gated tables.
3. **Spec 3 (later)** — whatever the deep tiers turn out to need once they are
   playable.

Nothing here depends on unmerged work. `main` is the base.

## Problem

Reefs are unbounded (`this.reef += 1` forever, `reef/index.js:1921`) but they do
not change character. Past reef 3 a dive is the same 2760 × 4200 world with more
creatures in it, and difficulty arrives almost entirely as a number the player
never sees: `GAME.oxygenPenaltyPerReef` silently multiplies air drain by 15% per
reef, capped at ×8.

That has three consequences:

- **The world has no destination.** Every reef bottoms out at the same 411 m.
  There is nowhere new to go, so there is nothing to buy gear *for*.
- **Difficulty is invisible.** A rising drain multiplier is felt as "I keep
  dying lately", not as a place that is dangerous. Nothing warns, nothing marks
  the danger, nothing rewards taking it on.
- **The gear ladder has no top.** The Depth Valve is a single 400g unlock and the
  Air Tank tops out at Lv6. There is no purchase that means "I can now go
  somewhere I could not go before".

## Goal

Make **depth itself** the entire difficulty and reward axis. The world gets
deeper and wider in four big, learnable steps, from a 411 m floor to 1800 m; two
fixed depth lines — the same metres in every reef — mark where air gets
expensive and where the water kills you; tiered pressure gear buys the right to
cross the second line; and the treasure migrates down past both, so the money is
exactly where the danger is.

## Locked decisions

Settled in brainstorming. Several cheaper designs were rejected because of
these, so change them deliberately or not at all.

1. **Danger depths are fixed absolute metres, identical in every reef.** Not
   scaled per reef, not a fraction of world height. The player learns the lines
   once and they are true forever.
2. **World size grows in TIERS, not per reef.** Four sizes total, stepping at
   reefs 4, 11 and 21, final at reef 40. A per-reef ramp was rejected: a drift
   nobody can perceive teaches nothing, and it would mean an unbounded number of
   distinct cave sizes to reason about.
3. **The per-reef air multiplier is deleted outright.** Not flattened, not
   reduced — removed. Depth now scales, so a reef multiplier double-counts.
4. **The crush timer is run-ending, regardless of lives.** `deathCause:
   'crushed'`. Costing a life was rejected: with a life ceiling of up to 6 it
   would license six free trips below crush depth.
5. **Timer recovery is gradual, not instant** — 1 s of timer per 1.5 s in safe
   water. This is the anti-yo-yo rule; without it the deep band is farmed by
   dipping and popping.
6. **The Depth Valve is tiered; it is NOT replaced by a new item.** A separate
   "Pressure Suit" was rejected — it would create a second money sink at the same
   reef gate, and the Valve is the item that historically lost that competition
   (see the 2026-09-01 rebalance).
7. **A Valve level buys crush depth AND a larger share of the depth-drain
   discount.** *(Amended 2026-09-02, see "Why decision 7 changed".)* The Air Tank
   still gains nothing new: Tank = how long you can stay, Valve = how deep you
   can go and how cheaply you breathe down there.
8. **Total treasure grows with tier AND migrates downward.** Both, not either.
   Growth alone leaves the shallows worth farming; migration alone starves an
   economy whose gear ladder now runs to thousands of gold.
9. **Air vents and dive bells are deliberately NOT scaled with world size.** The
   refuge network thins out on its own as the world grows — this is the "fewer
   oxygen stops" requirement, and it costs no code.
10. **Max lives becomes a Dry Dock permanent unlock**: base ceiling 3, +1 per
    purchase, configurable cap of 6. This lowers today's free ceiling of 5 — an
    accepted, deliberate nerf that converts a giveaway into a meta-progression
    ladder.
11. **Reef 40 caps world size only.** It is not an ending. Reefs continue past 40
    at tier-4 size. No victory screen, no run cap, no new achievement id.

### Why decision 7 changed

The original decision was that Valve levels buy crush depth *only*, keeping the
gear lines perfectly separate. That held while the deepest water was 911 m. It
does not survive an 1800 m floor.

The depth term of the air drain is **linear** in depth
(`AIR.drainDepthFactor`). At 1800 m, with the oxygen line steepening the portion
below 250 m by ×1.6, the depth term alone is ~19.7 air/s. Against a fully
upgraded 250-air tank, a diver standing on the tier-4 floor with a crush-depth-only
Valve drowns in about eleven seconds — the crush timer would never get the chance
to matter.

So the Valve's discount **scales with level**, sized so that each tier's floor
costs roughly what the tier-1 floor costs today. The rule the player learns is
unchanged and still one sentence — *each tier of the world needs the next Valve* —
it simply now means "so you can breathe down there" as well as "so you can go
there". Tank and Valve remain non-overlapping.

## Constraints

Inherited and unchanged: **no build step**, no bundler, no new dependency. Must
pass the plain-Node test suite and `npm run typecheck` at 0. The persisted key
set (`deepdescent.badges.v1`, `.stats.v1`, `.salvage.v2`, `.progress.v1`) is
frozen — this spec adds *fields inside* existing keys and renames nothing.

Two further constraints come from the engine:

- **World extents must never be captured at module scope.** This is the same
  hazard `setViewport` already forced for `W`/`H`, and it is the single most
  likely way to break this feature subtly.
- **Web Audio cannot be verified by the Node stub.** The klaxon needs a real
  `OfflineAudioContext` render. See "Testing".

## Architecture

### Live world size

`WORLD.WW` / `WORLD.WH` become **live**, exactly as `WORLD.W` / `WORLD.H`
already are. Two additions to `src/config.js`:

```js
export function worldSize(reef)    // pure: reef -> { WW, WH }  (table lookup)
export function setWorldSize(reef) // assigns WORLD.WW / WORLD.WH
```

`setWorldSize(reef)` is called once at the top of the reef's `_generateWorld()`,
**before** the `Cave` is constructed (the `Cave` derives `GW`/`GH` from the
extents in its constructor, so it must see the new values).

Only **three** sites capture the extents at module scope and must become live
reads:

| File | Line | Today |
|---|---|---|
| `src/game.js` | 26 | `const { WW, WH, OPEN_BAND, CELL } = WORLD;` |
| `src/minigames/reef/index.js` | 64 | same |
| `src/systems/cave.js` | 7 | same |

Everything else already reads `WORLD.WW` / `WORLD.WH` live — `render/background.js`,
`render/depthgauge.js`, `entities/diver.js`, `entities/boat.js`,
`entities/creatures.js`, `bellBankRate` in `config.js`, and the whirlpool.
`src/core/world/index.js` destructures *inside* `placeDiver()` deliberately, for
this exact reason. `OPEN_BAND` and `CELL` are genuinely constant and may stay
destructured.

### The tiers

| Tier | Reefs | `WW × WH` | Floor |
|---|---|---|---|
| 1 | 1–3 | 2760 × 4200 | 411 m — **identical to today** |
| 2 | 4–10 | 3600 × 7090 | 700 m |
| 3 | 11–20 | 4200 × 11590 | 1150 m |
| 4 | 21–40+ | 4800 × 18090 | 1800 m |

Tier 1 being byte-identical to today is the regression anchor for the whole
spec: any change in reef 1–3 behaviour is a bug, and it is asserted as such.

Because only four sizes ever exist, cave-generation cost can be measured
exhaustively rather than sampled — which matters, because tier 4 is **7.5× the
area of tier 1** (24,160 cave cells against 3,220). See "Risks".

### What scales for free

Most of the world already places by *fraction* of world height and therefore
follows a taller world with no code change: dive bells (`BELL.minDepthFrac`
0.67), dark zones (0.38), the Guardian Chest (`SPECIAL_CHEST.minDepthFrac` 2/3),
pearl clams (`GAME.pearlMinDepthFrac`), the giant clam (0.62), whale skeletons
(0.72), and the shallow/mid/deep fauna bands in the main spawn loop.

The **value** functions must NOT stay fractional — see "The deep economy".

### Rejected alternatives

- **Keep the world fixed; just push objectives deeper.** Cheapest option, and it
  avoids the live-extents work entirely. Rejected in brainstorming: "deeper" that
  is only a re-placement of loot inside the same column does not read as a deeper
  world, and it leaves the 411 m floor as a permanent ceiling on the arc.
- **Per-reef world growth.** Rejected per Locked decision 2.
- **A new tiered Pressure Suit item.** Rejected per Locked decision 6.

## Component: the depth model

All of this is pure and Node-testable, following the split `pressureDepth()` and
`bellBankRate()` already use.

### Deletion first

`GAME.oxygenPenaltyPerReef` and `GAME.oxygenPenaltyCap` are removed.
`oxygenMultiplier(reef, zone, inSub)` in `reef/index.js:95` loses its `reef`
parameter entirely and becomes `oxygenMultiplier(zone, inSub)`, retaining only
the abyss/sub term it also carries. The parameter is dropped rather than left
unused so nothing reads as if reef still mattered.

`tests/game/economy.test.mjs` and `tests/game/abyss-air.test.mjs` both assert on
the reef multiplier and need rewriting, not adjusting.

### Two bands, fixed in metres

| Band | Depth | Effect |
|---|---|---|
| Normal | 0 – 250 m | today's `AIR.drainDepthFactor`, unchanged |
| Oxygen line | below 250 m | the depth term steepens ×1.6 |
| Crush line | below your crush depth | alarm + run-ending timer |

250 m sits in the bottom third of the *tier-1* world, so reefs 1–3 teach the
oxygen line gently, at the very bottom, before any tier-2 world exists.

**×1.6 is the primary balance dial of this spec.** It is the number to move
first if the deep tiers feel wrong.

### The Valve becomes a scaling discount, not a clamp

`pressureDepth()` today *clamps* the depth term at `VALVE.holdDepthM` (150 m):
every depth below that costs identically. That flatly cancels any deeper oxygen
line — a Valve owner would never feel it, and the deep tiers would be cheaper to
breathe in than the shallow ones.

The Valve instead **reduces the depth term by a percentage that grows with
level**, sized so each tier's floor costs roughly what the tier-1 floor costs
today:

| Valve | Depth-term discount | Depth term at that tier's floor |
|---|---|---|
| none | 0% | 3.5 /s at 400 m |
| Lv1 | 40% | ~4.2 /s at 700 m |
| Lv2 | 63% | ~4.5 /s at 1150 m |
| Lv3 | 76% | ~4.7 /s at 1800 m |

Value tests pin **Lv1 parity at 240 m**: the shipped clamp charges 1.08 /s
there, the new Lv1 discount charges 1.04 /s — within 4%, so the item a player
already owns behaves as it did where it was tuned.

At the old 411 m floor the numbers deliberately **diverge**: the clamp charged
1.08 /s, Lv1 now charges 2.19 /s, because the oxygen line has raised the
unvalved cost there too (2.96 → 3.66 /s). The valve's *share* of the saving
falls from 34% to 23% at that depth. This is intended — the item is no longer a
hard floor on air cost, which is what made a deeper oxygen line impossible — and
the 411 m figure is pinned as a new number rather than as parity.

### Crush depth and the Valve ladder

One Valve level per world tier. The rule is one sentence: *each tier of the
world needs the next Valve.*

| Valve | Cost | Crush depth | Reaches |
|---|---|---|---|
| none | — | 400 m | all of tier 1; the top ~57% of tier 2 |
| Lv1 | 400 | 720 m | tier 2's floor |
| Lv2 | 800 | 1160 m | tier 3's floor |
| Lv3 | 1600 | 1820 m | tier 4's floor |

Costs follow the existing `_dblCost` doubling used by Tank and Targeting, and
are a balance dial. The top of every tier is always divable without gear — you
are denied the *floor*, which is precisely where the treasure has moved.

### The crush timer

A small explicit state machine on the reef: `safe → alarmed → crushed`.

- Crossing below your crush depth enters `alarmed`: klaxon starts, timer runs
  from **14 s**.
- Returning above it re-enters `safe`; the timer refills at **1 s per 1.5 s** of
  safe water, never instantly, and never past 14 s.
- The timer reaching zero ends the dive: `deathCause: 'crushed'`, ignoring
  remaining lives.

**Scope line: crush depth applies in the reef zone only.** The abyss, temple,
whale belly and whirlpool are self-contained, time-boxed and separately tuned
(the abyss already carries its own `airMult` and extraction countdown). Adding a
second lethal timer inside them is a balance problem this spec does not need to
solve.

## Component: the deep economy

### Counts grow by tier

The spawn counts are **absolute, not densities** — loose treasure is a hard `40`
(`reef/index.js:390`), shells are `spread(C.floors(), 34, 150)`, wrecks are `4`.
A tier-4 world is 7.5× the area of tier 1, so leaving these alone would make the
late reefs drastically *emptier*, not richer.

| Per reef | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| Loose coins/gems | 40 | 70 | 110 | 160 |
| Clams / chests | 34 | 50 | 72 | 100 |
| Wrecks (chest + 3 gems each) | 4 | 6 | 9 | 12 |

Counts grow more slowly than area on purpose: a tier-4 reef should feel vast and
sparse in absolute terms, with its wealth *concentrated* rather than spread.

### Placement migrates downward

A pure `treasureDepthWeight(depthFrac, tier)` biases every placement roll, applied
as a rejection weight at the existing `spread(C.floors(), …)` and
`C.randomOpen(…)` call sites — no new spawn code.

Bias strength by tier: **0** (tier 1, uniform — the regression anchor), 0.45,
0.7, 0.85. Weight = `(1 - b) + b * depthFrac²`.

The result a player experiences: a late reef has a large, safe, near-worthless
shallow half and a dense, lucrative, lethal deep half. Difficulty is *where the
money is*, not a number rising out of sight.

### Values rebase onto absolute metres

`chestValue` is currently `200 + (y / WH) * 400` (`reef/index.js:374`) — scaled
by *fraction* of world height. In a taller world that still tops out at 600 at
the floor, so 1800 m in tier 4 would pay exactly what 411 m pays in tier 1.

`chestValue` is rekeyed to **absolute metres**, and loose coins/gems gain a
depth multiplier on the same basis. Tier-1 values land unchanged; the multiplier
only opens up in water that tier 1 does not have.

### One invariant that keeps runs winnable

**The reef's objective relic never spawns below the diver's current crush
depth.** The Valve tier is known at world-generation time, so this is a clamp on
the relic's placement. Loot may sit below your crush depth as a temptation; the
thing you *must* have to sail on may not. Without this, a player who skipped the
shop can generate an unwinnable reef.

The points-goal alternative (`RELIC.goalBase` + `goalPerReef`) remains as the
second route out of any reef and is unchanged.

### Knock-on: the sweep bonus gets hard

`COLLECT_BONUS` pays Salvage at 80/90/100% of a reef's loose treasure. With loot
pushed deep, 100% in a tier-4 reef means sweeping the crush band. This is left
as-is deliberately: it stops being routine and becomes a genuine trophy.

### Economy sanity

Gold is **run-scoped** (`this.gold` resets each run, seeded only by skip tokens;
`reef/index.js:285`) — only Salvage persists. Each run must therefore fund its
own descent, and the Valve ladder alone is 2,800 gold on top of tanks and
weapons. Scaling the deep haul by tier is what makes that ladder payable exactly
when the run needs it, and is the reason Locked decision 8 requires both growth
and migration.

## Component: max lives via the Dry Dock

`GAME.maxLives: 5` is replaced by a configurable pair and a permanent purchase:

```js
LIVES = { baseMax: 3, capMax: 6, costBase: 300 }   // capMax is the config knob
```

A `lifeMax` field is added to `deepdescent.salvage.v2` alongside the existing
`slots`, which is the exact pattern to copy: a permanent Salvage purchase with a
doubling cost and a hard ceiling, clamped in `sanitize()`
(`src/meta/salvage.js:13`, `clampSlots`). Old saves backfill to `baseMax`; no key
rename, no migration. Priced in **Salvage**, doubling from 300 — so the three
purchases are 300 / 600 / 1200, dearer than a Log slot (200 base) because a life
is worth more than a relic slot.

Score-earned 1-UPs (`reef/index.js:1634`) are unchanged in mechanism — the
unlock raises the ceiling they bank against.

## Component: warning, gauge and klaxon

### The depth gauge

`floorDepthM()` already reads `WORLD.WH` live, so the scale rebases onto a taller
world for free. Added to the column in `src/render/depthgauge.js`:

- A permanent **amber band** below 250 m and a **red band** below your crush
  depth — the danger is legible from reef 1, and buying a Valve is *visibly*
  felt as the red band retreating down the gauge.
- **Flashing on approach**: within ~40 m above your crush depth, the red band
  and its line pulse.
- While `alarmed`: the gauge goes red and carries the countdown.

The file already separates pure geometry (`gaugeRect`, `metresDown`,
`floorDepthM`) from painting so it can be asserted headless. The new band
arithmetic follows that split.

Note the gauge shows the *whole* water column, so at tier 4 it compresses 1800 m
into the same on-screen height that shows 411 m today. Tick spacing
(`TICK_STEP_M` 50 / `LABEL_STEP_M` 100) must scale with the tier or the column
becomes an unreadable stripe of labels.

### The klaxon

A two-tone submarine emergency horn in `src/audio.js`, looping while `alarmed`,
stopping on ascent or on death. Two engine constraints apply directly:

- **Per-frame setters must return early when the value is unchanged.** Re-issuing
  `setTargetAtTime` every frame restarts the ramp and it never lands — this cost
  a chase layer that reached 0.58 instead of 1.0 (fixed 2026-09-01).
- **The Node stub cannot verify this.** A real `AudioParam.value` does not
  reflect scheduled automation, and total RMS hides everything behind the sub
  drone. Evidence means an `OfflineAudioContext` render measuring peak and
  high-frequency energy.

The klaxon follows the master mute (M), not the music toggle (J): it is a
gameplay signal, not score.

### First-encounter modals

The action pauses with a dismissable modal the first time the diver approaches
each line — one for the oxygen line, one for the crush line. Seen-once flags are
new boolean fields inside **`deepdescent.salvage.v2`**, alongside `lifeMax`.

They may **not** live in `deepdescent.progress.v1`: that key is sanitized to
`{ earned: [...] }` filtered against `ID_SET` on every save
(`src/meta/progressive.js:76,88`), so any extra field is silently discarded.
`salvage.v2` is the general meta bag and already round-trips arbitrary fields
through an explicit sanitizer.

## Telemetry

Three lifetime counters, following the valve-counter recipe exactly — add to
`STAT_KEYS`, emit from the reef's `_runDelta()`, declare in the legacy
manifest's `goals.stats`:

- `legacy:crushAlarmed` — runs where the alarm fired at least once
- `legacy:crushDeaths` — runs ended by the crush timer
- `legacy:crushEscapes` — alarms survived by ascending in time

All three are **additive**, because `addRun()` in `src/meta/stats.js:71` folds a
run's delta by summation only. A "deepest metres, lifetime maximum" counter was
dropped for exactly that reason: it would need max-semantics the store does not
have, and cumulative depth is already covered by `metersDived`.

Namespaced per the P11.1 contract (bare names are rejected by
`tests/core/grandfathered-ids.test.mjs`, which is the contract working). **No
progressive track binds them**, so they mint no Steam achievement ids and draw
nothing on the Trophy Wall — they are diagnostics. The `:` is inert downstream
and old saves backfill to 0, so no migration is needed.

Shipping the counters *with* the change rather than after it is the lesson of the
Depth Valve, whose attach rate was unmeasurable for the entire period it was
mispriced.

## Error handling

- `worldSize(reef)` clamps: reef < 1 returns tier 1, reef > 40 returns tier 4.
  Non-finite or non-integer input falls back to tier 1 rather than throwing —
  world generation must never fail.
- `crushDepth(level)` clamps an out-of-range or corrupt Valve level to Lv0.
- `sanitize()` on `salvage.v2` clamps `lifeMax` to `[baseMax, capMax]`, matching
  `clampSlots`.
- The crush state machine is reset explicitly on run start, on zone entry and
  exit, and on death — a stale `alarmed` leaking into a fresh dive would kill a
  player in silence.

## Testing

Assertion style is copied **per file** from whichever of the three incompatible
styles that file already uses. Mixing the two `check` forms silently
always-passes.

**Value tests, not shape tests.** Every table above is pinned at reference
inputs so that changing a constant *fails a test*. This is the lesson of
`valve-air.test.mjs`, whose 30 checks passed happily at both 240 m and 150 m.

- `worldSize(reef)` — pinned at reefs 1, 3, 4, 10, 11, 20, 21, 40, 41 (the
  boundaries are the whole point) and at the clamp edges.
- `airDepthTerm(depthM, valveLevel)` — pinned above, at, and below the oxygen
  line; with and without each Valve level; the four tier-floor costs in the
  discount table; plus the Lv1 parity assertions at 240 m and 411 m that preserve
  the 2026-09-01 rebalance.
- `crushDepth(level)` — all four levels plus clamps.
- The crush timer step — entry, expiry, the 1-per-1.5 s recovery rate, and that
  recovery cannot exceed the 14 s maximum.
- `treasureDepthWeight` — tier 1 uniform (asserted, as the anchor), and
  monotonic downward bias increasing by tier.
- Metre-based `chestValue` — tier-1 parity with today's values, and a strictly
  higher payout at tier-4 depths.
- `lifeMax` purchase and `sanitize()` clamping, mirroring the `slots` tests.
- **Tier-1 regression anchor**: reefs 1–3 produce identical world extents and
  identical reef-1 spawn counts to `main`.
- **Audio**: an `OfflineAudioContext` render of the klaxon — peak and
  high-frequency energy — plus an assertion that an unchanged per-frame value
  does not re-issue the ramp.
- **Browser pass**: serve locally and drive a real dive into tier 2, confirming
  the gauge bands, the flash, the klaxon, the modal, and a crush death. This
  needs a dev reef-skip hook; the run-state must be read off `this._reef`, and
  touch emulation must be included.
- **Performance**: measure cave generation and first-frame time at all four tier
  sizes, on desktop and on the ROG Ally. Tier 4 is the one that can fail.
- `npm run typecheck` exits 0; the full suite (currently 102 files) is green.
- `BUILD` bumped in `src/version.js` and confirmed live via `curl` after deploy.

## Risks

1. **Tier-4 cave generation cost.** 24,160 cells against today's 3,220 — a 7.5×
   grid for the miner walk, the chamfer distance field and the fog-of-war buffer.
   `caveParams()` already ramps `maxIters` and `concurrentCap` with reef, which
   compounds it. This is the single most likely thing to force a redesign (a
   coarser `CELL` at deep tiers, or generation split across frames), and it
   should be measured **first**, before any of the gameplay work.
2. **The minimap panel's aspect.** It is a fixed ~136 × 185 box; the world goes
   from 46:70 to 80:302. The map must letterbox inside the panel rather than
   stretch.
3. **Depth-gauge legibility at 1800 m** — see the tick-spacing note above.
4. **Swim time.** An 1800 m column is ~4.4× the vertical travel of today's world.
   If ascending from the floor is tedious rather than tense, the answer is
   probably deeper bell placement or a faster ascent, not a shorter world — but
   it needs judging in play.

## Out of scope

- **New enemy types and new treasure kinds** — Spec 2. This spec changes *where*
  and *how much* treasure spawns, never *what kinds* exist.
- **Pause and resume of a run.** Noted as coming and genuinely needed before a
  40-reef session is playable end to end, but it is a persistence feature with
  its own design, and nothing here depends on it.
- **An ending at reef 40.** Locked decision 11 — reef 40 caps world size only.
- **Armour on creatures.** Part of Spec 2's enemy work.
- **Crush mechanics inside special zones.** Reef zone only.
- **Rebalancing weapon or consumable prices** against the new economy. Likely
  needed eventually; deliberately deferred until the telemetry says so.
