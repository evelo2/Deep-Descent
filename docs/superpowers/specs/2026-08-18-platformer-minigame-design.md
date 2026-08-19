# Design: Cave-entrance platformer minigame (themed stages)

**Date:** 2026-08-18
**Status:** Approved design — ready for implementation plan
**Roadmap item:** "Cave-entrance minigames" (first target: a classic 1980s
platformer), now #1 in `docs/ROADMAP.md`.

## Summary

Some reef entrances open into a **platformer minigame** instead of more reef.
The diver leaves the water into an air pocket and traverses a short, few-room
platform stage — walking, jumping, and climbing ladders past avoid-only hazards
to a big loot cache — then returns to the reef. The entrance's look advertises
the theme behind it: a **large shipwreck** leads to a **ship** stage (climb the
decks); a **cave mouth** leads to a **secret-lair** stage (descend into the
lair). Both themes run on one shared engine; a theme is data (tileset + hazards
+ entrance sprite + room maps).

The subsystem plugs into the existing zone-stack (Approach A) and drives its
content from compact ASCII tile-maps (Approach C), so `game.js` stays thin and
new themes are authoring, not engineering.

## Player experience (the core loop)

1. Swim into a themed entrance on the reef floor.
2. The screen hands off to a **platformer stage**. The diver now stands under
   gravity in a sealed air pocket.
3. Move through **3 connected single-screen rooms**: walk (←/→), jump
   (up/thrust/A), climb ladders (up/down while overlapping a ladder). Dodge
   hazards and patrollers; grab loot en route.
4. The final room holds a **big loot cache** (gold + treasure, richer than a
   normal reef find).
5. **Air is sealed (paused)** in-stage — the only threat is platforming.
6. A mis-jump, a fall into a pit, or a touch on a hazard/enemy costs **one life**
   and respawns the diver at the current room's start. Out of lives → normal
   game-over.
7. **Retreat** to the entrance door anytime, keeping whatever was grabbed.
8. The entrance is **one-shot**: spent once the diver leaves (matches the
   whale/temple rule), so a stage can't be re-entered or farmed.

## Design decisions (settled during brainstorming)

| Question | Decision |
|----------|----------|
| Stage shape/scale | Few-room mini-level: 3 connected single-screen rooms |
| Avatar & physics | The diver, on foot, under gravity (walk/jump/climb) |
| Stakes | Air paused (sealed); a hit/fall costs one life, respawn at room start; out of lives ends the run |
| Reward & exit | Big loot cache in the final room; can retreat anytime keeping grabbed loot; entrance one-shot |
| Movement verbs | Walk, jump, **climb ladders** |
| Enemies | Avoid-only in v1 (no on-foot combat) |
| Jump mapping | up/thrust/A; on-screen JUMP button for touch |
| Themes at launch | Two — ship (shipwreck entrance) and secret lair (cave-mouth entrance); ship built first as the reference |
| Entrance frequency | Occupies the same rare "one special per reef" slot as whale/temple (mutually exclusive, only sometimes) |
| Integration | Approach A (zone-stack) + Approach C (data-driven tile rooms) |

## Architecture

### Zone-stack integration (Approach A)

- Add a new **`zone === 'stage'`** alongside `reef` / `belly` / `temple`,
  running inside the existing `state === 'playing'`.
- **Entry:** `_enterStage(entrance)` snapshots the reef via the existing
  `_snapshotReef(returnX, returnY)`, builds the stage from theme data, drops the
  diver at room 1's `S` start, and sets an **air-paused flag**.
- **Delegation:** while `zone === 'stage'`, `Game.update` and `Game.draw`
  delegate to the stage module. Pause, help, HUD, lives, and gold are reused
  unchanged.
- **Exit / retreat:** `_exitStage()` calls the existing `_restoreReef()` and
  removes the entrance entity (one-shot, same pattern as `_exitWhale` filtering
  the entered whale out of `whales`).
- **Fire is inert in-stage**, guarded so it cannot consume a harpoon (reuse the
  spirit of the existing `_fireGrace` guard).

### Content model (Approach C — data-driven tile rooms)

- Rooms are authored as **ASCII tile-maps**, parsed into a grid.
- **Tile size 30px → a 30×20 grid** filling the 900×600 logical playfield. Each
  room is **one fixed screen** — no in-room scrolling, fixed camera
  (`camX = camY = 0` in-stage).
- **Tile glyphs:**
  | Glyph | Meaning |
  |-------|---------|
  | `.` | empty |
  | `#` | solid platform / ground |
  | `H` | ladder |
  | `^` | static spike/hazard |
  | `x` | moving hazard (barrel / arc) |
  | `o` | loot pickup (coin/gem) |
  | `E` | enemy (patroller) spawn |
  | `<` | entry/back door (to previous room, or reef in room 1) |
  | `>` | exit door (to next room) |
  | `S` | player start / respawn point |
  | `$` | final loot cache (final room only) |
