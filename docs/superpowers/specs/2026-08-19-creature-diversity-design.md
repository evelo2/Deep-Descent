# Creature Diversity — Design / Spec

**Status:** proposed (2026-08-19). Awaiting review before a plan is written.

**Goal:** Expand the hazard roster from 6 near-identical patrollers into a
diverse ecosystem where **different creatures inhabit different locations and
zones**, each with a mechanically distinct behavior, introduced gradually as the
player descends deeper and sails to later reefs.

**Architecture:** Keep the existing `Creature` base-class model (each creature
owns its `update(dt, t, diver)` + a `drawX` in `render/sprites.js`; contact costs
a life; net/shock/harpoon/charge/snare already interoperate). Add ~8 new creature
classes across new behavior archetypes, a small `CREATURES` config block for
tuning, and a **data-driven, zone-aware, reef-gated spawn table** that replaces
the current depth-band `if/else` cascade in `game.js`.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D. No build step, no deps.
Creatures are pure logic + procedural vector art, unit-testable in Node like the
Stage engine.

**Spec:** this document.

## Global Constraints

- No new dependencies; no build step. New creatures are `class X extends Creature`
  in `src/entities/creatures.js` with a `drawX` in `src/render/sprites.js`.
- Every creature keeps the base contract: `x, y, radius, snareT, facing`,
  `get points`, `hits(diver)`, `update(dt, t, diver)`, `draw(ctx, camX, camY, t)`.
  Snare/stun (`snareT > 0` → frozen + harmless) must keep working for all.
- Contact damage stays the model (`Game._hit`). New *ranged* attacks damage via
  their own overlap check the Game already runs per-creature; no new damage plumbing
  beyond a creature exposing an extra hazard region.
- Tuning values live in a `CREATURES` config block (per-type speeds/ranges/points),
  not as magic numbers in the classes. `KILL_POINTS` gains an entry per new type.
- New behaviors must be **readable and telegraphed** — chargers wind up before
  dashing, ambushers show a tell, camouflaged types are revealable. No unfair hits.
- Creatures are confined by the existing Cave collider (the Game clamps them); new
  classes must not assume they can leave the cave.

## Current state (what exists)

`src/entities/creatures.js` — base `Creature` + 6 types, 3 behaviors:
- **Horizontal patrol:** Shark (sized, `points ~220·scale`), Puffer (slow), Eel (fast).
- **Vertical bob:** Jelly.
- **Slow homing (<range):** Octopus (230), Angler (260).

`KILL_POINTS = { Shark:300, Octopus:200, Puffer:150, Jelly:100, Eel:250, Angler:400 }`
(Shark overrides with a scaled value). Placement (`game._generateWorld`) is a
depth-band cascade: shallow `<0.30`, mid `<0.62`, deep. Specials (whale/kraken/
temple/stage) are one-per-reef, sometimes. Belly spawns Eel/Jelly; Temple spawns
Eel/Puffer — i.e. the special zones reuse the generic roster.

## New behavior archetypes

Each is a small `update()` variant. Params below live in `CREATURES.<type>`.

1. **Charger** — patrols horizontally; when the diver is within `sightRange`
   and vertically aligned (`|dy| < alignBand`), enters `windup` (rears back,
   near-stop, visible tell) for `windupTime`, then **dashes** at `dashSpeed`
   toward the diver's x for `dashTime`, then `recover`. Dodgeable by breaking
   vertical alignment. States: `patrol | windup | dash | recover`.

2. **Ambusher** — anchored to a spawn cell (a wall/wreck crevice). Hidden
   (drawn as eyes/shadow in a hole) until the diver enters `strikeRange`; then
   **lunges** out up to `reach` toward the diver over `strikeTime`, then retracts
   to the anchor and cools down `cooldown`. Only its extended head is a hazard.

3. **Swarm** — spawned as a group of `count` small **Piranha** units sharing a
   loose flock center. Each drifts toward the diver at `swarmSpeed` with jitter,
   loosely separated from siblings. Individually small radius / low points;
   dangerous as a mass. AoE (charge/shock/net) clears several at once.

