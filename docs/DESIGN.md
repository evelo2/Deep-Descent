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

## v19 — creature diversity (zone-aware, reef-gated ecosystem)

The hazard roster grew from 6 near-identical patrollers to a diverse ecosystem
where different creatures inhabit different locations, introduced gradually with
depth and reef. Built via a data-driven spawn system (`src/entities/spawn.js`:
`ZONE_FAUNA` table + `pickFauna`/`spawnCreature`), each creature Node-unit-tested
(`tests/creatures/*.test.mjs`), all with new procedural sprites.

- **8 new creatures across new behavior archetypes** (`entities/creatures.js`):
  **Barracuda** (charger — patrol → windup tell → dash), **Moray** (ambusher —
  strikes from a wall crevice), **Piranha** (swarm), **Stonefish** (camouflaged —
  near-invisible until a flare/torch or proximity reveals it, tying the light
  systems to safety), **Electric Ray** (ranged — an expanding pulse-ring hazard
  via an overridden `hits()`, no projectile system), **Grouper** (territorial
  guardian on wreck loot), **Sea Urchin** (net-immune drift/obstacle hazard), and
  the **Giant Squid** (a mini-boss: HP pool chipped by weapons via a shared
  `_damageCreature` helper across harpoon/charge/shock, distinct from the Kraken).
  Plus two zone reskins: **Gut Parasite** (belly) and **Stone Sentinel** (temple —
  wakes when the key is taken).
- **Zone → fauna map + reef gating:** shallow/mid/deep bands plus dark caves,
  wrecks, currents, belly and temple each pull their own signature roster, with
  per-type `minReef` so variety unfolds (wrecks from reef 2, currents/squid from
  reef 4). The belly/temple/wreck/dark/current generators feed the table with a
  zone context instead of the old generic roster.
- **Portals stay clear:** `_clearCreaturesNearPortals()` runs at the end of each
  generator so no creature spawns on a zone entrance/exit or a dive station —
  you never portal in (or get dropped back) straight into an enemy.
- **Interactions preserved:** net snare (urchin excepted — net-immune), shock
  2nd-hit kill (mini-boss chips HP instead), harpoon/spear/charge kills, snare
  freeze, and the dark/torch reveal all keep working. Spec + plan under
  `docs/superpowers/{specs,plans}/2026-08-19-creature-diversity*`.

## v18 — cavern-entry fix + selectable control legend

- **Cavern spawn-exit fix** (`stage/stage.js`, `stage/themes.js`,
  `config.js`): entering a platformer stage could instantly retreat you — the
  lair rooms spawned the diver one tile from the `<` retreat door, so a held
  leftward input at the transition bounced you straight back to the reef
  (~0.07s). Fix: a `STAGE.doorGrace` window (0.6s) after every spawn during
  which door tiles are ignored, plus wall-anchoring the lair retreat doors with
  a spawn buffer so the wall pins the diver on the door (no overshoot) and a
  casual nudge isn't a deliberate retreat. Regression-tested in
  `tests/stage/entrygrace.test.mjs`.
