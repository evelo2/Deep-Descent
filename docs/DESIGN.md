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
