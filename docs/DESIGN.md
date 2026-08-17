# Deep Descent — a modern homage to *Scuba Dive* (Durell Software, 1983)

## Origin
Built from the ZX Spectrum `.z80` snapshot of Durell's *Scuba Dive*. The
snapshot confirms the game (sprite bitmaps + the `"S/D SCORE"` HUD string).
We preserve the original gameplay loop and re-imagine the presentation.

## Platform decision — Browser (JavaScript + HTML5 Canvas)
A 2D sprite arcade game. Canvas + Web Audio run it at 60fps trivially, while
the browser gives zero-install play, URL sharing, desktop + touch, and instant
iteration. A Rust/native binary would add build + distribution friction for no
gameplay gain. Vanilla ES modules — no build step, no dependencies.

## Preserved gameplay (faithful to 1983)
- Dive from a surface **boat** down through the ocean.
- Collect **pearls from giant clams** (open/close cycle — grab when open, get
  caught when it snaps shut) plus scattered **treasure**.
- **Air** drains constantly. Surface at the boat to **refill air** and **bank**
  carried treasure into score. Run out of air (or drown far from air) = lose a life.
- Hazards cost a life on contact: **octopus, shark, jellyfish, pufferfish**.
- **Lives**, escalating danger and value with **depth**, score + high score.

## Modern layer
- Procedural vector graphics (crisp at any DPI): parallax depth layers, caustic
  light rays, god-rays, drifting bubbles, seaweed, bioluminescent glow.
- Game feel / juice: bubble + sparkle particles, damage flash, screen shake.
- Responsive full-viewport canvas; keyboard (arrows/WASD) **and** touch controls.
- Web Audio ambient hum + procedural SFX; mute toggle.
- Clean state machine: menu → playing ⇄ paused → gameover. localStorage high score.
- Accessibility: high-contrast HUD, pause, reduced reliance on colour alone.

## v2 expansion — caves, harpoon, wrecks, air vents

- **Caves** (`systems/terrain.js`): below the open surface zone the world becomes
  a winding vertical corridor defined by control points (centre + half-width),
  smoothly interpolated, with wide chambers and narrow passages plus craggy rock
  pillars. `constrain()` keeps entities inside (soft, damage-free wall bumps);
  `isSolid()` backs harpoon/rock tests. Rock is drawn *after* creatures so a
  hunter wandering into a wall is naturally occluded.
- **Harpoon** (`entities/harpoon.js`): fired along the diver's aim (last swim
  direction). Spears creatures for points, sticks into rock, short cooldown.
  Space/F/click, or a quick screen tap on touch (drag = steer, tap = fire).
- **Air vents** (`entities/airvent.js`): "bubble clams" on cave walls that pulse
  open and emit a rising bubble stream; swimming through it refills air. This is
  how deep cave dives stay survivable without surfacing — the boat still gives a
  full refill and is the only place to *bank* treasure.
- **Shipwrecks** (`entities/wreck.js` + `render/props.js`): evocative galleons
  seated in chambers, ringed with the richest loot (gems + chests).
- **Gems**: a new 500-pt treasure tier, weighted toward deep water and wrecks.

## v8 — occasional specials + power-ups

- **One occasional special per reef** (`game._generateWorld`): ~70% chance of a
  single special (whale / kraken / temple), else a plain reef — so dives vary.
- **Power-ups** (`entities/powerup.js`): floating pickups — `tank` permanently
  raises `this.airMax` for the run (air logic now uses `airMax`, not the constant);
  `multifire` sets a timed `multiFireT` during which `fire()` emits a 3-way spread.
  HUD shows boosted air (`n/max`) and the multifire countdown. Part of the zone
  snapshot.

## v7 expansion — currents, kraken boss, sunken temple (phased)

- **Currents** (`entities/current.js`): rectangular flow zones that add force to
  the diver each frame, drawn with animated streaks + chevrons. ~5 per reef, some
  in the belly/temple; part of the zone snapshot.
- **Kraken boss** (`entities/kraken.js`): per-frame tentacle geometry shared by
  draw + collision; tentacles reach for the diver (contact = a life). Harpoon it
  (8 hits, boss health bar in HUD); on defeat it recoils, sinks and drops a big
  bonus + gems. One per reef in the deepest chamber over a hoard.
- **Sunken temple** (`game._generateTemple`, entered via a stone gate placed in
  the reef): a `'temple'` cave biome (sandstone) with columns, a key, a locked
  door (AABB barrier that lifts once you hold the key) and a vault of key-gated
  loot, plus an exit gate. Uses the generalised zone stack
  (`_snapshotReef`/`_restoreReef`) shared with the whale belly.

