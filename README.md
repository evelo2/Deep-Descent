# 🤿 Deep Descent

A modern browser homage to **Durell Software's _Scuba Dive_ (1983)**, rebuilt
from the original ZX Spectrum `.z80` snapshot in this repo.

Dive from your boat into a **2D scrolling cave world** — tunnels, vertical
drop-offs and chambers — prise pearls from giant clams, plunder **sunken
shipwrecks** for gems and treasure, and **harpoon** the deep's hunters (sharks
come in all sizes). Refill at **bubble vents** on the cave walls, surface at the
boat to bank your haul, and watch your air. Faithful 1983 gameplay, re-imagined
with modern vector graphics, kelp/coral/anemone flora, particle effects,
procedural audio, and keyboard + touch controls.

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
| Fire harpoon | **Space** / **F** / click / quick tap |
| Start / restart | **Space** / click / tap (on menus) |
| Pause  | **P** / **Esc** |
| Mute   | **M** |

## How to play

- **Air** drains constantly and faster the deeper you go. Two ways to refill:
  return to the **boat** at the surface (full refill + **banks** your carried
  treasure into score), or swim into the rising stream of a **bubble vent** on a
  cave wall (partial top-up — your lifeline for deep dives). Run out and you lose
  a life.
- **Caves:** below the open surface water lies a **2D cave network** — horizontal
  tunnels, vertical drop-offs and open chambers, scrolling in both axes. A shaft
  drops straight down from under the boat; explore sideways for the rest. Bumping
  a wall is harmless (you slide along it); rock blocks your harpoon.
- **Harpoon:** fire along your swim direction to spear hunters for points.
  **Sharks come in sizes** (small darters → big hunters); bigger sharks are worth
  more. Short cooldown; the HUD shows when it's ready.
- **Clams & chests** sit on ledges and shipwrecks and share one animation:
  **rattle** (a bubble forming) → **slow open** → **hold** → **snap shut**, their
  lids/shells hinged at an edge. Grab the loot (pearl 400, chest 200–600) while
  **open**; each opening **releases a big air bubble** to swim through for air.
  Get caught when it snaps **shut** and it bites you: a life lost.
- **Shipwrecks** rest in the deep chambers, decked with a big chest and gems.
- **Treasure:** floating coins (60) and gems (500) drift through the water.
- **The deep changes:** it gets darker as you descend, the creatures change with
  depth — shallow jellyfish/pufferfish → mid-water octopus & sharks → the deep's
  **eels and glowing anglerfish** — and **whale skeletons** rest on the floor.
- **New reefs:** surface, bank your haul, then **hold ↑ into the boat** to board
  and sail to a fresh reef (a whole new cave; score & lives carry over).
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
  input.js            keyboard + touch → intent vector, tap-to-fire
  audio.js            procedural Web Audio SFX + ambient
  game.js             state machine, world gen, collisions, HUD
  entities/           diver, boat, clam, treasure, creatures,
                      harpoon, airvent, wreck
  systems/
    particles.js      bubbles + sparkles
    cave.js           2D cave gen (miners) + distance-field collision + render
  render/             background (ocean/god-rays), sprites,
                      props (shipwreck + gem), flora (kelp/coral/anemone)
docs/DESIGN.md        design + platform decision
Scuba_Dive_1983_Durell_Software.z80   original snapshot (source of truth)
```

## Credits

Homage to the original _Scuba Dive_ by **Durell Software (1983)**. This is a
non-commercial tribute; all new code and artwork.