4. **Camouflaged** — sits on a floor cell, drawn `hiddenAlpha` (near-invisible)
   until either the diver is within `revealRange` **or** the cell is lit by a
   flare/torch (`game.flareT>0 || (game.torchOn && battery>0)` — passed in via a
   `lit` flag). Contact damage always applies; the point is it's unfair *only if
   you dive dark*. Ties the torch/flare systems to safety, not just sight.

5. **Ranged (pulse)** — drifts slowly; every `pulseCycle` emits an expanding
   **pulse ring** from `0→pulseR` over `pulseTime`; the ring's leading edge is a
   hazard band. Body is also a contact hazard. Forces timed passage. Exposes a
   `pulse` region the Game's per-creature hit check reads.

6. **Guardian (territorial)** — anchored near a loot node (wreck chest / vault /
   cache). Patrols within `territory` radius; while the diver is *inside* the
   territory it homes at `guardSpeed`; when the diver leaves, it disengages and
   drifts back to its anchor. Makes rich loot contested. States: `guard | return`.

7. **Pursuer** — a relentless deep hunter (**Giant Squid**): homes persistently
   at `cruise`, and when within `lungeRange` does a short speed burst (`lunge`)
   with a brief `rest`. Distinct from the Kraken boss: smaller, killable by normal
   weapons, no arms/HP bar — just a fast, committed chaser you must lose or kill.

8. **Static/drift hazard** — a **Sea Urchin / Drift Mine**: spiky contact ball,
   either fixed on a floor or slowly current-borne. `snareT` is irrelevant (net
   does nothing); harpoon/charge destroy it. Pure obstacle. Threads the currents
   and dark rooms into obstacle courses.

## The roster (8 new creatures)

| Creature | Archetype | radius | key params | points | Zones |
|---|---|---|---|---|---|
| **Barracuda** | Charger | 20 | sight 320, align 46, windup 0.5s, dash 420, dashTime 0.5s | 260 | mid, deep |
| **Moray** (free) | Ambusher | 16 | strike 120, reach 90, strike 0.35s, cooldown 2.5s | 240 | wrecks, deep, dark |
| **Piranha** | Swarm | 9 | count 6–9, swarmSpeed 70, jitter | 40 | shallow, mid |
| **Stonefish** | Camouflaged | 18 | revealRange 70, hiddenAlpha 0.12 | 180 | dark caves, floors |
| **Electric Ray** | Ranged pulse | 20 | pulseR 130, pulseCycle 2.4s, pulseTime 0.6s | 320 | deep, dark |
| **Grouper** | Guardian | 22 | territory 260, guardSpeed 70 | 300 | wrecks |
| **Giant Squid** | Pursuer | 26 | cruise 60, lungeRange 220, lunge 240, rest 0.8s | 500 | the deep |
| **Sea Urchin** | Static/drift | 15 | drift 0/slow; net-immune | 120 | currents, dark, floors |

Two zone-themed **reskins** (same archetypes, themed art + placement), so the
special zones stop reusing the reef roster:
- **Gut Parasite** (belly) — Swarm/drift reskin: drifting acid blobs inside the whale.
- **Stone Sentinel** (temple) — Guardian reskin: anchored by the key/vault, wakes
  when the diver holds the key or nears the vault.

## Zone → fauna map

| Zone / location | Signature fauna (new in **bold**) |
|---|---|
| Shallow reef (`deep<0.30`) | Jelly, Puffer, small Shark, **Piranha swarm** |
| Mid water (`0.30–0.62`) | Octopus, Shark, Puffer, Jelly, **Barracuda** |
| The deep (`>0.62`) | big Shark, Eel, Angler, **Electric Ray**, **Giant Squid** |
| Dark caves | **Stonefish**, **Moray**, **Sea Urchin** (revealed/threaded by light) |
| Wrecks | **Moray** (from portholes), **Grouper** (guards the deck chest) |
| Currents | **Sea Urchin / drift mines** carried by the flow |
| Whale belly | **Gut Parasites** (themed swarm/drift) |
| Sunken temple | **Stone Sentinels** (guard the key/vault) |
| Reef floors | **Stonefish**, **Sea Urchin** occasional |

## Reef-gated introduction

