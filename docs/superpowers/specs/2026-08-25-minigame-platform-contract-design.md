# Minigame Platform Contract — "App Store" Phase (P11)

**Status:** DESIGN DRAFT — brainstorm paused mid-flight (2026-08-25).
Decisions in §1 are **locked by the user**. §2–§5 are my proposed design and have
**NOT been reviewed or approved yet**. Nothing has been implemented. Resume at §7.

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

## 1. Locked decisions (user-confirmed, 2026-08-25)

| # | Question | Decision |
|---|---|---|
| 1 | Trust model | **First-party now, third-party-ready shape.** Self-contained folder + declarative manifest, lazy `import()`, Core-validated contract version. Trusted code — no sandbox — but the *shape* is portable. |
| 2 | Menu ownership | **Home minigame, but phased.** End state: a `home` minigame is the base of the Core stack and the reef is an ordinary catalogue entry. Land the manifest + catalogue + shell-rendered Library screen FIRST; move title/menu ownership out of the reef in a later phase. |
| 3 | Goals ownership | **Minigame declares, Core registers at boot.** Badges / progressive tracks / stat counters ship in the manifest, namespaced by minigame id. Progression merges registered tables; the Trophy Wall grows automatically with per-game sections. |
| 4 | Unlock model | **Discovery-first ladder** (user's own framing, richer than the options offered): *most* minigames are randomly **discoverable in-game** (as the Guardian Chest already discovers match-3). *Some* then become **menu-accessible**, unlocked either by a **goal** (goal-gated/earned) or by **Salvage purchase** (bought). Both mechanisms are in scope. |
| 5 | Shell-owned chrome | **All four**: pause/quit/suspend, input routing + control legend, instructions/how-to-play screen, result summary + reward toasts. An author gets these free and cannot diverge. |

### Packaging approach — recommended, awaiting the user's nod

**Approach A: data manifest + lazy runtime.** Each minigame folder gets
`manifest.js` (pure serialisable data) + `index.js` (runtime module).
`src/minigames/catalogue.js` statically imports every *manifest* (tiny,
data-only) and holds `() => import('./x/index.js')` for the runtime. The shell
therefore has the entire catalogue — menu tiles, Trophy Wall sections, help
pages, unlock requirements — at boot **without loading a single engine**.

Rejected: **B, self-registering modules** (forces eager import of every engine,
circular deps, load-order-dependent boot). Deferred: **C, JSON manifests fetched
at runtime** (true drop-in, but async boot, `app://` edge cases in the Electron
wrapper, no `tsc` coverage, fetch stubs in tests).

**Key constraint that keeps C cheap later:** write `manifest.js` as
`export default { … }` with *no imports* and no functions except the single
`module:` loader thunk. Converting to JSON then becomes mechanical rather than a
rewrite.

## 2. Current state (what exists today) — PROPOSED CONTEXT

- `src/core/contract.js` — JSDoc typedefs only (`MiniGame`, `Host`,
  `MiniGameResult`). A **runtime** contract: `enter/update/render/exit`.
- `src/core/core.js` — registry (`Map` by id), a mode **stack** with deferred
  `open`/`close` applied at the frame boundary, and `creditResult` (the single
  path crediting salvage → `economy.earn`, stats → `progression.recordRun`,
  ids → `achievements.unlock`).
- `src/core/host.js` — the facade; `world` is an opt-in capability.
- `src/main.js` — registers `legacy` + `match3`, boots `legacy`, and **hardcodes
  match-3 pointer routing** (~60 lines of `m3PointerDown/Up` + `core.activeId() === 'match3'`
  branches in every mouse/touch listener). This is the clearest smell the
  contract must delete.
- `src/game.js` — the 804-line shell: menu, help pages (`HELP_PAGES`), Trophy
  Wall, Dry Dock, About, control schemes. The **menu still belongs to the
  reef's state machine** (`reef/index.js:1226` launches match-3 from the menu).
- `meta/badges.js`, `meta/progressive.js`, `meta/stats.js` — central hardcoded
  goal tables + a fixed Steam id list.

**What's missing is a declarative layer.** The runtime contract exists; the
*self-description* does not.

## 3. Proposed design — §3.1 the manifest (NOT YET REVIEWED)

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
(Keyboard / Steam Deck / ROG Ally / touch) — reusing `controls.js` + `render/chrome.js`.

### §3.4 Declared goals (locked decision #3)

```js
goals: {
  stats:   [ { key: 'hoards',  label: 'Hoards cleared' } ],          // namespaced → 'match3:hoards'
  badges:  [ { id: 'hoardbreaker', glyph: '🏆', name: 'Hoardbreaker',
               desc: 'Clear a Guardian hoard', when: { summary: 'hoardCleared' } } ],
  tracks:  [ { id: 'hoarder', stat: 'hoards', tiers: [5, 25, 100] } ],
}
```

`progression.registerGoals(manifest)` at boot merges these into the owned tables.
All ids are namespaced `<minigameId>:<key>` so two minigames can both have a
`levels` counter. Trophy Wall gains a per-game section.

**Steam caveat to resolve:** Steamworks requires achievement ids pre-registered
on the partner site, so declaration is the source of truth but a small script or
doc must dump the full namespaced id list to paste into Steamworks. (Today: 44
ids, hand-maintained.)

## 4. Proposed design — the discovery → library → access ladder

Three persisted states per minigame, in a NEW Core service (`makeLibrary`,
key `deepdescent.library.v1`):

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

**Salvage's expanded role.** Salvage stops being only a Dry Dock gear currency
and becomes the currency of the player's life between games — it can also buy
menu access to a discovered minigame. This *competes with relic rentals* and
needs an explicit balance pass; that tension is deliberate (a real spend
decision) but must be tuned, not ignored.

**Open question for review:** should Salvage-purchase be permanent, or should
big-ticket unlocks use a second currency to avoid cannibalising Dry Dock
spending? The user selected both goal-gating and Salvage-purchase and did not
select the second-currency option, so the draft assumes **permanent Salvage
purchase**, flagged for balance.

## 5. Proposed design — shell-owned chrome + phase plan

All five shell responsibilities are Core-owned (locked decision #5):

1. **Pause / quit / suspend.** New optional contract hooks `pause()` / `resume()`.
   Core draws ONE pause overlay and guarantees one exit route bound identically
   everywhere (Esc / Start / ✕). Deletes match-3's hand-rolled back handling.
2. **Input routing + control legend.** New optional contract hooks
   `onPointerDown(p)` / `onPointerUp(p)` (logical coords). `main.js` routes to the
   active minigame generically — **deleting the ~60 lines of hardcoded match-3
   plumbing**. The legend + touch buttons render from `controls.actions`.
3. **Instructions.** Shell renders one consistent Help/briefing screen from
   `blurb` + `help[]` for every minigame — including a pre-launch briefing.
4. **Result summary + reward toasts.** Core draws the standard run-over summary
   from `MiniGameResult` (score, salvage, new badges/tiers); Steam mirroring
   happens in exactly one place.
5. **Failure isolation** (my addition, cheap and makes "third-party-ready" real):
   wrap `enter/update/render` in try/catch — a throwing minigame closes and
   returns Home with an error toast instead of killing the shell.

### Proposed phases (P11.x), risky reef surgery LAST

| Phase | Content | Visible change |
|---|---|---|
| **P11.1** | Contract v1 + `manifest.js` shape + `catalogue.js` + Core validation. Retrofit reef & match3 manifests. About screen sourced from manifests. | ~none |
| **P11.2** | `makeLibrary` discovery ledger + shell-rendered Library screen (silhouettes, locked tiles, requirements, purchase). | Library screen |
| **P11.3** | Shell chrome: uniform pause/quit, briefing + summary screens, legend from declaration, pointer-routing hooks. Delete match-3 plumbing from `main.js`. | Consistent chrome |
| **P11.4** | `progression.registerGoals` + namespaced stats + per-game Trophy Wall sections + Steam id dump. | Trophy Wall grows |
| **P11.5** | Extract the `home` minigame: title/menu leave the reef, `home` becomes the stack base, reef becomes an ordinary catalogue entry. | Real front end |

## 6. Testing posture

Unchanged house style: plain `node *.test.mjs` with `check()`, no framework, no
build step; `tsc --noEmit` continues to type the boundary. Manifests being pure
data makes them trivially unit-testable (a `validateManifest` test per contract
rule), and the Library/unlocks service is storage-injectable like every other
meta module.

## 7. Resume here

1. Get the user's nod on **Approach A** (§1) — the only outstanding packaging
   question.
2. Walk §3, §4, §5 as three review sections, one at a time, revising each.
3. Re-run the spec self-review, get written-spec approval.
4. Then — and only then — invoke `superpowers:writing-plans` for **P11.1**.

**Nothing may be implemented before step 3 completes.**
