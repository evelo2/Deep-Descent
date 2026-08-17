# Deep Descent — Roadmap / Ideas

A backlog of possible future features. These are **ideas, not commitments** —
a place to park things so they aren't lost. Roughly grouped and unordered
within each group.

## Power-ups (new pickups)

Built so far: **air tank** (permanent max-air boost) and **multifire** (timed
3-way harpoon spread). Candidates to add, using the same `entities/powerup.js`
+ `_applyPowerUp` framework:

- **Shield** — a bubble of brief invulnerability (a few seconds) after pickup.
- **Speed fins** — temporarily faster swimming (higher accel / max speed).
- **Treasure magnet** — auto-collects nearby loot for a while.
- **Extra life** — a one-off +1 life.
- **Rapid reload** — shorter harpoon cooldown for a while.
- **Slow-drain regulator** — reduced air consumption for a while.

## Gameplay & mechanics

- **Treasure weight** — carrying more loot slows you down, so banking becomes a
  real risk/reward decision (deeper hauls are heavier).
- **Torch / light cone** — in the darkest deep zones, vision narrows to a
  head-lamp cone; bioluminescent creatures stand out.
- **Enterable shipwreck interiors** — swim inside a wreck as a small cave with
  its own loot (mini-zone, reusing the zone-stack).
- **More currents variety** — swirling/vortex currents, or currents that toggle.
- **Combo / multiplier** — chain pickups without taking a hit for bonus score.

## Content (creatures, bosses, zones)

- **More deep-sea creatures** — moray in wall crevices, a swordfish that charges,
  a drifting mine/urchin field.
- **Boss variants** — a giant squid vs. the kraken, or a guardian in the temple
  vault.
- **Temple puzzle variety** — multiple keys/doors, pressure-plate gates, a
  timed vault that reseals.
- **Weather / surface events** — storms that churn the surface and currents.

## Balance & polish

- **Balance pass** — tune encounter density, air drain, creature aggression,
  power-up frequency, and scoring now that there are many systems.
- **Difficulty curve** — reefs get harder as `reef` number climbs.
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
