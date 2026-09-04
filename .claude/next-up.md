# Next up — Deep Descent

## Where we are

Everything is shipped, merged and live. `main` is clean and in sync, **114 test
files pass**, `npm run typecheck` exits 0, live build stamp is
`no-lineage-2026-09-04`. **Nothing is in flight.**

Landed since the last handoff:
- **Deep Reefs** (PR #5) — four world tiers to 1800 m, a 250 m oxygen line, crush
  depth with a 14 s alarm, a three-rung Depth Valve, treasure that grows and
  migrates downward, Dry Dock max-lives. See [[deep-reefs-shipped]] memory.
- **"An Anglerfish got you"** (PR #6) — the death screen names the killer.
  `spawnCreature` now tags every instance with its fauna `kind`.
- **All lineage references removed** (PR #7) + a full git history rewrite across
  51 refs, purging the original game's ROM. See `CLAUDE.md` § "Framing".
- Klaxon lowered to 0.08 and sea-life ambience made more present (whale calls
  every ~91 s shallow / ~50 s deep, was ~260 s / ~104 s).

## Next step — the deep-themes brainstorm

The user asked for **deep themes: Roman/Greek ruins, an underwater space
station**, and separately for **new deep treasure types** and **per-creature
first-kill badges + kill-count progressive tracks**.

Treat these as ONE brainstorm, because they interlock:

1. **Themes are the big question.** Is a theme a new *nested zone* (like the
   existing temple, which is already a Greek-ish ruin with Sentinels and a
   key/vault puzzle), or does it **reskin the whole reef at depth** — tier 3
   *is* the ruins, tier 4 *is* the station? The second is far more ambitious and
   would give the tier system a reason to exist beyond "deeper".
2. **Themes imply creatures, which implies badge ids.** If a station brings its
   own fauna, those creatures need kill badges — and badge / progressive-tier
   ids are **permanent registered Steam achievement ids**. Design the id scheme
   BEFORE adding themed creatures, or it needs retrofitting. 16 creature classes
   today; 16 badges + 16 tracks × 3 tiers would be ~64 new permanent ids on top
   of the existing 66.
3. **Themes imply treasure** — amphorae, data-cores — which answers "new deep
   treasure types" rather than it being an independent list.

Start with `superpowers:brainstorming`. This is architectural, so it goes
brainstorm → spec in `docs/superpowers/specs/` → plan → implementation.

Groundwork already in place: creatures carry `kind` (from PR #6), and
`ZONE_FAUNA` in `src/entities/spawn.js` is a data-driven, reef-gated table with
a `newFaunaAtReef()` first-encounter toast already wired.

## Watch-outs

- **Every push to `main` deploys to the live site automatically** (~20 s, no
  staging). Bump `BUILD` in `src/version.js` every deploy and confirm with
  `curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD`.
- **Never describe the game as a homage to anything** — see `CLAUDE.md`
  § "Framing" and the [[no-lineage-framing]] memory. Strapline is *"dive deep,
  salvage what you can, surface alive"*.
- **Badge and progressive-tier ids are registered Steam achievement ids** and can
  never be renamed. Ids added from P11.1 onward must be namespaced
  `<minigameId>:<key>`. Never add to `src/core/grandfathered-ids.js` — it throws.
- **Four open items on Deep Reefs the user knows about and chose to defer:**
  tier 4 doesn't hold 60 fps (mean 31.8 ms, `draw()` dominates); the 1800 m
  ascent is tedious not tense; max lives silently drops 5 → 3 for existing
  saves; the amber oxygen band may be too faint.
- **Loose end, user is relaxed about it:** GitHub still serves the purged ROM by
  SHA until it garbage-collects. Clean fix is a GitHub Support ticket. Backup of
  pre-rewrite history: `~/deep-descent-backup-before-history-rewrite.bundle`.
- **Counts drift** — recount from `src/meta/` and `tests/`, never quote a number
  from docs or memory. The test census has now drifted twice in two sessions.
- `CLAUDE.md`'s gotcha list gained four entries from the Deep Reefs work. Read it
  before touching world size, nested zones, per-frame audio setters, or anything
  whose bug would be statistical rather than deterministic.
