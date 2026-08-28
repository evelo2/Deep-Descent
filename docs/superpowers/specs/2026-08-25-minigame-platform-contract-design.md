# Minigame Platform Contract — "App Store" Phase (P11)

**Status:** DESIGN APPROVED (2026-08-28). All sections reviewed with the user;
every open question in the 2026-08-25 draft is now resolved and recorded in §1.
Nothing has been implemented. Next step is `superpowers:writing-plans` for
**P11.1 only**.

---

## 0. Goal

Formalise the boundary between the harness (Core/shell) and a minigame so that
minigames become *catalogue content* rather than hardcoded modes — an app-store
shape. A minigame may be small (match-3) or large (a full roguelike dungeon
crawl with its own sprites and its own goals), but every one adheres to a
contract that lets the harness:

- retain overall control (pause, quit, suspend — a player can never be trapped),
- **discover** the minigame's identity, controls, instructions and goals without
  knowing anything about its internals,
- expose **one or more entry points**, including direct launch from the main menu,
- gate access through an expanded notion of Salvage / the player's life *between*
  games.

## 1. Locked decisions

Decisions 1–5 were confirmed 2026-08-25; decisions 6–9 resolved the draft's open
questions on 2026-08-28. **Do not re-litigate any of these.**

| # | Question | Decision |
|---|---|---|
| 1 | Trust model | **First-party now, third-party-ready shape.** Self-contained folder + declarative manifest, lazy `import()`, Core-validated contract version. Trusted code — no sandbox — but the *shape* is portable. |
| 2 | Menu ownership | **Home minigame, but phased.** End state: a `home` minigame is the base of the Core stack and the reef is an ordinary catalogue entry. Land the manifest + catalogue FIRST; move title/menu ownership out of the reef LAST. |
| 3 | Goals ownership | **Minigame declares, Core registers at boot.** Badges / progressive tracks / stat counters ship in the manifest, namespaced by minigame id (see #7). Progression merges registered tables; the Trophy Wall grows automatically with per-game sections. |
| 4 | Unlock model | **Discovery-first ladder.** *Most* minigames are randomly **discoverable in-game** (as the Guardian Chest already discovers match-3). *Some* then become **menu-accessible**, unlocked either by a **goal** or by a **Salvage purchase**. Both mechanisms are in scope. |
| 5 | Shell-owned chrome | **All four**: pause/quit/suspend, input routing + control legend, instructions/how-to-play screen, result summary + reward toasts. An author gets these free and cannot diverge. |
| 6 | Packaging | **Approach A** — pure-data `manifest.js` + lazy `index.js` per folder, statically-imported `catalogue.js`. See below. |
| 7 | Badge predicates | **Split the file.** `manifest.js` stays pure data and *describes* each badge; the predicate functions live in the runtime module and load with the engine. See §3.4. |
| 8 | Namespacing | **Grandfather what shipped, namespace what's new.** Ids that shipped before P11.1 stay bare so live saves and the registered Steam ids keep working; everything declared from P11.1 onward namespaces. See §3.4. |
| 9 | Unlock currency | **Permanent Salvage purchase.** No second currency. Competes with Dry Dock rentals by design; needs the parked balance pass. See §4. |
| 10 | Phase order | **Chrome before Library.** P11.2 is the shell chrome; the Library screen moves to P11.3. See §5. |

### Packaging — Approach A (decision #6)

Each minigame folder gets `manifest.js` (pure serialisable data) + `index.js`
(runtime module). `src/minigames/catalogue.js` statically imports every
*manifest* (tiny, data-only) and holds `() => import('./x/index.js')` for the
runtime. The shell therefore has the entire catalogue — menu tiles, Trophy Wall
sections, help pages, unlock requirements — at boot **without loading a single
engine**, and boot stays synchronous with no build step.

Rejected: **B, self-registering modules** (forces eager import of every engine,
circular deps, load-order-dependent boot). Deferred: **C, JSON manifests fetched
at runtime** (true drop-in, but async boot, `app://` edge cases in the Electron
wrapper, no `tsc` coverage, fetch stubs in tests).

**Key constraint that keeps C cheap later:** write `manifest.js` as
`export default { … }` with *no imports* and no functions except the single
`module:` loader thunk. Converting to JSON then becomes mechanical rather than a
rewrite. Decision #7 exists to protect this property.

## 2. Current state (what exists today)

- `src/core/contract.js` — JSDoc typedefs only (`MiniGame`, `Host`,
  `MiniGameResult`). A **runtime** contract: `enter/update/render/exit`.
- `src/core/core.js` — registry (`Map` by id), a mode **stack** with deferred
  `open`/`close` applied at the frame boundary, and `creditResult` (the single
  path crediting salvage → `economy.earn`, stats → `progression.recordRun`,
  ids → `achievements.unlock`).
- `src/core/host.js` — the facade; `world` is an opt-in capability.
- `src/main.js` — registers **`legacy`** + **`match3`**, boots `legacy`, and
  **hardcodes match-3 pointer routing** (~60 lines of `m3PointerDown/Up` +
  `core.activeId() === 'match3'` branches in every mouse/touch listener). This
  is the clearest smell the contract must delete.
- `src/minigames/` holds `legacy/`, `match3/`, `reef/`, `stage/`, `whirlpool/`,
  but **only `legacy` and `match3` are registered with Core**. `legacy` wraps
  `Game` from `src/game.js`, which in turn drives `reef`/`stage`/`whirlpool` as
  internal zones. The `legacy` → `home` + `reef` split is P11.5's job, not
  P11.1's — P11.1 retrofits manifests for `legacy` and `match3` only.
- `src/game.js` — the ~800-line shell: menu, help pages (`HELP_PAGES`), Trophy
  Wall, Dry Dock, About, control schemes. The **menu still belongs to the
  reef's state machine** (`reef/index.js` launches match-3 from the menu).
- `meta/badges.js`, `meta/progressive.js`, `meta/stats.js` — central hardcoded
  goal tables + a fixed Steam id list. Badges are **predicate functions**
  (`test: (s) => s.won && s.kills === 0`), persisted under bare ids in
  `deepdescent.badges.v1`; stats under bare keys in `deepdescent.stats.v1`.

**What's missing is a declarative layer.** The runtime contract exists; the
*self-description* does not.

## 3. The manifest

### §3.1 Shape

```js
// src/minigames/match3/manifest.js
export default {
  id: 'match3',
  contract: 1,                       // ABI version; Core validates and refuses mismatches
  name: 'Treasure Chest Madness',
  version: '1.1.0',
  icon: '💰',                        // library tile glyph
  blurb: 'Swap tiles, pop chests, bank salvage.',
  capabilities: ['economy', 'progression'],   // add 'world' for diver-world modes

  entries: [ /* §3.2 */ ],
  controls: { /* §3.3 */ },
  help: [ { title: 'HOW TO PLAY', lines: [ /* … */ ] } ],
  goals: { /* §3.4 */ },

  module: () => import('./index.js'),   // the ONLY function in the file
};
```

**`capabilities` is enforced, not documentation.** Core builds the Host facade
from this list: a minigame that did not declare `world` does not receive
`host.world`. This is what makes the "third-party-ready shape" real at
near-zero cost, and it makes each minigame's dependencies auditable from data.

**`contract`** is the ABI version. Core validates it at registration and refuses
a mismatch loudly rather than failing at some later frame.

### §3.2 Entry points

An entry is a *way in*, not a game. Kinds:

```js
entries: [
  { id: 'chest', kind: 'world', label: 'Guardian Hoard',
    ctx: { source: 'chest' }, discovers: true },      // playing it marks the game discovered
  { id: 'arcade', kind: 'menu', label: 'Play Treasure Chest Madness',
    requires: { discovered: true, badge: 'match3:hoardbreaker' } },
  // or: requires: { discovered: true }, cost: { salvage: 250 }
]
```

- `kind: 'world'` — triggered by an in-world event in a host minigame (today:
  the Guardian Chest). The host calls `host.open(id, ctx)`; the ctx it passes is
  the entry's declared `ctx`.
- `kind: 'menu'` — a Library tile. Visible/locked state is computed by the
  unlocks service (§4), never by the minigame.
- `discovers: true` — first play flips the discovery ledger for this minigame.

### §3.3 Controls declaration

```js
controls: {
  pointer: true,                    // wants raw pointer events (see §5)
  actions: [
    { id: 'cursor', label: 'Move cursor', keys: ['Arrows'], pad: 'D-pad', touch: 'drag' },
    { id: 'swap',   label: 'Swap tiles',  keys: ['Space', 'Enter'], pad: 'A', touch: 'tap two tiles' },
  ],
}
```

The shell renders the legend and the touch buttons from this, per control scheme
(Keyboard / Steam Deck / ROG Ally / touch) — reusing `controls.js` +
`render/chrome.js`.

### §3.4 Declared goals

**Data and predicates are split** (decision #7). The manifest *describes* goals —
everything the shell needs to draw a Trophy Wall without loading an engine. The
predicate functions live in the runtime module beside the code whose stats they
read, and Core evaluates them at credit time, when the engine is loaded anyway.

```js
// manifest.js — pure data, no functions
goals: {
  stats:  [ { key: 'match3:hoards', label: 'Hoards cleared' } ],
  badges: [ { id: 'match3:hoardbreaker', glyph: '🏆', name: 'Hoardbreaker',
              desc: 'Clear a Guardian hoard' } ],
  tracks: [ { id: 'match3:hoarder', stat: 'match3:hoards', tiers: [5, 25, 100] } ],
}

// index.js — predicates ship with the engine
export const goals = {
  badges: {
    'match3:hoardbreaker': (s) => !!s.hoardCleared,
  },
};
```

This keeps `manifest.js` serialisable (protecting the Approach C door) while
preserving the full expressiveness of today's predicates — conditions like
`s.won && s.spawned >= 20 && s.kills / s.spawned < 0.3` need a real function, and
a declarative DSL that could express them would be a language with its own bugs.

**Namespacing (decision #8).** All ids are namespaced `<minigameId>:<key>` so two
minigames can both have a `levels` counter — with one grandfathered exception,
frozen by **id**, not by owning manifest.

Everything that shipped before P11.1 stays bare: the 18 badges in
`meta/badges.js`, the 16 `STAT_KEYS` in `meta/stats.js`, and the 16 `TRACKS` in
`meta/progressive.js`. Live saves under `deepdescent.badges.v1` /
`deepdescent.stats.v1` and the Steam achievement ids already registered on the
partner site therefore keep working with **zero migration**.

The exemption cannot be scoped to the `legacy` manifest alone, as the 2026-08-25
draft assumed: **match-3 already ships bare ids too** (`hoardcleared`,
`comboartist`, `m3Pearls`, `m3Gems`, `m3Coins`, `m3Explosions`, and the
`m3pearls`/`m3gems`/`m3coins`/`m3boom` tracks). Renaming those would break
exactly the saves this decision exists to protect.

So the rule is: an id must be namespaced **unless it appears in the frozen
pre-P11.1 allow-list** (`src/core/grandfathered-ids.js`). Nothing may ever be
added to that list. Core enforces the rule at registration; a bare id absent from
the list, or one namespaced to a different minigame, is a validation error.

`progression.registerGoals(manifest)` at boot merges declarations into the owned
tables. The Trophy Wall gains a per-game section.

**Steam id dump.** Steamworks requires achievement ids pre-registered on the
partner site, so declaration is the source of truth but a small script must dump
the full id list to paste into Steamworks. Delivered in P11.4 alongside
`registerGoals`.

## 4. The discovery → library → access ladder

Three persisted states per minigame, in a NEW Core service (`makeLibrary`,
key `deepdescent.library.v1`), storage-injectable like every other meta module:

```
undiscovered  →  discovered  →  menu-accessible
```

- **undiscovered** — the Library shows a silhouette tile (`???`) with no name.
  The game is still fully playable *if* the world throws you into it. This is
  the default for most minigames.
- **discovered** — set the first time a `discovers: true` entry is played. The
  tile reveals name/icon/blurb and shows what would make it menu-launchable.
- **menu-accessible** — the `kind: 'menu'` entry's `requires` are satisfied
  (goal-gated) and/or its `cost` has been paid (Salvage-purchased). Now it
  launches straight from the main menu.

Ledger shape: `{ discovered: { id: firstSeenTs }, purchased: { 'id:entry': true }, plays: { id: n } }`.
The `plays` counter is cheap to keep and feeds "most-played" tile ordering later
for free.

**`alwaysAvailable`.** The `legacy` entry sets this flag: the base game is the
front door, never "discovered," never gated, and never drawn as a silhouette.

**Salvage's expanded role (decision #9).** Salvage stops being only a Dry Dock
gear currency and becomes the currency of the player's life between games — it
also buys **permanent** menu access to a discovered minigame. There is no second
currency. This *competes with relic rentals*, which is deliberate — it is a real
spend decision — but it must be tuned, not ignored. The balance pass is the one
already parked in the 2026-08-23 backlog.

## 5. Shell-owned chrome + phase plan

All five shell responsibilities are Core-owned (decision #5):

1. **Pause / quit / suspend.** New optional contract hooks `pause()` / `resume()`.
   Core draws ONE pause overlay and guarantees one exit route bound identically
   everywhere (Esc / Start / ✕). Deletes match-3's hand-rolled back handling.
2. **Input routing + control legend.** New optional contract hooks
   `onPointerDown(p)` / `onPointerUp(p)` (logical coords). `main.js` routes to the
   active minigame generically — **deleting the ~60 lines of hardcoded match-3
   plumbing**. The legend + touch buttons render from `controls.actions`. This
   also fixes the known gamepad gotcha (`consumeStart()` OR'd into confirm; d-pad
   L/R emitting `pressed('left'/'right')`) **once in the shell** instead of
   per-minigame, where it has already been missed twice.
3. **Instructions.** Shell renders one consistent Help/briefing screen from
   `blurb` + `help[]` for every minigame — including a pre-launch briefing.
4. **Result summary + reward toasts.** Core draws the standard run-over summary
   from `MiniGameResult` (score, salvage, new badges/tiers); Steam mirroring
   happens in exactly one place.
5. **Failure isolation.** Wrap `enter/update/render` in try/catch — a throwing
   minigame closes and returns Home with an error toast instead of killing the
   shell. Cheap, and it makes "third-party-ready" more than a slogan.

### Phases (decision #10 — chrome before Library, risky reef surgery LAST)

| Phase | Content | Visible change |
|---|---|---|
| **P11.1** | Contract v1 + `manifest.js` shape + `catalogue.js` + Core validation (contract version, namespacing rule, capability-built Host). Retrofit `legacy` & `match3` manifests. About screen sourced from manifests. | ~none |
| **P11.2** | Shell chrome: uniform pause/quit, briefing + summary screens, legend from declaration, pointer-routing hooks, failure isolation. Delete match-3 plumbing from `main.js`. | Consistent chrome |
| **P11.3** | `makeLibrary` discovery ledger + shell-rendered Library screen (silhouettes, locked tiles, requirements, Salvage purchase). | Library screen |
| **P11.4** | `progression.registerGoals` + namespaced stats + per-game Trophy Wall sections + Steam id dump script. | Trophy Wall grows |
| **P11.5** | Extract the `home` minigame: title/menu leave the reef, `home` becomes the stack base, `legacy` splits and the reef becomes an ordinary catalogue entry. | Real front end |

Taking chrome at P11.2 lands the code-health win first — it deletes the hardcoded
plumbing and makes adding a third minigame cheap — and lets the Library screen
ship at P11.3 with more than two tiles to show.

## 6. Testing posture

Unchanged house style: plain `node *.test.mjs` with `check()`, no framework, no
build step; `tsc --noEmit` continues to type the boundary. Manifests being pure
data makes them trivially unit-testable (a `validateManifest` test per contract
rule, including the bare-id rule from §3.4), and the Library/unlocks service is
storage-injectable like every other meta module.

The save-compatibility guarantee in decision #8 gets three explicit regression
tests, so a rename that would orphan a save or a Steam id fails the suite rather
than a player's Trophy Wall:

1. The frozen allow-list is pinned against the live `badges.js` / `stats.js` /
   `progressive.js` tables — same ids, same count, no stale entries.
2. Every grandfathered goal a manifest describes must match the live table
   field for field (`name`, `glyph`, `desc`, `stat`, `tiers`). While `meta/`
   remains the runtime source through P11.3, this is what makes hand-copying the
   descriptions into manifests safe.
3. Every live goal must be claimed by exactly one manifest — so nothing silently
   drops out of the Trophy Wall when P11.4 switches the source of truth over.

## 7. Next step

Design review is complete. Invoke `superpowers:writing-plans` for **P11.1 only**.
