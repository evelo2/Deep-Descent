# Next up — Deep Descent

## Where we are
P11 ("app store" phase) of the minigame-platform arc. **P11.1 shipped** (contract
v1, manifests, catalogue, capability-enforced Hosts — merged via PR #2, `f46fcc6`).
A year-old live bug was then fixed: the shell's host wrapper in `game.js` dropped
`open`'s `ctx`, so the `hoardcleared` Steam achievement was unobtainable (`e1e33c5`).
`main` is clean, pushed, **91/91 tests green, `npm run typecheck` exits 0**.

## Next step
Implement **P11.2 — shell chrome**, starting at **Task 1** of
`docs/superpowers/plans/2026-08-28-p11-2-shell-chrome.md`.

The plan has 7 TDD tasks, each with real test code and exact file paths. Task 1 is
`input.confirmEdge()` + moving the control-scheme storage and legend builder into
`src/controls.js`. Work the tasks in order; each ends in its own commit.

Read the plan's **"Locked decisions"** section first — the seven P11.2 design
answers were approved in chat on 2026-08-28 and that section is their ONLY durable
record. The spec (`docs/superpowers/specs/2026-08-25-minigame-platform-contract-design.md`
§5) was deliberately not amended, so it describes P11.2 only in outline.

## Watch-outs
- **Two manual, browser-only items are still owed** and no automated check in this
  repo can reach them:
  1. **Deploy** — the `hoardcleared` fix is on `main` but not in front of players.
     BUILD is `fix-hoardcleared-2026-08-28`; confirm the About screen shows it.
  2. **P11.1 browser pass** — menu → About → dive → Guardian Chest → match-3 → back.
- **Three incompatible assertion styles** live in `tests/` (see CLAUDE.md). Mixing
  the two `check()` ones silently always-passes. Read the top of any test file
  before editing it, and copy what is already there.
- P11.2 touches the **touch** path (the ✕ becomes the only quit route on touch) and
  the shell/reef seam that has frozen touch devices twice. Task 7 keeps a manual
  touch-emulated pass as a required, non-skippable step.
- Chrome in P11.2 wraps **stack-pushed minigames only**. The base `legacy` mode
  keeps its own pause/help/game-over until P11.5 — do not start that surgery early.
