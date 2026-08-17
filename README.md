# 🤿 Deep Descent

A modern browser homage to **Durell Software's _Scuba Dive_ (1983)**, rebuilt
from the original ZX Spectrum `.z80` snapshot in this repo.

Dive from your boat, prise pearls from giant clams, scoop up treasure, and
surface to bank your haul — all while your air runs down and the deep's
hunters circle. Faithful 1983 gameplay, re-imagined with modern vector
graphics, particle effects, procedural audio, and responsive touch controls.

## Play

No build step, no dependencies — it's plain ES modules. Serve the folder:

```bash
python3 -m http.server 8777
# then open http://localhost:8777/
```

(Opening `index.html` via `file://` won't work — ES modules need `http://`.)

## Controls

| Action | Keys |
|--------|------|
| Swim   | Arrow keys / **WASD** / touch-drag (virtual joystick) |
| Dive / start / restart | **Space** / click / tap |
| Pause  | **P** / **Esc** |
| Mute   | **M** |

## How to play

- **Air** drains constantly and faster the deeper you go. Return to the **boat**
  at the surface to refill it — and to **bank** the treasure you're carrying
  into your score. Run out of air and you lose a life.
- **Giant clams** hold pearls (400 pts). Grab the pearl while the shell is
  **open**; linger inside when it snaps **shut** and it bites you.
- **Treasure** — coins (60) and chests (250) — is scattered through the depths.
- **Hazards** cost a life on contact: octopus (homes in), shark (fast cruiser),
  jellyfish (bobbing), pufferfish (patrols). Deeper water = more, and richer.
- Collect and bank everything, then surface, to win with an air + lives bonus.

## Why browser / JavaScript (not a Rust binary)?

_Scuba Dive_ is a 2D sprite arcade game. HTML5 Canvas + Web Audio run it at
60fps trivially, and the browser gives zero-install play, URL sharing, desktop
**and** touch support, and instant iteration. A native binary would add build
and distribution friction for no gameplay gain. See `docs/DESIGN.md`.

## Structure

```
index.html            entry page
src/
  main.js             canvas/DPI setup + RAF loop
  config.js           tuning constants + palette
  input.js            keyboard + touch → intent vector
  audio.js            procedural Web Audio SFX + ambient
  game.js             state machine, world gen, collisions, HUD
  entities/           diver, boat, clam, treasure, creatures
  systems/particles.js  bubbles + sparkles
  render/             background (ocean/god-rays/seabed), sprites
docs/DESIGN.md        design + platform decision
Scuba_Dive_1983_Durell_Software.z80   original snapshot (source of truth)
```

## Credits

Homage to the original _Scuba Dive_ by **Durell Software (1983)**. This is a
non-commercial tribute; all new code and artwork.