- **Selectable control legend** (`controls.js`, wired through `game.js`): the
  player picks how on-screen prompts read — **Keyboard**, **Steam Deck**, or
  **ROG Ally**. Steam Deck and ROG share the Xbox ABXY prompt vocabulary
  (device name aside); Keyboard has its own. `controls.js` holds the two
  vocabularies and builds the Help CONTROLS page, the always-visible HTML hint
  strip, and the in-stage strip. Selector lives on the menu and Help page
  (cycle with C, the menu's ← / →, or a tap), persists to localStorage, and
  auto-switches to pad prompts when a gamepad is detected until the player picks
  manually. Covered by `tests/game/controls.test.mjs`.

## v17 — weapon/vision balance pass

A playtest-driven balance + bugfix batch (`config.js`, `game.js`, `input.js`):

- **Depth charge — 2nd-click detonation fixed.** Throwing set the ~1.15s
  throw cooldown and `fire()` bailed on any cooldown, silently eating the
  detonation click (the charge only ever blew on its safety fuse). Detonation
  now runs ahead of the cooldown guard, gated by a `_chargeLock` that needs a
  *fresh* trigger (set on throw, cleared on release) so a continuous hold can't
  throw-then-instantly-detonate at the diver.
- **Shock rod now kills.** It only ever stunned; now it tracks cumulative hits
  per creature — first zap stuns/knocks, the second (`SHOCK.hitsToKill`) kills
  and awards points like a harpoon.
- **Speargun is limited, shop-only ammo.** Its own pool (`SPEARGUN` ammo:
  start 20 on acquisition, cap 100, pricey packs of 20 at the shop); `fire()`
  gates on it and caps the burst by what's left, one spear per shot. HUD shows
  the count.
- **Darker caves, longer flares.** Unlit dark-zone view shrinks (74→52px), the
  black goes near-opaque and closes in faster (`DARKZONE` alpha/falloff), and
  flares burn ~16s (was 9) to compensate.
- **Torch** (`TORCH`): a standalone shop item (350g, reef 2+) that shares the
  shock-rod battery. Toggle with **T** (touch button / gamepad R3) for a
  sustained ~250px cool light in dark caves, draining the battery ~8/s;
  off, it recharges. Auto-cuts out when flat; flares stay independent. Trades
  zaps for light. The shared battery gauge is shown for the torch too, and the
  dark-cave hint is torch-aware.
- **Shop fit.** Row spacing now adapts to the item count so a long list — and
  its Close row — stays inside the 600px playfield.
- **Tests:** `tests/game/*.test.mjs` drive the real `fire()`/`_fireShock` and
  the battery model headlessly (charge detonation, shock kill, speargun ammo,
  torch economics).

## v16 — platformer stages (cave-entrance minigames)

- **Stage subsystem** (`stage/stage.js`, `stage/themes.js`, `render/stage.js`,
  `entities/stageentrance.js`): some reef entrances open into a **themed 1980s
  platformer** stage instead of more reef — reached via the zone-stack exactly
  like the whale belly or the temple (`zone === 'stage'`, snapshot/restore the
  reef, one-shot entrance).
- **Data-driven themes** (`stage/themes.js`, `THEMES`/`getTheme`): a theme is
  pure data — palette, hazards, entrance sprite kind, and a sequence of
  ASCII tile-map rooms (30×20 @ 30px, glyphs `. # H ^ x o E < > S $`). Two
  themes ship: **ship** (shipwreck decks, wood/brass, entered via a reef-side
  wreck sprite) and **lair** (a dark cave interior, entered via a cave-mouth
  sprite).
- **Canvas-free `Stage` engine** (`stage/stage.js`): gravity + terminal
  velocity, axis-separated AABB collision against the parsed tile grid,
  ladders (climb/rest/jump-off), room transitions (`>`/`<`), a one-time gold
  cache (`$`), and avoid-only patrol/hazard movers. `Stage.update(dt, cmd)`
  returns `{ loot, died, exited }`; fully unit-tested without a canvas
  (`tests/stage/*.test.mjs`).
- **Game wiring** (`game.js` `_enterStage`/`_updateStage`/`_exitStage`): the
  fire/harpoon path is inert in-stage (movement/jump/climb only); loot adds to
  `carried` with the usual sparkle + pearl SFX, death routes through the
  existing `_loseLife` (respawn at the room start if lives remain, game-over at
  zero), and exiting restores the reef and removes the entered entrance
  (one-shot, like `_exitWhale`/`_exitTemple`). Each room is a single fixed
  screen — no in-room scrolling. HUD is reused with a room banner and a greyed
  "AIR — SEALED" indicator; a touch **JUMP** button appears while in-stage.

## v15 — dark caves & flares

- **Dark caves** (`config.DARKZONE`, `game.darkZones`): 1–2 pitch-black chambers
  per reef (deep chambers). While the diver is inside one, the scene is blacked
  out except a small pool of light around the diver (radial-gradient overlay,
  drawn before the vignette). They hide richer loot — extra gems, a flare and a
  supply crate.
- **Flares** (`config.FLARE`): a consumable light source. Press **G** / gamepad
  LT / the 🔥 touch button to light one — it widens the visible radius to
  `litRadius` and warms it for `duration` seconds. Start with a couple, buy packs
  at the shop, or pick up flares found in the world (a `flare` power-up type,
  often stashed in the dark rooms). HUD shows the flare count and a "light a
  flare" prompt in the dark; part of the zone snapshot.

## v14 — help screen + quality-of-life

- **Help screen** (`state 'help'`, `game.HELP_PAGES`/`_helpScreen`): a paged
  HOW TO PLAY overlay (Controls, Weapons, Stay Alive, Gold & Gear) reachable
  with **H** or the ❔ button from the menu, pause and game-over. Page with
  ←/→ (or Q/E, gamepad, on-screen ‹ ›); close with H/Esc/Close.
- **Fire grace** (`game._fireGrace`): entering play from the menu, a shop or
  pause sets a 0.3 s grace so the fire button press that started the game /
  closed the menu no longer wastes a shot (covers held keys, gamepad, mouse and
  touch taps).
- **Translucent minimap** (`game._minimap` `_mapAlpha`): the map is drawn
  semi-transparent and eases to a much lower opacity when the diver's on-screen
  position overlaps it, so it never hides the action.
- **Diver aim pose** (`sprites.drawDiver` `aimA`): while aiming, the diver braces
  and levels the harpoon along the aim direction. Weapon-swap keys shown as
  `[Q][E]` keycaps. Game-over distinguishes **YOU DIED** (a creature/hazard,
  `deathCause`) from **OUT OF AIR**; the best score also records the reef reached.

## v13 — combat & economy overhaul

Rebalances and reworks the v11/v12 weapon set (superseding some numbers there).

- **Limited-ammo harpoon, unlimited net** (`config.HARPOON` ammo, `game.harpoonAmmo`):
  both are owned from the start. The **net gun is the free, unlimited fallback**
  (snare/utility); the **harpoon is a scarce kill-shot** — start with 10, carry
  up to 20. Buy packs, find floor pickups (an `ammo` power-up, 1–5), or upgrade
  capacity. The harpoon is now deliberately slow (cooldown 2.6 s, floored at 2.0 s
  even fully upgraded); the aim swing ramps gently with the Targeting upgrade.
- **Shock rod → chain lightning** (`config.SHOCK`): fires a lightning bolt at the
  nearest creature that arcs to nearby ones — **+1 target per upgrade level**.
  Runs on a **battery** that drains per zap and recharges slowly (can't be
  spammed). Jagged-bolt render + HUD battery gauge.
- **Depth charge → hand-detonated mine** (`config.CHARGE`, `entities/weapons.js`):
  a **scarce, expensive** consumable (start 3, capacity upgrades add 1 slot up to
  10). **Click to throw** (it sinks and settles), **click again to detonate**
  (12 s safety fuse otherwise). Blast reaches **10× the charge's size** and
  **hurts the diver too** — caught in your own blast costs 50 % of current air.
  Expanding shockwave ring.
- **Doubling upgrade prices** (`game._dblCost`): every upgrade (weapon levels,
  targeting, air tank, harpoon/charge capacity) doubles in cost each level;
  consumable refills (harpoon/charge/flare packs) stay flat.
- **Per-reef oxygen penalty** (`config.GAME.oxygenPenaltyPerReef`): air drains
  +10 % per reef (capped) on top of the creature-count/size scaling.
- **Pearls start deeper** (`config.GAME.pearlMinDepthFrac`): clams only spawn
  below ~16 % depth; shallow ledges hold chests instead.

## v12 — hold-to-aim auto-targeting

- **Hold-to-aim** (`config.AIM`, `game._nearestThreat`/`_angleToward`, unified
  fire state in `input.js`): holding fire roots the diver in place, swings the
  aim onto the **nearest live threat** and auto-fires once locked (red reticle +
  dashed guide line). A quick tap/click still fires once in the facing
  direction. Fire input is now polled by the game each frame
  (`input.fireHeld()`/`firePress`) across keyboard, mouse, gamepad and a touch
  AIM hold-button; `main.js` no longer fires on keydown/mousedown.
- The **standard harpoon is deliberately slow** now (cooldown 0.28 → 0.52).
- **Targeting System** shop upgrade (Lv1→3): each level speeds the aim swing
  and cuts the fire cooldown (×0.78/level).

## v11 — gold economy, dive bells, weapons & the shop

A roguelike-style gear loop, built in three phases.

- **Gold economy** (`config.GOLD`, `game._bankLoot`): banking carried loot at
  the boat or a dive bell yields full **score points plus gold** (50% of value).
  Gold is a per-run currency shown in the HUD purse.
- **Dive bells** (`entities/divebell.js`, `config.BELL`): 1–2 brass bells hang
  in deep chambers each reef. Swim in to **bank loot and fast-refill air** — a
  mid-depth safe haven. You still surface to the boat to sail on. Bells persist
  in the zone snapshot and show on the minimap.
- **Weapons** (`entities/weapons.js`, `config.WEAPON_*`): the harpoon is joined
  by four buyable weapons — **net gun** (snares a creature), **speargun** (rapid
  burst), **depth charge** (lobbed area blast), **shock prod** (stun ring).
  Cycle with Q/E, `[`/`]`, gamepad Y/LB, or the touch SWAP button; the HUD shows
  the current weapon. Snared creatures (`Creature.snareT`) freeze, deal no
  contact damage and wear a mesh overlay.
- **Dive shop** (`state 'shop'`, `game._shopItems`/`_shopBuy`/`_shopScreen`):
  open at the boat or a bell (B / gamepad B / touch ⚙ SHOP). Spend gold to
  unlock weapons (reef-gated: net r1, shock/speargun r2, depth charge r3),
  upgrade them (Lv1→3 — each level boosts the key stat and trims cooldown), and
  buy air-tank upgrades. Navigate ↑/↓ + Space/A, gamepad D-pad + A, or tap rows.
- **Supply crates** (`entities/weapons.js SupplyCrate`): a crate sometimes
  drifts in a reef; reaching it grants a random reef-available weapon, else an
  upgrade, else gold, with a cartoon flourish.

## v10 — mobile touch buttons

- **On-screen touch buttons** (`input.js` `touchButtons`/`_hitButton`/
  `consumeButton`, `game._syncTouchButtons`/`_touchBtn`): touch-only players
  couldn't pause, mute or sail on (those were keyboard/gamepad-only). The game
  hands Input a per-state list of logical-coord button rects each frame; taps
  are hit-tested against them and consumed before the joystick/tap-fire logic,
  so a button press never steers or fires. Buttons are **gated behind
  `input.isTouch`** — desktop and gamepad play draw and behave exactly as before.
  - **Pause / mute** cluster, top-centre, shown while playing or paused.
  - **⛵ Sail On**, bottom-centre, shown only when docked with the reef
    objective met — a tap calls `_setSail()`, replacing the hold-↑ gesture
    that's awkward on a touchscreen.
- **Paused-tap fix** (`main.js`): tap-anywhere-to-start now fires only on the
  menu/gameover screens, so a tap on a HUD button while paused no longer also
  resumes the game.
- **Safe-area insets** (`style.css`): `#stage` padding uses
  `max(8px, env(safe-area-inset-*))` so the canvas clears notches, rounded
  corners and the home indicator on modern phones.

## v9 — objectives, power-ups, minimap, controllers, collision fix

- **Per-reef relic objective** (hybrid) (`entities/relic.js`, `config.RELIC`):
  each reef spawns one relic (anchor/statue/map/idol). Sailing on unlocks once
  `canSail = relicBanked || reefBanked >= reefGoal` — bank the relic (2000 pts)
  or grind the deliberately-steep points goal (8000 + reef·1500). HUD shows the
  objective + docked prompt; relic travels in the zone snapshot.
- **Extra life every 5,000 pts** + a **difficulty curve** by reef (creature
  count 32→56, shark size scales) so runs stay tense as lives accumulate.
- **Power-ups** (`entities/powerup.js`, `_applyPowerUp`): tank (permanent
  `airMax`), multifire (timed 3-way spread), shield (timed invuln + bubble),
  speed fins (accel/max-speed ×1.6, passed to `diver.update`), treasure magnet
  (pulls loot), and 1-UP. Weighted spawns; HUD buff timers.
- **Fog-of-war minimap** (`cave.reveal` + `cave.mini` buffer, `game._minimap`):
  a per-cell `seen` mask painted into a 1px-per-cell buffer as the diver
  explores; drawn top-right with diver/boat/relic markers. Per-cave (snapshot).
- **Gamepad support** (`input.js` `poll()`): Gamepad API — left stick/D-pad
  move, A/X/RB/RT fire, Start pause/confirm, Back mute; merged with keyboard +
  touch. Works on Steam Deck, ROG Ally, etc.
- **Collision fix** (`cave.collide`): replaced the uncapped single-push (which
  could teleport an embedded diver across the map → judder/stuck) with bounded
  gradient-descent (capped steps, coarse-grid fallback) + full into-wall
  velocity removal so the diver slides cleanly along walls.

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
