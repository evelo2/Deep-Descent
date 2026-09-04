# Deep Descent — working conventions

## Resuming after /clear
On `continue` (or any resume-style opener) at the start of a session, first read
`.claude/next-up.md` if it exists and resume from its "next step". That file is
a handoff written by clear-prep before the last clear; it's the bridge across
the context reset.

A JS/Canvas browser game — dive, salvage and surface alive — shipped to the
web and wrapped for Steam via Electron in `desktop/`. Architecture lives in
`docs/platform/architecture.md`; this file is only the things that are easy to
get wrong.

## Build & run

**There is no build step.** The browser loads the `.js` files in `src/`
untouched — no bundler, no transpile. Serve the repo root statically
(`python3 -m http.server 8000`) and open it. Never add a build dependency
without asking; several design decisions exist purely to preserve this.

## Tests

Plain Node scripts, no framework:

```bash
node tests/core/core.test.mjs                                   # one file
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done   # all
```

**⚠️ Three incompatible assertion styles exist. Copy the one already in the
file you are editing — never import a habit from another file.**

| Style | Signature | Files | Where |
|---|---|---|---|
| name-first (majority) | `check(name, cond)` | 73 | everywhere |
| cond-first | `check(cond, msg)` | 25 | scattered (heaviest in `tests/minigames/match3/`) |
| name-first `assert` + `done()` | `assert(name, cond)`, ends `done()` | 16 | `tests/creatures/` + part of `tests/stage/` |

The two `check` styles are the dangerous pair: mixing them **silently
always-passes** — calling `check(1 === 2, 'msg')` in a name-first file evaluates
`cond = 'msg'`, which is truthy, so a false assertion reports success. The
`assert` files also print per-check `ok`/`FAIL` lines as they go and exit
non-zero from `done()`. Census verified 2026-09-04 against all 114 test files
(73 + 25 + 16 = 114). Recounting: the name-first group hides three param-name
variants — `(name, cond)`, `(n, c)`, and one `function check(name, cond)`
declaration — so grep for the shape, not the literal text.

Every test ends by printing its own summary line — `` console.log(`ok foo.test.mjs (${pass} checks)`) ``
in the `check` files, `done()` in the `assert` ones.

## Types

```bash
npm run typecheck    # tsc --noEmit, must exit 0
```

`checkJs` is **off** in `tsconfig.json` — a file opts in by putting
`// @ts-check` on its first line. This types the Core↔MiniGame boundary without
dragging ~3000 lines of legacy gameplay in. `noImplicitAny` and
`strictNullChecks` are deliberately relaxed; everything else strict stays on.
New files under `src/core/` and `src/minigames/` should opt in.

## Versioning (`src/version.js`)

| Constant | Rule |
|---|---|
| `BUILD` | `'<phase>-<YYYY-MM-DD>'` (e.g. `p11-1-manifests-2026-08-28`). **Bump every deploy** — it prints in the boot banner and on the About screen, so a stale value on a device means the browser is serving cached scripts. The date suffix is not optional. |
| `ENGINE_VERSION` | The Core/platform version. Bump when the Core contract or shared systems change. |
| `VERSION` | Player-facing release number. Leave it alone unless shipping a release. |

## Deploying

**Every push to `main` deploys automatically** — `.github/workflows/pages.yml`
builds the repo as-is to GitHub Pages in ~20s. There is no manual deploy step and
nothing to run. Confirm a deploy landed by checking the live build stamp:

```bash
curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD
```

It must match `src/version.js`. A stale value means the browser (or the deploy)
is serving old scripts. Pushing a feature BRANCH deploys nothing — only `main`.
(README's "Deploy from a branch" instructions are stale; the workflow replaced
that path after the branch builder wedged.)

## Persistence — do not rename these keys

`deepdescent.badges.v1`, `deepdescent.stats.v1`, `deepdescent.salvage.v2`,
`deepdescent.progress.v1`. Live players have progress under them and the badge
and progressive-tier ids double as **registered Steam achievement ids**.
Renaming a goal id orphans real player progress. Ids that shipped before the
P11.1 manifest layer are pinned in `src/core/grandfathered-ids.js`; goals added
from now on must be namespaced `<minigameId>:<key>`. The first namespaced keys
are `legacy:valveOffered` / `legacy:valveBought` (2026-09-02) — copy their
shape: add to `STAT_KEYS`, emit from `_runDelta()`, and declare in the owning
manifest's `goals.stats`. A `:` is inert downstream (the counters are just JSON
object keys) and old saves backfill to 0 through `sanitize()`, so adding one
needs no migration. A counter with no progressive track binding it mints no
Steam achievement id — that is how to add a diagnostic without creating a goal.

Counts drift — **recount from `src/meta/`, never quote a number from docs or
memory.**

