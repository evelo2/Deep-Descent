# Deep Descent — working conventions

A JS/Canvas browser game (homage to Durell's *Scuba Dive*, 1983), shipped to the
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
| name-first (majority) | `check(name, cond)` | 52 | everywhere |
| cond-first | `check(cond, msg)` | 23 | mostly `tests/core/` |
| name-first `assert` + `done()` | `assert(name, cond)`, ends `done()` | 16 | all of `tests/stage/` + `tests/creatures/` |

The two `check` styles are the dangerous pair: mixing them **silently
always-passes** — calling `check(1 === 2, 'msg')` in a name-first file evaluates
`cond = 'msg'`, which is truthy, so a false assertion reports success. The
`assert` files also print per-check `ok`/`FAIL` lines as they go and exit
non-zero from `done()`. Census verified 2026-08-29 against all 91 test files.

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

## Persistence — do not rename these keys

`deepdescent.badges.v1`, `deepdescent.stats.v1`, `deepdescent.salvage.v2`,
`deepdescent.progress.v1`. Live players have progress under them and the badge
and progressive-tier ids double as **registered Steam achievement ids**.
Renaming a goal id orphans real player progress. Ids that shipped before the
P11.1 manifest layer are pinned in `src/core/grandfathered-ids.js`; goals added
from now on must be namespaced `<minigameId>:<key>`.

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
- **Registered minigame ids are `legacy` and `match3`.** `reef`, `stage` and
  `whirlpool` are internal zones of `legacy`, not registered minigames, despite
  having their own folders under `src/minigames/`.

## Working style

Substantial features go brainstorm → written spec in `docs/superpowers/specs/`
→ plan in `docs/superpowers/plans/` → implementation. Specs and plans are
committed and are the durable record; check for an existing one before designing.