Each new type has a `minReef`; the spawn table filters by it so early reefs stay
legible and variety unfolds (mirrors weapon gating):
- **Reef 1:** existing roster + **Piranha** (shallow) + **Stonefish** (dark).
- **Reef 2:** + **Barracuda** (mid), **Moray** (wrecks/dark).
- **Reef 3:** + **Electric Ray**, **Grouper** (wrecks).
- **Reef 4+:** + **Giant Squid** (deep), **Sea Urchin** fields.
Zone reskins (parasite/sentinel) appear whenever their zone appears.

## Spawn system refactor

Replace the depth-band `if/else` in `game._generateWorld` with a data-driven
selection:
- A `ZONE_FAUNA` table maps a *context* (depth band + local feature: near-wreck,
  in-dark-zone, in-current, on-floor) to a weighted list of eligible creature
  keys, each with `minReef`.
- A `spawnCreature(key, x, y, reef)` factory builds the class with `CREATURES`
  params (and `sizeUp` for sharks). Swarms expand to N units; guardians/ambushers
  bind an anchor; urchins may bind to a floor/current.
- Wreck/dark/current/temple/belly generators call the table with their context so
  each location pulls its own roster instead of the generic one.
- The refactor keeps the reef-scaled **count** and shark **sizeUp** logic.

## Interactions (must all keep working)

- **Net:** snares (`snareT`) any creature; **Sea Urchin is net-immune** (spiky,
  nothing to snare) — net passes/ends without snaring.
- **Shock rod:** 2nd cumulative hit kills; chains across swarms nicely.
- **Harpoon/Speargun/Charge:** kill on hit; charge AoE clears swarms/urchins.
- **Snare/stun:** `snareT>0` freezes behavior (chargers cancel a dash, pulses
  pause, guardians hold) and disables contact — already handled by the base check.
- **Dark/torch/flare:** camouflaged types read a `lit` flag; a lit flare/torch
  reveals them (and thus makes them avoidable) — safety, not just sight.

## Testing strategy

Creatures are pure `update()` logic → Node-unit-testable like the Stage engine
(`tests/creatures/*.test.mjs`), with a stub diver:
- **Charger:** aligned+in-range → enters windup → dashes toward diver; misaligned
  → stays patrolling; snared mid-windup → dash cancels.
- **Ambusher:** strikes only within range; head is the hazard; retracts + cools.
- **Swarm:** units converge on the diver; net/charge removes several.
- **Camouflaged:** `hits()` unchanged, but draw/`revealed` flips under `lit` or
  proximity.
- **Guardian:** homes inside territory, disengages + returns outside it.
- **Pursuer:** persistent homing + lunge within range.
- **Urchin:** net-immune (snare no-op), harpoon/charge destroys.
- **Spawn table:** reef gating (no `minReef>reef` type spawns), zone context picks
  the right roster, swarm expands to N.

## Scope / phasing

The build is naturally phased (mirrors the roster), each creature independently
testable and reviewable — a good fit for subagent-driven execution:
1. **Config + spawn-table scaffold** (`CREATURES`, `KILL_POINTS`, `ZONE_FAUNA`,
   `spawnCreature`) — refactor placement with the *existing* roster first (no
   behavior change), so the new framework is proven before new creatures land.
2. **Archetype creatures** — Barracuda, Moray, Piranha, Stonefish, Electric Ray,
   Grouper, Giant Squid, Sea Urchin (one task each: class + sprite + config + test).
3. **Zone reskins + wiring** — parasite (belly), sentinel (temple), wreck/dark/
   current context hookups, reef gating.
4. **Balance/tuning pass** — reef-gating schedule, density, and points, verified
   in-browser.

## Open questions for review

1. **Ranged damage:** OK to let the Electric Ray's pulse ring and the Moray's
   extended head damage via the Game's existing per-creature overlap check (each
   creature exposes an extra hazard region), rather than adding projectiles?
2. **Art budget:** new `drawX` procedural sprites for all 8 (preferred), or reskin/
   tint a few (e.g. Piranha = small tinted Shark) to move faster?
3. **Giant Squid vs Kraken:** keep the squid a normal-weapon-killable pursuer
   (no HP bar), distinct from the boss — confirm that's the intent.
