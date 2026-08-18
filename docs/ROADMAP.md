# Deep Descent — Roadmap / Ideas

A backlog of possible future features. Below the **Planned next** section these
are **ideas, not commitments** — a place to park things. Roughly grouped and
unordered within each group.

## Planned next (committed direction)

1. **One-shot special zones.** Once a special zone (whale belly, sunken temple,
   and any future entrance) has been entered *and* exited, its entrance should
   **disappear** so it can't be re-entered or farmed. The temple already does
   this (`_exitTemple` nulls the gate); extend the same rule to the whale and
   every new special.
2. **Cave-entrance minigames.** Some cave entrances open into a **different
   minigame** rather than more reef. First target: a **classic 1980s platformer**
   stage (run/jump/hazards, its own tiny renderer + input mapping, reached via
   the zone-stack like the belly/temple). Each minigame returns loot/gold on
   completion. Frame it as an optional detour with its own win/lose.
3. **Secure online scoring service.** A server-backed high-score / leaderboard.
   Design goals: submissions must be **verifiable and tamper-resistant** (don't
   trust the client's posted score) — e.g. sign runs, replay/validate a compact
   input log server-side, rate-limit, and authenticate. Needs a small backend
   (the game itself stays a static site) and a privacy-respecting identity story.
   This is a design task first, not a drop-in.

## Shipped since this file was written

Dark/torch vision → **dark caves + flares**. Balance pass and per-reef difficulty
curve → done. Limited-ammo weapons, weapon economy/shop, hold-to-aim, help
screen, dive bells → all shipped (see `DESIGN.md` v9–v15). Remaining ideas below
are still open.

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

- **More deep-sea creatures** — moray in wall crevices, a swordfish that charges,
  a drifting mine/urchin field.
- **Boss variants** — a giant squid vs. the kraken, or a guardian in the temple
  vault.
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
