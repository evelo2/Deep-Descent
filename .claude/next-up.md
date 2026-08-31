# Next up — Deep Descent

## Where we are
`main` is clean, pushed, **93/93 tests green, `npm run typecheck` exits 0**.

Shipped and live this session: the **depth gauge + Depth Valve** (PR #3, merge
`47ba98c`, deployed, live BUILD `depth-gauge-2026-08-31`). The gauge is on the
LEFT edge — the right has no clear full-height lane (minimap + touch controls),
which only showed up by running it in a browser.

Specced and planned but **not started**: the **underwater music**.

## Next step
Pick one — ask the user which if it isn't obvious from their opener:

1. **Underwater music** — implement
   `docs/superpowers/plans/2026-08-31-underwater-music.md`, Task 1 of 7.
   Spec: `docs/superpowers/specs/2026-08-31-underwater-music-design.md`.
   Task 1 is the palette data + the pure `paletteFor` rule; no Web Audio yet.
2. **P11.2 shell chrome** — resume
   `docs/superpowers/plans/2026-08-28-p11-2-shell-chrome.md` at **Task 2**.
   Task 1 is committed on branch `feat/p11-2-shell-chrome` (`031647f`), local
   and unpushed. Read that plan's **"Locked decisions"** first — it is the ONLY
   record of the seven design answers approved 2026-08-28.

## Watch-outs
- **Two manual, browser-only debts, both still unpaid:**
  1. **Nobody has bought a Depth Valve mid-dive** (needs reef 3 + 400g). The
     shop logic is unit-tested against the real `_shopItems`/`_shopBuy`, but the
     in-game path is unproven. `VALVE.holdDepthM` = 240 is a guess, not balance.
  2. **The P11.1 browser pass** — menu → About → dive → Guardian Chest →
     match-3 → back. Owed since before this session.
- **Run visual/audio work in a real browser before believing it.** The gauge's
  first cut was drawn underneath the minimap and every test passed.
- **Three incompatible assertion styles** live in `tests/` (see CLAUDE.md).
  Mixing the two `check()` ones silently always-passes.
- The music plan's Task 7 keeps a **listening pass** as a required step — the
  palettes are data so tuning is cheap, and the first build will need it.
- P11.2 touches the **touch** path and the shell/reef seam that has frozen touch
  devices twice.
