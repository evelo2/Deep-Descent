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

## Architecture (src/)
- `config.js` — tuning constants + palette.
- `main.js` — canvas/DPI setup, RAF loop, wiring.
- `input.js` — keyboard + touch → intent vector.
- `audio.js` — Web Audio SFX/ambient.
- `game.js` — Game class: state machine, spawning, HUD, collisions.
- `entities/` — diver, clam, creatures, treasure, boat.
- `systems/particles.js` — bubbles + sparkles.
- `render/background.js` — ocean, caustics, god-rays, seabed, seaweed.
- `render/sprites.js` — procedural vector sprite drawing.