## v6 expansion — the whale bonus zone

- **Living whale** (`entities/whale.js`): a big benign whale drifts in one reef
  chamber, its mouth opening and closing. `swallowReady()` fires when the diver
  enters the open mouth.
- **Belly zone** (`game._generateBelly`): reuses the cave with a `'belly'` biome
  (fleshy red palette + membrane rim in `cave.draw`), lined with rib bones
  (`props.drawRib`), packed with a richer trove, a couple of blowhole vents and
  swallowed hazards, plus a glowing throat exit (`props.drawThroat`). A warm
  pulsing "heartbeat" overlay replaces the depth veil while inside.
- **Zone stack** (`game._enterWhale`/`_exitWhale`): entering snapshots the whole
  reef (cave, entity arrays, camera, diver), swaps in the belly, and drops the
  diver deep inside; reaching the throat restores the snapshot and places the
  diver by the whale's mouth. Carried loot, air, score and lives persist.
  Docking, banking and the win check are gated to the reef zone.

## v5 expansion — unified shell animation, deep zones, whale bones, new reefs

- **Shared shell envelope** (`config.shellShape`): all shells (pearl clams, vent
  clams, chests) now rattle → slow-open → hold → snap-shut, hinged at an edge.
  `drawClam` and the vent draw two scallop halves hinged at the back; `drawChest`
  hinges the lid at its left corner. Each rattles with a forming bubble.
- **Depth zones** (`game._generateWorld`): creatures spawn by depth band —
  shallow (jelly/puffer/small shark), mid (octopus/shark), deep (big shark + new
  `Eel` and `Angler` with a bioluminescent lure). The scene darkens with a depth
  veil + vignette in `game.draw`.
- **Whale skeletons** (`props.drawWhaleSkeleton`): seated on the deepest floors.
- **New reefs** (`game._setSail`/`_newReef`): dock, bank, hold ↑ to board the
  boat → a brief sailing transition → a freshly generated cave; score/lives carry
  over, air refills. Tracked as REEF n in the HUD.

## v4 expansion — animated shells (clams & chests) + collectible air bubbles

- **Shell base** (`entities/shell.js`): ledge-mounted open/close containers.
  `open` is a saturating sine (clear shut + open dwells). On each opening it
  emits a **big air bubble**; loot is grabbable while open; it **bites** (life
  lost) when it shuts on the diver — even after being emptied. `Clam` (pearl,
  larger) and `Chest` (depth-scaled treasure, larger) extend it, seated on cave
  floors and wreck decks via the surface-finding helpers.
- **BigBubble** (`entities/bigbubble.js`): rises, wobbles, pops on ceiling/timeout;
  collecting one refills a chunk of air — a second air source alongside vents.
- Chests replaced the old floating "chest" treasure; floating loot is now just
  coins and gems.

## v3 expansion — 2D scrolling caves, flora, sized sharks

The original *Scuba Dive* scrolled in 2D through a cave system, so the world grew
from a vertical column into a full 2D scrolling world (`WORLD.WW`×`WORLD.WH`) with
a 2D camera. Every `draw()` now takes `camX, camY`.

- **2D cave** (`systems/cave.js`) replaces the old single-axis corridor: a boolean
  grid is carved by "miner" agents that make **tunnels, vertical drop-offs and
  chambers** (miner 0 drops a guaranteed shaft under the boat so there's always an
  entrance and a route down). A chamfer **distance field** over the grid gives
  organic rock: `collide()` slides entities along curved walls via the field
  gradient; rendering **soft-carves** the caves out of an offscreen rock layer for
  smooth, non-blocky edges. Spawn helpers expose open cells, chambers (wrecks),
  floors (plants) and walls (vents).
- **Flora** (`render/flora.js`): swaying kelp, branching coral fans, waving
  anemones, glowing polyps and bushes rooted on cave floors — the "underwatery"
  layer.
- **Sized sharks**: `Shark` takes a `scale` (0.7–1.7×); radius, speed and kill
  points scale with it.

## v2 expansion — caves, harpoon, wrecks, air vents
- `config.js` — tuning constants + palette.
- `main.js` — canvas/DPI setup, RAF loop, wiring.
- `input.js` — keyboard + touch → intent vector.
- `audio.js` — Web Audio SFX/ambient.
- `game.js` — Game class: state machine, spawning, HUD, collisions.
- `entities/` — diver, clam, creatures, treasure, boat.
- `systems/particles.js` — bubbles + sparkles.
- `render/background.js` — ocean, caustics, god-rays, seabed, seaweed.
- `render/sprites.js` — procedural vector sprite drawing.