- A **theme** is `{ key, name, palette, tileStyle, hazardSet, entranceSprite,
  rooms: [asciiRoom, ...] }`. Adding a third theme later is authoring a new
  theme object, not touching the engine.

### Physics & controls

- **Gravity** with a terminal fall speed; **jump impulse** applied on press when
  grounded; **axis-separated AABB-vs-tile collision** (resolve X then Y against
  solid `#` tiles).
- **Ladders:** while the diver's box overlaps an `H` tile and up/down is held,
  enter climb mode (gravity off, vertical move along the ladder); leave at the
  top/bottom or by jumping off.
- **Room transitions:** stepping into a `>` door advances to the next room,
  placing the diver at that room's `S`. A `<` door in room 1 **retreats to the
  reef**. Reaching the final room's cache (`$`) grabs the loot; its exit door
  then completes the stage and returns to the reef.
- **Respawn:** touching `^`/`x`/`E` or falling into a pit (below the room floor)
  costs a life via the existing `_loseLife` and respawns at the current room's
  `S`. Out of lives → existing game-over flow.
- **Input mapping in-stage:**
  | Verb | Keyboard / gamepad | Touch |
  |------|--------------------|-------|
  | Walk | ←/→ (existing left/right) | existing left/right |
  | Jump | up / thrust / gamepad A | on-screen **JUMP** button (reuses hold-button infra) |
  | Climb | up/down while on a ladder | up/down buttons |
  | Fire | — (inert) | — (inert) |

### Rendering

- `src/render/stage.js` draws the tile grid, ladders, hazards, doors, loot, and
  the cache in the current theme's palette and tile style.
- The diver gains **walk / jump / climb** poses in `src/render/sprites.js`.
- HUD is reused, plus a stage banner (theme name + room progress, e.g.
  "Deck 2/3") and the air bar shown greyed as **"SEALED."**

## Module structure

**New files**
- `src/stage/stage.js` — `Stage` class: theme, parsed rooms, current-room index,
  platform physics, hazards/enemies/loot state, `update(dt, input, diver)`,
  and a draw-data accessor / `draw(...)` hook.
- `src/stage/themes.js` — theme definitions + room maps (ship, lair).
- `src/render/stage.js` — tile/prop/hazard/door/loot rendering per theme.
- `src/entities/stageentrance.js` — themed entrance entities (large shipwreck,
  cave mouth) with a `contains()` proximity test and their reef-side sprites.

**Edited files**
- `src/game.js` — `zone === 'stage'` branches in `update`/`draw`;
  `_enterStage`/`_exitStage`; spawn a stage entrance in `_generate` (same slot as
  whale/temple); air-pause flag; one-shot entrance removal; inert-fire guard.
- `src/render/sprites.js` — diver walk/jump/climb poses.
- `src/config.js` — `STAGE` tuning (gravity, jump impulse, walk/climb speed, tile
  size, terminal velocity), entrance spawn chance, loot-cache values, theme list.
- `src/input.js` — on-screen JUMP touch button; ensure up/down are readable in
  stage mode.

## Testing plan

**Logic checks** (scriptable in-page via the debug handle):
- ASCII map parses to the expected grid dimensions and tile positions.
- Collision resolves the diver onto a platform (no tunnelling at speed).
- Ladder overlap + up/down enters climb; leaving at top/bottom works.
- `>` door advances to the next room at its `S`; `<` in room 1 retreats to reef.
- Fall below floor / touch hazard → `_loseLife` fires and respawns at `S`.
- Grabbing `$` adds the expected gold/loot; retreat returns to reef with the
  entrance removed (one-shot verified: entrance gone from the reef).

**In-browser (Chrome MCP)** with the temporary `window.game` debug handle and the
freeze-RAF workflow (`g.update = () => {}` before screenshots): force-spawn a
stage entrance, enter, drive movement/jumps/ladders, confirm room transitions,
the cache reward, retreat, and one-shot removal — with **zero console errors**.
Remove the debug handle before every commit (grep guard).

## v1 scope boundaries

**In:** 2 themes (ship, lair), ~3 rooms each; walk / jump / ladder; static +
moving hazards; pits; simple patrollers (avoid-only); loot en route; final loot
cache; retreat; one-shot entrances; sealed air; touch JUMP button.

**Out (future):** on-foot combat; more than two themes; in-room scrolling / wider
rooms; mini-bosses; theme-specific prizes beyond the loot cache.

## Open follow-ups (not blockers)

- When authoring the actual room layouts, optionally mock them up visually in a
  browser tab first so the platforming can be eyeballed before building. Default
  otherwise: author sensible rooms directly.