## Known gotchas

- **Never cache `W`/`H` at import time.** `setViewport(w, h)` in `src/game.js`
  reassigns the module-level `W`/`H` *and* `WORLD.W`/`WORLD.H` on every resize or
  rotate. Destructuring them into a local at module scope pins a stale viewport.
  Resize offscreen buffers on the same signal.
- **The `game.js` shell must read dive run-state off `this._reef`, not `this.*`.**
  The reef is a MiniGame the shell forwards to. Getting this wrong froze touch
  devices twice — test with touch emulation.
- **Core minigames must OR `consumeStart()` into their confirm/A-button check**,
  and d-pad left/right arrive as `pressed('left')` / `pressed('right')`. Missed
  twice; verify on the ROG Ally.
- **Any wrapper between a minigame and the Core must forward `ctx`.** The shell's
  host wrapper in `game.js` dropped `open`'s second argument for a year, so
  `host.open('match3', { source: 'chest' })` arrived as a menu launch and the
  `hoardcleared` Steam achievement was unobtainable (fixed 2026-08-28, `e1e33c5`).
  `tests/game/open-ctx-chain.test.mjs` drives the whole real chain and is the
  guard — extend it rather than writing a fresh isolated test.
- **Web Audio cannot be verified by the Node stub alone.** `tests/audio/`'s stub
  passes tests that prove nothing: a real `AudioParam.value` does NOT reflect
  scheduled automation (it reads the node default — 350 Hz for a biquad), while
  the stub's param updates `.value` immediately. Total RMS also hides filter
  changes, because the unfiltered sub drone dominates it. For any audio change,
  serve the branch and measure a real `OfflineAudioContext` render — peak, and
  high-frequency energy for filter work. Also: per-frame setters must return
  early when the value is unchanged, or re-issuing `setTargetAtTime` restarts
  the ramp every frame and it never lands (cost us a chase that reached 0.58
  instead of 1.0, fixed 2026-09-01).
- **`WORLD.WW`/`WORLD.WH` are LIVE too, not just `W`/`H`.** `setWorldSize(reef)`
  reassigns them per world tier (411 m → 700 → 1150 → 1800 at reefs 4/11/21).
  Never destructure them at module scope. Verify with
  `grep -rE '(const|let|var)\s*\{[^}]*\bW[WH]\b[^}]*\}\s*=\s*WORLD' src/` —
  a word-order filter is not enough, a reordered capture slips past it.
- **Nested zones must reset the world size.** `_generateTemple`/`_generateAbyss`/
  `_generateBelly` each call `setWorldSize(1)`, and `_restoreReef` calls
  `setWorldSize(this.reef)`. Without both, a tier-4 temple inherits an 1800 m
  world while its rewards stay fraction-of-height — cost scales, reward does
  not, and you drown in what used to be a bonus.
- **Anything driven per-frame must be driven from a place that always runs.**
  The reef's `update()` early-returns for stage/whirlpool zones, non-playing
  shell states, and docking. The crush klaxon is set from ONE line at the very
  top of `update()` that re-derives on/off from state each frame — because a
  setter that returns early when unchanged stays ON forever if the code that
  would turn it off stops being reached. That line also gates on
  `_shell.state === 'playing'` FIRST, so it cannot read run-state before
  `start()` has run (main.js's RAF loop calls `update()` from frame one).
- **Placement bugs need statistical tests, not unit tests.** The relic clamp
  passed 25 unit tests while spawning unwinnable reefs in 14.7% of tier-4 runs,
  because the units tested the weight functions and not the outcome.
  `tests/game/relic-crush-depth.test.mjs` drives 250 real world generations and
  asserts zero violations. It is the suite's slowest file (~10 s) and worth it.
- **Registered minigame ids are `legacy` and `match3`.** `reef`, `stage` and
  `whirlpool` are internal zones of `legacy`, not registered minigames, despite
  having their own folders under `src/minigames/`.

## Framing — do not reintroduce a lineage

This project used to describe itself as a homage to a 1983 title, and shipped
that game's ROM in the repo. **All of it was removed on 2026-09-04** (PR #7 plus
a full history rewrite): the menu and About strapline, the page `<title>`, the
README's origin/credits sections, `docs/DESIGN.md`'s origin, the LICENSE
carve-out, and the `.z80` binary itself.

Deep Descent is described **only as what it is** — an underwater
dive-and-salvage game. Do not add a homage line, an "inspired by", a studio
name, or a year to any player-facing string, doc, commit message or PR body.
The strapline is *"dive deep, salvage what you can, surface alive"*.

## Working style

Substantial features go brainstorm → written spec in `docs/superpowers/specs/`
→ plan in `docs/superpowers/plans/` → implementation. Specs and plans are
committed and are the durable record; check for an existing one before designing.
