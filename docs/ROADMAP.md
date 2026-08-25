# Deep Descent — Roadmap / Ideas

A backlog of possible future features. Below the **Planned next** section these
are **ideas, not commitments** — a place to park things. Roughly grouped and
unordered within each group.

## Planned next (committed direction)

1. **Minigame platform contract (P11, "app store").** Formalise the harness↔minigame
   boundary so minigames become catalogue content: a pure-data `manifest.js` per
   folder declaring identity, entry points, controls, instructions and goals; a
   discovery→library→menu-access ladder gated by goals and Salvage; and Core
   ownership of pause/quit, input routing, help and result summaries. Phased,
   with the reef's menu ownership moving last. Design draft (unapproved):
   `docs/superpowers/specs/2026-08-25-minigame-platform-contract-design.md`.

2. **Secure online scoring service.** A server-backed high-score / leaderboard.
   Design goals: submissions must be **verifiable and tamper-resistant** (don't
   trust the client's posted score) — e.g. sign runs, replay/validate a compact
   input log server-side, rate-limit, and authenticate. Needs a small backend
   (the game itself stays a static site) and a privacy-respecting identity story.
   This is a design task first, not a drop-in.

## Shipped since this file was written

Dark/torch vision → **dark caves + flares**. Balance pass and per-reef difficulty
curve → done. Limited-ammo weapons, weapon economy/shop, hold-to-aim, help
screen, dive bells → all shipped (see `DESIGN.md` v9–v15). **One-shot special
zones** → done: exiting the whale removes it (`_exitWhale` filters it from
`whales`), matching the temple's spent gate — no more re-entering/farming a
special. **Cave-entrance minigames** → done: some reef entrances open a
**classic 1980s platformer** stage via the zone-stack, with two launch themes
(**ship** wreck decks, **lair** cave interior) driven by data-only theme
definitions (palette + hazards + rooms). Each stage returns loot/gold on
completion, retreat, or death, and is a one-shot per entrance like the whale/
temple. **Stage backgrounds / parallax depth / platformer art polish** →
**SHIPPED** (DESIGN.md v20, "stage wreck overhaul"): a layered baked renderer
(depth-gradient backdrop, godrays/caustics, parallax wreck silhouettes,
autotiled structure + ladders, themed actors/loot/doors, foreground silt/
bubbles/kelp/vignette), more rooms (Ship 5, Lair 3) each proven traversable by
a real-physics test, and a themed HUD. Remaining ideas below are still open.

## Power-ups (new pickups)

Built so far: **air tank** (permanent max-air boost), **multifire** (timed 3-way
spread), **shield** (timed invulnerability), **speed fins** (faster swimming),
**treasure magnet** (pulls nearby loot), and **1-UP** (extra life). Plus an extra
life every 5,000 points and a per-reef difficulty curve. Still on the table:

- **Rapid reload** — shorter harpoon cooldown for a while.
- **Slow-drain regulator** — reduced air consumption for a while.

## Gameplay & mechanics

- **Treasure weight** — carrying more loot slows you down, so banking becomes a
  real risk/reward decision (deeper hauls are heavier).
- **Enterable shipwreck interiors** — swim inside a wreck as a small cave with
  its own loot (mini-zone, reusing the zone-stack).
- **More currents variety** — swirling/vortex currents, or currents that toggle.
- **Combo / multiplier** — chain pickups without taking a hit for bonus score.

## Content (creatures, bosses, zones)

- **More deep-sea creatures** → **SHIPPED** (DESIGN.md v19): a diverse,
  zone-aware, reef-gated roster — moray ambushers in crevices, a barracuda
  charger, piranha swarms, a camouflaged stonefish, an electric-ray pulse
  hazard, a wreck-guarding grouper, and a drifting urchin/obstacle field.
- **Boss variants** → **SHIPPED**: a **Giant Squid** mini-boss (HP-chipped like
  a lighter kraken) and a **Stone Sentinel** guardian that wakes to defend the
  temple key/vault. (A full second boss is still open.)
- **Temple puzzle variety** — multiple keys/doors, pressure-plate gates, a
  timed vault that reseals.
- **Weather / surface events** — storms that churn the surface and currents.

## Balance & polish

- **Ongoing balance** — keep tuning encounter density, ammo/flare economy,
  creature aggression, and shop pricing now that there are many systems.
- **Audio pass** — richer ambient layers, distinct SFX per creature/zone.
- **Accessibility** — remappable keys, colour-blind palette check, reduced-motion.

## Presentation & repo

- **Gameplay GIF** in the README (livelier than stills).
- **Social preview image** for nicer link unfurls on GitHub/social.
- **Sound-on-by-default prompt** / settings panel.

## Tech (optional)

- **WASM/native port** — the same game logic could compile to WASM if a native
  build is ever wanted (the original platform decision kept this open).
- **Save/stats** — persist best depth, kills, reefs cleared alongside high score.
