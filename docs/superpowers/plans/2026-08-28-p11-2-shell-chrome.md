# P11.2 — Shell Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move pause/quit, the first-play briefing, the run summary, the control
legend, pointer routing and crash containment out of individual minigames and
into the Core, so every future minigame gets consistent chrome for free and
`main.js` stops knowing what a match-3 tile is.

**Architecture:** A new `src/core/chrome.js` owns a four-phase state machine
(`briefing → play → paused → summary`) plus its rendering, as pure functions over
`(ctx, state, manifest, host)`. `Core` drives it for **stack-pushed** minigames
only (stack depth > 1 — today just `match3`); the base mode (`legacy`) keeps its
own pause/help/game-over until P11.5 splits it. When chrome's phase is not
`play`, the minigame is simply not ticked — that *is* the pause. `main.js` routes
pointers generically through `core.onPointerDown/Up`, and the match-3 gesture
recogniser moves into the match-3 module.

**Tech Stack:** Plain ES modules loaded untransformed by the browser (no build
step), Canvas 2D, plain-Node `*.test.mjs` scripts, `tsc --noEmit` over
`// @ts-check` files.

**Spec:** `docs/superpowers/specs/2026-08-25-minigame-platform-contract-design.md`
(§5 "Shell-owned chrome"; the seven P11.2 decisions are restated under
"Locked decisions" below and were approved 2026-08-28).

## Global Constraints

- **No build step.** The browser loads `src/**/*.js` as written. Do not add a
  bundler, a transpiler, or any npm runtime dependency.
- **Two incompatible `check()` signatures exist in this suite.** Name-first
  `check(name, cond)` (~50 files) and cond-first `check(cond, msg)` (~23).
  Mixing them silently always-passes. **Read the top of any file you edit and
  copy the style already there.** All NEW test files in this plan use
  name-first: `const check = (name, cond) => cond ? passed++ : (failed++, console.error(\`  FAIL: ${name}\`));`
- Every test file ends by printing its own summary line, e.g.
  `` console.log(`ok chrome.test.mjs (${passed} checks)`) ``, and exits non-zero on failure.
- **New files under `src/core/` start with `// @ts-check`** on line 1.
  `npm run typecheck` must exit 0.
- **Never cache `W`/`H` at import time.** Read `host.viewport.W/H` (or `WORLD.W/H`)
  at call time — `setViewport` reassigns them on every resize/rotate.
- **Persistence keys are frozen.** Do not rename `deepdescent.badges.v1`,
  `deepdescent.stats.v1`, `deepdescent.salvage.v2`, `deepdescent.progress.v1`,
  `deepdescent.controls`. This plan adds exactly one new key:
  `deepdescent.briefed.v1`.
- **Registered minigame ids are `legacy` and `match3`.** `reef`, `stage` and
  `whirlpool` are internal zones of `legacy`, not registered minigames.
- Run one test with `node tests/<path>.test.mjs`; run all with
  `for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done`.
  The suite is 91 files and green at the start of this plan.

## Locked decisions (approved 2026-08-28 — do not re-litigate)

1. **Chrome applies to stack-pushed minigames only.** `legacy` keeps its own
   `PAUSED` overlay, help screen and game-over until P11.5. Both paths render
   through `render/chrome.js` so they look identical.
2. **Briefing on first play only**, any entry kind, persisted under
   `deepdescent.briefed.v1`; reachable on demand from the pause overlay
   afterwards. This replaces match-3's hand-rolled `intro` phase, which is deleted.
3. **Summary at run end only.** Match-3's per-level won/lost screens stay
   minigame-owned — they are gameplay, not chrome.
4. **Failure isolation catches, closes and toasts; `new Core({ strict: true })`
   rethrows instead.** New tests pass `strict: true` unless they are specifically
   testing the catching path.
5. **The match-3 pointer plumbing moves into `match3/index.js`** as
   `onPointerDown/onPointerUp`. No speculative shared gesture helper.
6. **Core owns the back/pause edge** (Esc / Start / ✕) — no minigame implements
   quit again. `Input` gains one `confirmEdge()` so the consumeStart gotcha
   cannot recur.
7. **The legend renders on the briefing and pause overlays only** — no permanent
   strip over the board.

## File structure

| File | Responsibility |
|---|---|
| `src/core/chrome.js` **(new)** | Chrome phase machine + briefed ledger + overlay rendering. Knows manifests, not gameplay. |
| `src/core/core.js` (modify) | Drives chrome for pushed modes; `_safe()` crash containment; `onPointerDown/Up` entry points; `close()` → exit → credit → summary → pop. |
| `src/core/contract.js` (modify) | Typedefs for the new optional hooks `pause/resume/onPointerDown/onPointerUp`. |
| `src/controls.js` (modify) | Owns `CONTROLS_KEY` load/save (moved out of `game.js`) and builds legend lines from `controls.actions`. |
| `src/input.js` (modify) | `confirmEdge()` / `backEdge()` — the one place the gamepad edges are OR'd. |
| `src/game.js` (modify) | Uses `controls.js`'s `loadScheme/saveScheme` instead of its private key. |
| `src/minigames/match3/index.js` (modify) | Loses `back` handling and the `intro` phase; gains `onPointerDown/Up` holding the gesture recogniser. |
| `src/render/match3.js` (modify) | Loses the ✕ button, `backHitTest`, and the hardcoded bottom hint line. |
| `src/main.js` (modify) | Generic pointer routing; ~60 lines of match-3 plumbing deleted. |
| `src/version.js` (modify) | `ENGINE_VERSION` → `1.2.0`, `BUILD` bumped. |
| `docs/platform/architecture.md` (modify) | Documents the chrome layer. |

New tests: `tests/core/legend.test.mjs`, `tests/core/failure-isolation.test.mjs`,
`tests/core/chrome.test.mjs`, `tests/core/chrome-flow.test.mjs`,
`tests/minigames/match3-pointer.test.mjs`.

---

### Task 1: One place for the input edges and the control legend

**Files:**
- Modify: `src/input.js` (near `consumeStart()`, line ~208)
- Modify: `src/controls.js`
- Modify: `src/game.js:19` (`CONTROLS_KEY`), `src/game.js:123`, `src/game.js:559`
- Test: `tests/core/legend.test.mjs` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `input.confirmEdge(): boolean` — the confirm edge from keyboard, on-screen
    button and gamepad A/Start, all consumed.
  - `input.backEdge(): boolean` — the quit/pause edge (Esc / `back` button / Start).
  - `controls.js`: `export const CONTROLS_KEY = 'deepdescent.controls'`,
    `loadScheme(): string`, `saveScheme(s: string): void`,
    `legendLines(scheme, actions, isTouch): string[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/legend.test.mjs`:

```js
// The control legend is built from a manifest's controls.actions, per scheme.
// The shell renders these lines on the briefing + pause overlays (P11.2) — the
// manifest is the only source, so a minigame can never disagree with its legend.
import { legendLines, loadScheme, saveScheme, CONTROLS_KEY } from '../../src/controls.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const actions = [
  { id: 'cursor', label: 'Move cursor', keys: ['Arrows'],         pad: 'D-pad', touch: 'drag' },
  { id: 'swap',   label: 'Swap tiles',  keys: ['Space', 'Enter'], pad: 'A',     touch: 'tap two tiles' },
];

const kb = legendLines('keyboard', actions, false);
check('one line per action', kb.length === 2);
check('keyboard joins multiple keys', kb[1] === 'Swap tiles — Space / Enter');
check('pad schemes use the pad label', legendLines('rog', actions, false)[1] === 'Swap tiles — A');
check('steamdeck shares the pad vocabulary', legendLines('steamdeck', actions, false)[0] === 'Move cursor — D-pad');
check('touch devices use the touch label', legendLines('keyboard', actions, true)[0] === 'Move cursor — drag');
check('an action with no touch label falls back to its scheme label',
  legendLines('keyboard', [{ id: 'x', label: 'Fire', keys: ['F'] }], true)[0] === 'Fire — F');
check('missing actions yield no lines', legendLines('keyboard', undefined, false).length === 0);

// Scheme persistence moved out of game.js so the Core chrome and the shell read
// one source. Storage is injectable so this runs headless.
const store = {};
const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
check('the scheme key is unchanged', CONTROLS_KEY === 'deepdescent.controls');
check('an unset scheme loads as keyboard', loadScheme(storage) === 'keyboard');
saveScheme('rog', storage);
check('a saved scheme round-trips', loadScheme(storage) === 'rog');
store[CONTROLS_KEY] = 'not-a-scheme';
check('an unknown stored scheme falls back to keyboard', loadScheme(storage) === 'keyboard');

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok legend.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/core/legend.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../../src/controls.js' does not provide an export named 'CONTROLS_KEY'`.

- [ ] **Step 3: Add the exports to `src/controls.js`**

Append to `src/controls.js`:

```js
// The chosen scheme is persisted here (moved out of game.js in P11.2) so the
// shell AND the Core chrome read one source. Storage is injectable for tests;
// the browser default is localStorage, guarded for private mode.
export const CONTROLS_KEY = 'deepdescent.controls';

export function loadScheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    const s = storage && storage.getItem(CONTROLS_KEY);
    return SCHEMES.includes(s) ? s : 'keyboard';
  } catch (e) { return 'keyboard'; }
}

export function saveScheme(s, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try { if (storage && SCHEMES.includes(s)) storage.setItem(CONTROLS_KEY, s); } catch (e) { /* private mode */ }
}

// One legend line per declared action, labelled for the player's scheme:
// touch devices get the `touch` phrasing, pad schemes the `pad` button, and
// everything else the keyboard bindings. Source: a manifest's controls.actions.
export function legendLines(scheme, actions, isTouch = false) {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => {
    const keys = Array.isArray(a.keys) ? a.keys.join(' / ') : (a.keys || '');
    const pad = isPadScheme(scheme) ? a.pad : keys;
    const label = (isTouch && a.touch) || pad || keys;
    return `${a.label} — ${label}`;
  });
}
```

- [ ] **Step 4: Add the edge helpers to `src/input.js`**

Next to `consumeStart()` (~line 208):

```js
  // The ONE place the confirm edge is assembled. Every source is read (never
  // short-circuited) so no stale edge is left armed for the next frame — and so
  // a minigame author cannot forget consumeStart(), which has been missed twice.
  confirmEdge() {
    const key = this.pressed('confirm');
    const btn = this.consumeButton('confirm');
    const pad = this.consumeStart();
    return key || btn || pad;
  }

  // The quit/pause edge. Owned by the Core for pushed minigames (P11.2): Esc,
  // the on-screen back button, or Start on a handheld.
  backEdge() {
    const key = this.pressed('back');
    const btn = this.consumeButton('back');
    const pause = this.pressed('pause');
    return key || btn || pause;
  }
```

- [ ] **Step 5: Point `game.js` at the shared scheme storage**

In `src/game.js`: delete the private `const CONTROLS_KEY = 'deepdescent.controls';`
(line 19) and import instead:

```js
import { SCHEMES, SCHEME_LABEL, isPadScheme, nextScheme, prevScheme, controlsHelpLines, hintStrip, stageHintStrip, loadScheme, saveScheme } from './controls.js';
```

(keep whatever that import line already lists; add `loadScheme, saveScheme`).
Replace the line-123 block:

```js
    const savedScheme = localStorage.getItem(CONTROLS_KEY);
    this.controlScheme = SCHEMES.includes(savedScheme) ? savedScheme : 'keyboard';
    this._schemeManual = !!savedScheme;
```

with:

```js
    this.controlScheme = loadScheme();
    this._schemeManual = this.controlScheme !== 'keyboard' || !!(typeof localStorage !== 'undefined' && localStorage.getItem(CONTROLS_KEY));
```

and the line-559 save with `saveScheme(s);`.

- [ ] **Step 6: Run the new test and the suites that touch controls**

Run: `node tests/core/legend.test.mjs && node tests/game/controls.test.mjs && node tests/minigames/reef-seam.test.mjs && npm run typecheck`
Expected: all PASS, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/input.js src/controls.js src/game.js tests/core/legend.test.mjs
git commit -m "feat(p11-2): one source for the control scheme, legend lines and input edges"
```

---

### Task 2: Crash containment in the Core

**Files:**
- Modify: `src/core/core.js`, `src/core/contract.js`
- Test: `tests/core/failure-isolation.test.mjs` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `new Core({ host, creditResult, strict })` — `strict: true` rethrows instead
    of containing.
  - `core._safe(fn): any` — runs `fn`, contains a throw (pops the mode, sets
    `core.errorToast = { text: string, t: 0 }`), returns `undefined` on failure.
  - `core.errorToast: {text: string, t: number} | null`.
- Contract: `MiniGame.pause?()`, `MiniGame.resume?()`,
  `MiniGame.onPointerDown?(p)`, `MiniGame.onPointerUp?(p)` where
  `p = { x: number, y: number }` in logical units.

- [ ] **Step 1: Write the failing test**

Create `tests/core/failure-isolation.test.mjs`:

```js
// A throwing minigame must not kill the shell: the Core contains it, pops the
// mode, and leaves an error toast on the mode beneath (spec §5.5). `strict`
// turns containment off so a real regression still fails the suite loudly —
// every other new test in P11.2 runs strict.
import { Core } from '../../src/core/core.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const quietErrors = () => { const orig = console.error; console.error = () => {}; return () => { console.error = orig; }; };

const base = { id: 'base', enter() {}, update() {}, render() {} };
const boom = { id: 'boom', enter() {}, update() { throw new Error('kaboom'); }, render() {} };

const core = new Core({ host: {}, creditResult() {} });
core.register(base).register(boom);
core.boot('base');
core.open('boom');
core.update(0);                      // applies the open
const restore = quietErrors();
core.update(0);                      // boom.update throws
restore();
check('a throwing minigame is popped, not propagated', core.activeId() === 'base');
check('the mode beneath is left an error toast', !!core.errorToast && typeof core.errorToast.text === 'string');
check('the shell keeps running afterwards', (core.update(0), core.activeId() === 'base'));

// A throw in enter() is contained the same way.
const badEnter = { id: 'bad', enter() { throw new Error('enter'); }, update() {}, render() {} };
core.register(badEnter);
core.errorToast = null;
core.open('bad');
const restore2 = quietErrors();
core.update(0);
restore2();
check('a throw in enter() pops the mode too', core.activeId() === 'base');
check('a throw in enter() toasts too', !!core.errorToast);

// strict mode rethrows so tests and development see the real stack.
const strict = new Core({ host: {}, creditResult() {}, strict: true });
strict.register(base).register(boom);
strict.boot('base');
strict.open('boom');
strict.update(0);
let threw = false;
try { strict.update(0); } catch (e) { threw = e.message === 'kaboom'; }
check('strict Cores rethrow the original error', threw);
check('strict Cores do not swallow the mode', strict.activeId() === 'boom');

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok failure-isolation.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/core/failure-isolation.test.mjs`
Expected: FAIL — the uncaught `kaboom` escapes `core.update(0)` and the process exits non-zero before the first check.

- [ ] **Step 3: Implement containment in `src/core/core.js`**

In the constructor, accept and store the flag:

```js
  constructor({ host, creditResult, strict = false } = {}) {
    this.host = host;
    this.strict = strict;
    /** @type {{text: string, t: number}|null} set when a minigame threw */
    this.errorToast = null;
```

Add the wrapper (place it next to `creditResult`):

```js
  /**
   * Run a minigame callback with crash containment (spec §5.5): a throwing
   * minigame closes and returns to the mode beneath with an error toast rather
   * than killing the shell. `strict` Cores rethrow instead — tests run strict so
   * a real regression fails loudly rather than reading as "closed with an error".
   * @param {() => any} fn
   */
  _safe(fn) {
    if (this.strict) return fn();
    try { return fn(); }
    catch (e) {
      console.error('[Core] minigame error — closing it:', e);
      if (this._stack.length > 1) this._stack.pop();
      this.errorToast = { text: 'That minigame hit an error and closed.', t: 0 };
      return undefined;
    }
  }
```

Route the lifecycle calls through it — in `_applyPending`'s open branch,
`update`, `render`, and `exitActive`:

```js
      this._stack.push(mg);
      this._safe(() => mg.enter(this._hostFor(mg.id), p.ctx));
```

```js
  update(dt) {
    this._applyPending();
    const a = this.active;
    if (a) this._safe(() => a.update(dt));
  }

  render(ctx) {
    const a = this.active;
    if (a) this._safe(() => a.render(ctx));
  }
```

- [ ] **Step 4: Document the new optional hooks in `src/core/contract.js`**

Add to the `MiniGame` typedef:

```js
 * @property {() => void} [pause]    Called when the shell pauses the mode (duck audio, stop timers). Optional.
 * @property {() => void} [resume]   Called when the shell resumes it. Optional.
 * @property {(p: {x: number, y: number}) => void} [onPointerDown] Logical-unit pointer press,
 *                                        routed by the shell when the manifest declares controls.pointer.
 * @property {(p: {x: number, y: number}) => void} [onPointerUp]   Logical-unit pointer release.
```

- [ ] **Step 5: Run the test and the whole suite**

Run: `node tests/core/failure-isolation.test.mjs && for f in $(find tests -name "*.test.mjs"); do node "$f" >/dev/null || echo "FAIL $f"; done && npm run typecheck`
Expected: the new test PASSes, no `FAIL` lines, typecheck 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/core.js src/core/contract.js tests/core/failure-isolation.test.mjs
git commit -m "feat(p11-2): contain a throwing minigame instead of killing the shell"
```

---

### Task 3: `src/core/chrome.js` — the phase machine

**Files:**
- Create: `src/core/chrome.js`
- Test: `tests/core/chrome.test.mjs` (create)

**Interfaces:**
- Consumes: `legendLines`, `loadScheme` from Task 1.
- Produces: `makeChrome({ storage }) -> chrome` with
  - `chrome.phase: 'briefing' | 'play' | 'paused' | 'summary'`
  - `chrome.begin(manifest): void` — `'briefing'` on first play (and marks it
    briefed), `'play'` afterwards
  - `chrome.step(input, isTouch): 'pause' | 'resume' | 'pop' | null` — the action
    the caller must perform (`'quit'` arrives via `hit()`, not `step()`)
  - `chrome.hit(p, host): 'resume' | 'quit' | 'pop' | 'dismiss' | null`
  - `chrome.summarize(result): void`
  - `chrome.render(ctx, host): void`
  - `chrome.quitRect(host): {x,y,w,h}`
  - `export const BRIEFED_KEY = 'deepdescent.briefed.v1'`

- [ ] **Step 1: Write the failing test**

Create `tests/core/chrome.test.mjs`:

```js
// The shell chrome phase machine (P11.2), unit-tested without a Core: briefing
// on first play only, pause/resume, quit, summary. Rendering is exercised
// separately through a stub ctx — here we pin the STATE transitions, because
// that is what every minigame's lifecycle now depends on.
import { makeChrome, BRIEFED_KEY } from '../../src/core/chrome.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const store = {};
const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const manifest = {
  id: 'demo', name: 'Demo', icon: '🎲', blurb: 'A demo.',
  controls: { pointer: true, actions: [{ id: 'go', label: 'Go', keys: ['Space'], pad: 'A', touch: 'tap' }] },
  help: [{ title: 'HOW TO PLAY', lines: ['Do the thing.'] }],
};
const mkInput = (edges = {}) => ({
  confirmEdge: () => !!edges.confirm, backEdge: () => !!edges.back,
  pressed: () => false, consumeButton: () => false, consumeStart: () => false,
  poll() {}, endFrame() {}, isTouch: false,
});
const host = { viewport: { W: 900, H: 600 } };

const chrome = makeChrome({ storage });
chrome.begin(manifest);
check('a first-ever launch briefs the player', chrome.phase === 'briefing');
check('the briefing is recorded under the new key', (storage.getItem(BRIEFED_KEY) || '').includes('demo'));
check('the briefing key is namespaced and versioned', BRIEFED_KEY === 'deepdescent.briefed.v1');

check('confirm dismisses the briefing into play', (chrome.step(mkInput({ confirm: true }), false), chrome.phase === 'play'));
check('nothing happens during play without an edge', (chrome.step(mkInput(), false), chrome.phase === 'play'));
check('the back edge pauses rather than quitting outright',
  (chrome.step(mkInput({ back: true }), false), chrome.phase === 'paused'));
check('pausing asks the caller to pause the minigame', chrome.lastAction === 'pause');
check('confirm resumes from pause', (chrome.step(mkInput({ confirm: true }), false) === 'resume' && chrome.phase === 'play'));

// A second launch skips the briefing — the ledger persisted.
const chrome2 = makeChrome({ storage });
chrome2.begin(manifest);
check('a second launch goes straight to play', chrome2.phase === 'play');

// Quitting from the pause overlay: the caller is told to end the run.
chrome2.step(mkInput({ back: true }), false);
check('back pauses on the second launch too', chrome2.phase === 'paused');
const q = chrome2.hit({ x: chrome2.quitRect(host).x + 2, y: chrome2.quitRect(host).y + 2 }, host);
check('tapping ✕ on the pause overlay asks to quit', q === 'quit');

// The summary holds the result until dismissed, then asks to pop.
chrome2.summarize({ outcome: 'won', salvage: 120, achievements: ['demo:first'] });
check('summarize enters the summary phase', chrome2.phase === 'summary');
check('the summary keeps the result for rendering', chrome2.result && chrome2.result.salvage === 120);
check('confirm on the summary asks the caller to pop', chrome2.step(mkInput({ confirm: true }), false) === 'pop');

// The ✕ is live during play too — it is the only quit route on touch.
const chrome3 = makeChrome({ storage });
chrome3.begin(manifest);
check('✕ during play asks to quit', chrome3.hit({ x: chrome3.quitRect(host).x + 2, y: chrome3.quitRect(host).y + 2 }, host) === 'quit');
check('a pointer that misses the chrome is not consumed', chrome3.hit({ x: 10, y: 400 }, host) === null);

// Rendering must not throw against a stub 2D context in any phase.
const stubCtx = new Proxy({}, { get: (t, p) => {
  if (p === 'canvas') return { width: 900, height: 600 };
  if (p === 'measureText') return () => ({ width: 10 });
  return () => {};
} });
let rendered = true;
for (const phase of ['briefing', 'play', 'paused', 'summary']) {
  chrome3.phase = phase; chrome3.result = { outcome: 'won', salvage: 1 };
  try { chrome3.render(stubCtx, host); } catch (e) { rendered = false; console.error(`  render threw in ${phase}:`, e.message); }
}
check('every phase renders without throwing', rendered);

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok chrome.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/core/chrome.test.mjs`
Expected: FAIL — `Cannot find module .../src/core/chrome.js`.

- [ ] **Step 3: Implement `src/core/chrome.js`**

```js
// @ts-check
// Shell chrome for stack-pushed MiniGames (Platform Phase 11.2). The Core owns
// the briefing, the pause overlay, the quit route and the run summary so every
// minigame gets them identically and none re-implements them (spec §5).
//
// Scope: pushed modes only. The base mode (`legacy`) keeps its own PAUSED
// overlay / help / game-over until P11.5 splits it — both draw through
// render/chrome.js, so they look like one game.
//
// This module holds NO gameplay and never ticks a minigame: while `phase` is not
// 'play' the Core simply does not call update(), and that IS the pause.

import { panel, text, overlay } from '../render/chrome.js';
import { legendLines, loadScheme } from '../controls.js';
import { PAL } from '../config.js';

/** First-play briefing ledger. Deliberately separate from P11.3's discovery
 *  ledger: "has seen the instructions" and "has unlocked this" are different
 *  facts, so P11.3 migrates nothing. */
export const BRIEFED_KEY = 'deepdescent.briefed.v1';

const defaultStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

function loadBriefed(storage) {
  try {
    const raw = storage && storage.getItem(BRIEFED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
}

function saveBriefed(storage, set) {
  try { storage && storage.setItem(BRIEFED_KEY, JSON.stringify([...set])); } catch (e) { /* private mode */ }
}

/**
 * @param {{storage?: any}} [opts]
 */
export function makeChrome({ storage = defaultStorage() } = {}) {
  return {
    /** @type {'briefing'|'play'|'paused'|'summary'} */
    phase: 'play',
    /** @type {any} */ manifest: null,
    /** @type {any} */ result: null,
    /** @type {string|null} the side-effect the last step() asked for, for tests */
    lastAction: null,

    /** Arm the chrome for a freshly-entered minigame. */
    begin(manifest) {
      this.manifest = manifest || null;
      this.result = null;
      this.lastAction = null;
      const id = manifest && manifest.id;
      const seen = loadBriefed(storage);
      if (id && !seen.has(id)) {
        seen.add(id); saveBriefed(storage, seen);
        this.phase = 'briefing';
      } else {
        this.phase = 'play';
      }
    },

    /** Show the run summary and hold it until the player dismisses it. */
    summarize(result) { this.result = result || null; this.phase = 'summary'; },

    /**
     * Read this frame's edges. Returns the action the CALLER must perform:
     * 'resume' (tell the minigame), 'quit' (end the run), 'pop' (dismiss the
     * summary), or null. Phase changes happen here; side effects do not.
     * @param {*} input
     * @param {boolean} isTouch
     */
    step(input, isTouch) {
      const confirm = input.confirmEdge ? input.confirmEdge() : false;
      const back = input.backEdge ? input.backEdge() : false;
      this.lastAction = null;
      if (this.phase === 'briefing') {
        if (confirm || back) this.phase = 'play';
        return null;
      }
      if (this.phase === 'play') {
        if (back) { this.phase = 'paused'; this.lastAction = 'pause'; return 'pause'; }
        return null;
      }
      if (this.phase === 'paused') {
        if (confirm || back) { this.phase = 'play'; this.lastAction = 'resume'; return 'resume'; }
        return null;
      }
      if (this.phase === 'summary' && confirm) return 'pop';
      return null;
    },

    /** Top-right ✕ — the only quit route on touch. Geometry moved verbatim from
     *  render/match3.js so the button does not shift under existing players. */
    quitRect(host) {
      const W = host.viewport.W;
      return { x: W - 44, y: 16, w: 28, h: 28 };
    },

    /**
     * Hit-test a logical-unit pointer against the chrome. Returns the caller's
     * action, or null when the pointer belongs to the minigame.
     * @param {{x:number,y:number}} p
     */
    hit(p, host) {
      const q = this.quitRect(host);
      const onQuit = p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h;
      if (this.phase === 'summary') return 'pop';
      if (this.phase === 'briefing') { this.phase = 'play'; return 'dismiss'; }
      if (onQuit) {
        if (this.phase === 'paused') return 'quit';
        this.phase = 'paused'; this.lastAction = 'pause'; return 'quit';
      }
      if (this.phase === 'paused') { this.phase = 'play'; this.lastAction = 'resume'; return 'resume'; }
      return null;
    },

    /** Draw whatever overlay the current phase calls for, over the minigame's
     *  own frame (the Core renders the mode first). */
    render(ctx, host) {
      const W = host.viewport.W, H = host.viewport.H;
      const man = this.manifest || {};
      const isTouch = !!(host.input && host.input.isTouch);
      // The ✕ is always live so touch players can always bail out.
      const q = this.quitRect(host);
      ctx.save();
      ctx.fillStyle = 'rgba(12,32,52,0.75)'; ctx.strokeStyle = 'rgba(150,200,240,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, 6); ctx.fill(); ctx.stroke();
      ctx.restore();
      text(ctx, '✕', q.x + q.w / 2, q.y + q.h / 2 + 1, 18, PAL.hudText, 'center', 'middle', true);
      if (this.phase === 'play') return;

      if (this.phase === 'briefing') {
        panel(ctx, 0.72);
        text(ctx, `${man.icon || ''} ${man.name || ''}`.trim(), W / 2, H * 0.22, 34, PAL.hudText, 'center', 'middle', true);
        text(ctx, man.blurb || '', W / 2, H * 0.22 + 34, 15, '#bfe6ff', 'center', 'middle');
        let y = H * 0.36;
        for (const page of (man.help || [])) {
          text(ctx, page.title, W / 2, y, 15, '#7fd4ff', 'center', 'middle', true); y += 24;
          for (const line of page.lines || []) { text(ctx, line, W / 2, y, 13, '#cfe8ff', 'center', 'middle'); y += 20; }
          y += 8;
        }
        y += 6;
        for (const line of legendLines(loadScheme(), man.controls && man.controls.actions, isTouch)) {
          text(ctx, line, W / 2, y, 13, '#9fc6e0', 'center', 'middle'); y += 19;
        }
        text(ctx, isTouch ? 'Tap to begin' : 'Press Space to begin', W / 2, H - 40, 14, PAL.hudText, 'center', 'middle', true);
        return;
      }

      if (this.phase === 'paused') {
        overlay(ctx, 'PAUSED', isTouch ? 'Tap to resume  ·  ✕ to quit' : 'Space to resume  ·  Esc / ✕ to quit');
        let y = H / 2 + 66;
        for (const line of legendLines(loadScheme(), man.controls && man.controls.actions, isTouch)) {
          text(ctx, line, W / 2, y, 13, '#9fc6e0', 'center', 'middle'); y += 19;
        }
        return;
      }

      // summary
      const r = this.result || {};
      panel(ctx, 0.72);
      const title = r.outcome === 'won' ? 'RUN COMPLETE' : 'RUN OVER';
      text(ctx, title, W / 2, H * 0.32, 40, PAL.hudText, 'center', 'middle', true);
      text(ctx, `${man.icon || ''} ${man.name || ''}`.trim(), W / 2, H * 0.32 + 34, 15, '#bfe6ff', 'center', 'middle');
      let y = H * 0.5;
      if (r.salvage) { text(ctx, `Salvage banked — ${r.salvage}`, W / 2, y, 16, '#ffe08a', 'center', 'middle', true); y += 26; }
      if (typeof r.score === 'number') { text(ctx, `Score — ${r.score}`, W / 2, y, 14, '#cfe8ff', 'center', 'middle'); y += 24; }
      for (const id of (r.achievements || [])) { text(ctx, `🏅 ${id}`, W / 2, y, 13, '#9fe8c0', 'center', 'middle'); y += 19; }
      text(ctx, isTouch ? 'Tap to continue' : 'Space to continue', W / 2, H - 40, 14, PAL.hudText, 'center', 'middle', true);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node tests/core/chrome.test.mjs && npm run typecheck`
Expected: PASS, typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/chrome.js tests/core/chrome.test.mjs
git commit -m "feat(p11-2): shell chrome phase machine — briefing, pause, quit, summary"
```

---

### Task 4: Drive the chrome from the Core

**Files:**
- Modify: `src/core/core.js`
- Test: `tests/core/chrome-flow.test.mjs` (create)

**Interfaces:**
- Consumes: `makeChrome` (Task 3), `_safe` (Task 2).
- Produces:
  - `core.chrome` — the chrome instance, armed on every push (depth > 1).
  - `core.onPointerDown(p): boolean` / `core.onPointerUp(p): boolean` — true when
    the Core handled the pointer (chrome or minigame), false when the caller
    should fall back to its own routing (base mode).
  - `close(result)` now means "end my run": Core calls `exit()`, credits once,
    then shows the summary and pops only when the player dismisses it.

- [ ] **Step 1: Write the failing test**

Create `tests/core/chrome-flow.test.mjs`:

```js
// The Core drives the chrome for stack-PUSHED minigames only (spec §5,
// decision 1): the base mode is untouched. This pins the whole lifecycle —
// push → briefing (not ticked) → play → pause (not ticked) → resume → quit →
// exit+credit once → summary (still on the stack) → pop.
import { Core } from '../../src/core/core.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const store = {};
const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const edges = { confirm: false, back: false };
const input = {
  confirmEdge: () => { const v = edges.confirm; edges.confirm = false; return v; },
  backEdge: () => { const v = edges.back; edges.back = false; return v; },
  isTouch: false, poll() {}, endFrame() {},
};
const host = { input, viewport: { W: 900, H: 600 } };

const manifest = {
  id: 'demo', contract: 1, name: 'Demo', version: '1.0.0', icon: '🎲', blurb: 'A demo.',
  capabilities: [], entries: [{ id: 'menu', kind: 'menu', label: 'Play Demo', alwaysAvailable: true }],
  controls: { pointer: true, actions: [{ id: 'go', label: 'Go', keys: ['Space'], pad: 'A', touch: 'tap' }] },
  help: [{ title: 'HOW TO PLAY', lines: ['Do the thing.'] }],
  goals: {}, module: () => Promise.resolve({}),
};

const log = [];
const base = { id: 'base', enter() {}, update() { log.push('base.update'); }, render() {} };
const demo = {
  id: 'demo', ticks: 0, exits: 0, pointers: 0,
  enter() {}, update() { this.ticks++; }, render() {},
  pause() { log.push('demo.pause'); }, resume() { log.push('demo.resume'); },
  onPointerDown() { this.pointers++; },
  exit() { this.exits++; return { outcome: 'won', salvage: 40 }; },
};

const credited = [];
const core = new Core({ host, strict: true, creditResult: (r) => credited.push(r) });
core.chromeStorage = storage;                     // injected before the first push
core.register(base).register(demo, manifest);
core.boot('base');
check('the base mode has no chrome', core.chrome === null || core.chrome.phase === 'play');
core.update(0); check('the base mode ticks normally', log.includes('base.update'));

core.open('demo');
core.update(0);                                   // applies the open, arms the chrome
check('a first push opens on the briefing', core.chrome.phase === 'briefing');
check('a briefing does NOT tick the minigame', demo.ticks === 0);

edges.confirm = true; core.update(0);
check('confirm starts play', core.chrome.phase === 'play');
core.update(0); check('play ticks the minigame', demo.ticks === 1);

edges.back = true; core.update(0);
check('the back edge pauses', core.chrome.phase === 'paused');
check('pausing calls the minigame pause hook', log.includes('demo.pause'));
core.update(0); check('a paused minigame is not ticked', demo.ticks === 1);

edges.confirm = true; core.update(0);
check('confirm resumes', core.chrome.phase === 'play');
check('resuming calls the resume hook', log.includes('demo.resume'));

// A pointer during play reaches the minigame (its manifest declares pointer:true).
core.onPointerDown({ x: 100, y: 300 });
check('a play-phase pointer reaches the minigame', demo.pointers === 1);
core.chrome.phase = 'paused';
core.onPointerDown({ x: 100, y: 300 });
check('a paused pointer is swallowed by the chrome', demo.pointers === 1);
core.chrome.phase = 'play';

// Quitting: exit + credit exactly once, then the summary — still on the stack.
core.onPointerDown({ x: 900 - 44 + 2, y: 18 });   // the ✕
core.update(0);
check('quitting called exit() once', demo.exits === 1);
check('the result was credited once', credited.length === 1 && credited[0].salvage === 40);
check('the summary phase holds the mode on the stack', core.chrome.phase === 'summary' && core.activeId() === 'demo');
const ticksAtSummary = demo.ticks;
core.update(0);
check('a summarised minigame is not ticked', demo.ticks === ticksAtSummary);

edges.confirm = true; core.update(0);
check('dismissing the summary pops back to the base mode', core.activeId() === 'base');
check('exit() was not called a second time on the pop', demo.exits === 1);

// Second launch: briefed already, so straight into play.
core.open('demo'); core.update(0);
check('a second launch skips the briefing', core.chrome.phase === 'play');

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok chrome-flow.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/core/chrome-flow.test.mjs`
Expected: FAIL — `core.chrome` is undefined, so the first briefing check throws/fails.

- [ ] **Step 3: Wire the chrome into `src/core/core.js`**

Import and initialise:

```js
import { makeChrome } from './chrome.js';
```

In the constructor, after `this._pending = null;`:

```js
    /** @type {*} chrome for the pushed mode; null while only the base is live */
    this.chrome = null;
    /** Storage for the chrome's briefed ledger (injectable for tests). */
    this.chromeStorage = undefined;
```

In `_applyPending`'s open branch, after the contained `enter`:

```js
      this.chrome = makeChrome(this.chromeStorage ? { storage: this.chromeStorage } : {});
      this.chrome.begin(this.manifestFor(mg.id));
```

Replace the close branch so `close()` means "end my run":

```js
    } else if (p.op === 'close') {
      if (this._stack.length <= 1) return;          // never pop the base
      this._endRun(p.result);
    }
```

Add the run-end and pop helpers:

```js
  /** End the pushed mode's run: exit() once, credit once, then hold the frozen
   *  mode on the stack behind the summary until the player dismisses it. */
  _endRun(fallbackResult) {
    const mg = this.active;
    if (!mg || this._stack.length <= 1) return;
    const result = mg.exit ? this._safe(() => mg.exit()) : fallbackResult;
    if (result) this.creditResult(result);
    if (this.chrome) this.chrome.summarize(result);
    else this._stack.pop();
  }

  /** Dismiss the summary: drop the mode and its chrome. */
  _popPushed() {
    if (this._stack.length > 1) this._stack.pop();
    this.chrome = null;
  }

  /** Perform whatever the chrome asked for. */
  _applyChromeAction(action) {
    const mg = this.active;
    if (action === 'pause' && mg && mg.pause) this._safe(() => mg.pause());
    else if (action === 'resume' && mg && mg.resume) this._safe(() => mg.resume());
    else if (action === 'quit') this._endRun();
    else if (action === 'pop') this._popPushed();
  }
```

Drive it from `update` — the chrome runs BEFORE the mode, and a non-`play`
phase means the mode is not ticked at all:

```js
  update(dt) {
    this._applyPending();
    const a = this.active;
    if (!a) return;
    if (this._stack.length > 1 && this.chrome) {
      const isTouch = !!(this.host && this.host.input && this.host.input.isTouch);
      const action = this.chrome.step((this.host && this.host.input) || {}, isTouch);
      if (action) this._applyChromeAction(action);
      if (!this.chrome || this.chrome.phase !== 'play') return;   // paused / briefing / summary
      if (this.active !== a) return;                              // the action changed the stack
    }
    this._safe(() => a.update(dt));
  }
```

and from `render` — the mode draws first, the overlay on top:

```js
  render(ctx) {
    const a = this.active;
    if (!a) return;
    this._safe(() => a.render(ctx));
    if (this._stack.length > 1 && this.chrome) this.chrome.render(ctx, this.host);
  }
```

Add the pointer entry points:

```js
  /**
   * Route a logical-unit pointer press. Chrome gets first refusal (✕, dismiss),
   * then the minigame — but only when its manifest declares controls.pointer.
   * Returns true when the Core consumed the pointer; false means the caller
   * (main.js) should fall back to its own routing for the base mode.
   * @param {{x:number,y:number}} p
   */
  onPointerDown(p) {
    if (this._stack.length <= 1 || !this.chrome) return false;
    const action = this.chrome.hit(p, this.host);
    if (action) { this._applyChromeAction(action === 'dismiss' ? null : action); return true; }
    if (this.chrome.phase !== 'play') return true;
    const mg = this.active;
    const man = this.manifestFor(mg.id);
    if (man && man.controls && man.controls.pointer && mg.onPointerDown) this._safe(() => mg.onPointerDown(p));
    return true;
  }

  /** @param {{x:number,y:number}} p */
  onPointerUp(p) {
    if (this._stack.length <= 1 || !this.chrome) return false;
    if (this.chrome.phase !== 'play') return true;
    const mg = this.active;
    const man = this.manifestFor(mg.id);
    if (man && man.controls && man.controls.pointer && mg.onPointerUp) this._safe(() => mg.onPointerUp(p));
    return true;
  }
```

Also clear the chrome in `_popPushed`'s sibling paths: in `_safe`'s catch, after
`this._stack.pop()`, add `this.chrome = null;`.

- [ ] **Step 4: Run the new test, then the whole suite**

Run: `node tests/core/chrome-flow.test.mjs && node tests/core/open-context.test.mjs && node tests/game/open-ctx-chain.test.mjs`
Expected: all PASS. `open-context` and `open-ctx-chain` prove the ctx path and
the P9 achievement fix still work through the new close semantics.

Then: `for f in $(find tests -name "*.test.mjs"); do node "$f" >/dev/null || echo "FAIL $f"; done && npm run typecheck`
Expected: no `FAIL` lines, typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/core.js tests/core/chrome-flow.test.mjs
git commit -m "feat(p11-2): Core drives briefing/pause/summary + pointer routing for pushed minigames"
```

---

### Task 5: Match-3 adopts the chrome

**Files:**
- Modify: `src/minigames/match3/index.js`, `src/render/match3.js`
- Test: `tests/minigames/match3-pointer.test.mjs` (create)

**Interfaces:**
- Consumes: `input.confirmEdge()` (Task 1), the chrome's ownership of quit (Task 4).
- Produces: `match3.onPointerDown({x,y})`, `match3.onPointerUp({x,y})`; the
  module no longer has an `intro` phase and never calls `host.close` for a quit.
- `render/match3.js` no longer exports `backHitTest`.

- [ ] **Step 1: Write the failing test**

Create `tests/minigames/match3-pointer.test.mjs`:

```js
// The match-3 gesture recogniser moved out of main.js and into the module
// (P11.2, decision 5): both gestures a player expects must still work — a
// Candy-Crush drag (press a tile, release on an adjacent one) and two taps.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

import { makeMatch3 } from '../../src/minigames/match3/index.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const host = {
  viewport: { W: 900, H: 600 },
  audio: new Proxy({}, { get: () => () => {} }),
  input: { isTouch: false, poll() {}, endFrame() {}, pressed: () => false, consumeButton: () => false, consumeStart: () => false, confirmEdge: () => false, backEdge: () => false },
  economy: { state: { salvage: 0 }, earn() {} },
  progression: { badges: {}, stats: {}, progress: {}, recordRun: () => ({ newBadges: [], freshTiers: [] }) },
  achievements: { unlock() {} },
};

const m = makeMatch3({ host });
m.enter(host, { source: 'chest' });
check('a launched run starts in play — the intro phase is gone', m.phase === 'play');
check('the module exposes the pointer hooks', typeof m.onPointerDown === 'function' && typeof m.onPointerUp === 'function');

// Centre of a cell, in logical units, using the module's own hit-test geometry.
import { cellRect } from '../../src/render/match3.js';
const centre = (r, c) => { const q = cellRect(m, host, r, c); return { x: q.x + q.w / 2, y: q.y + q.h / 2 }; };

// Two-tap: tap a tile, then an adjacent one → a swap is attempted.
let swaps = 0;
const realSwap = m.trySwap.bind(m);
m.trySwap = (...a) => { swaps++; return realSwap(...a); };
m.onPointerDown(centre(0, 0));
check('the first tap selects a tile', !!m.sel && m.sel.r === 0 && m.sel.c === 0);
m.onPointerUp(centre(0, 0));
check('releasing on the same tile leaves it selected (two-tap in progress)', !!m.sel);
m.onPointerDown(centre(0, 1));
check('an adjacent second tap attempts the swap', swaps === 1);
check('the selection clears after a swap attempt', m.sel === null);

// Drag: press a tile, release on an adjacent one → a swap is attempted.
m.onPointerDown(centre(2, 2));
m.onPointerUp(centre(2, 3));
check('a drag onto an adjacent tile attempts a swap', swaps === 2);

// A non-adjacent tap re-selects rather than swapping.
m.onPointerDown(centre(4, 0));
m.onPointerUp(centre(4, 0));
m.onPointerDown(centre(0, 4));
check('a distant tap re-selects instead of swapping', swaps === 2 && m.sel && m.sel.r === 0 && m.sel.c === 4);

// Tapping the selected tile again clears it.
m.onPointerUp(centre(0, 4));
m.onPointerDown(centre(0, 4));
check('tapping the selected tile clears the selection', m.sel === null);

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok match3-pointer.test.mjs (${passed} checks)`);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/minigames/match3-pointer.test.mjs`
Expected: FAIL — no `cellRect` export and no `onPointerDown` on the module.

- [ ] **Step 3: Export the cell geometry from `src/render/match3.js`**

`render/match3.js` already has a private `geom(mod, host)` returning
`{ cell, x0, y0, n }` (cell size, board origin, board width in cells) — the same
math `boardHitTest` inverts at line ~46. Export a cell rect built from it, so the
draw path, the hit-test and the tests share one geometry:

```js
/** The logical-unit rect of one board cell. Single source of geometry, shared
 *  by the draw path, the hit-test, and the module's pointer hooks. */
export function cellRect(mod, host, r, c) {
  const { cell, x0, y0 } = geom(mod, host);
  return { x: x0 + c * cell, y: y0 + r * cell, w: cell, h: cell };
}
```

Leave `boardHitTest` as it is — it already reads `geom` directly.

Then delete `quitRect`, `backHitTest`, the ✕ drawing block (lines ~582-588) and
the hardcoded bottom hint line (~579) — the Core chrome draws both now.

- [ ] **Step 4: Move the gesture recogniser into `src/minigames/match3/index.js`**

Import the hit-test and add the hooks (the state lives on the module, replacing
`m3sel`/`m3down` in `main.js`):

```js
import { drawMatch3, boardHitTest } from '../../render/match3.js';
```

```js
    // --- pointer (P11.2): the shell routes raw presses here because this
    // manifest declares controls.pointer. Both gestures a player expects: a
    // Candy-Crush drag (press a tile, release on an adjacent one) and two taps.
    _down: /** @type {any} */ (null),   // cell where the active press began

    _adjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; },

    onPointerDown(p) {
      if (this.phase !== 'play') { this._pointerAdvance(); this.sel = null; this._down = null; return; }
      const cell = boardHitTest(this, host, p.x, p.y);
      this._down = cell;
      if (!cell) { this.sel = null; return; }
      if (this.sel && this._adjacent(this.sel, cell)) { this.trySwap(this.sel.r, this.sel.c, cell.r, cell.c); this.sel = null; this._down = null; return; }
      if (this.sel && this.sel.r === cell.r && this.sel.c === cell.c) this.sel = null;
      else this.sel = cell;
    },

    onPointerUp(p) {
      const origin = this._down; this._down = null;
      if (!origin || this.phase !== 'play') return;
      const cell = boardHitTest(this, host, p.x, p.y);
      if (cell && (cell.r !== origin.r || cell.c !== origin.c) && this._adjacent(origin, cell)) {
        this.trySwap(origin.r, origin.c, cell.r, cell.c);
        this.sel = null;
      }
    },
```

- [ ] **Step 5: Delete the intro phase and the quit handling from `update()`**

- Change the initial state `phase: 'intro'` to `phase: 'play'`, and delete the
  `introT` field and the `if (this.phase === 'intro') …` branches in `update()`
  and `_pointerAdvance()`. The Core briefing replaces it.
- Replace the three-way confirm read and the whole `back` block with:

```js
      const confirm = input.confirmEdge();
      // NOTE: quit/pause is the Core's now (P11.2) — do not read a back edge here.
```

- Leave `exit()` exactly as it is: the Core calls it, credits once, and shows the
  summary. It must keep returning `credited: true` (salvage is credited per level
  during play).

- [ ] **Step 6: Run the tests**

Run: `node tests/minigames/match3-pointer.test.mjs && node tests/game/open-ctx-chain.test.mjs && node tests/core/chrome-flow.test.mjs`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/minigames/match3/index.js src/render/match3.js tests/minigames/match3-pointer.test.mjs
git commit -m "feat(p11-2): match-3 owns its pointer gestures, drops its intro + quit chrome"
```

---

### Task 6: Generic pointer routing in `main.js`

**Files:**
- Modify: `src/main.js`
- Test: `tests/core/capabilities.test.mjs` (extend the existing source-grep block at the bottom)

**Interfaces:**
- Consumes: `core.onPointerDown/Up` (Task 4).
- Produces: no new API — this task only deletes.

- [ ] **Step 1: Add the failing source assertions**

`main.js` boots a browser page on import, so a source-grep is the only way to
pin its wiring — the file already carries such a block. Append to
`tests/core/capabilities.test.mjs` (cond-first `check(cond, msg)` style — **copy
the signature already in that file**):

```js
// P11.2: pointer routing is generic. main.js must not hand-roll match-3 board
// gestures any more — the Core routes to the active minigame's hooks.
check(/core\.onPointerDown\(/.test(mainSrc), 'main.js routes pointers through core.onPointerDown');
check(/core\.onPointerUp\(/.test(mainSrc), 'main.js routes pointer releases through core.onPointerUp');
check(!/boardHitTest|backHitTest|m3adjacent|m3sel|m3down/.test(mainSrc),
  'main.js holds no match-3 board plumbing');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/core/capabilities.test.mjs`
Expected: FAIL on `main.js routes pointers through core.onPointerDown`.

- [ ] **Step 3: Rewrite the pointer wiring in `src/main.js`**

Delete the `boardHitTest, backHitTest` import, `m3sel`, `m3down`, `m3adjacent`,
`m3PointerDown` and `m3PointerUp` (~60 lines), and replace the four listeners'
match-3 branches with generic routing:

```js
canvas.addEventListener('mousedown', (e) => {
  audio.ensure(); audio.resume();
  // A pushed minigame (and its chrome) owns the pointer: the Core hit-tests its
  // own overlay first, then forwards to the minigame when its manifest declares
  // controls.pointer. Returns false for the base mode, which keeps its own path.
  if (core.onPointerDown(input.toLogical(e.clientX, e.clientY))) return;
  const hit = input.hitButtonAt(e.clientX, e.clientY);
  if (hit) { input.pressButton(hit); return; }
  if (isLegacyTop() && game.state !== 'playing') game.onAction();
});

canvas.addEventListener('mouseup', (e) => { core.onPointerUp(input.toLogical(e.clientX, e.clientY)); });

canvas.addEventListener('touchstart', (e) => {
  audio.ensure(); audio.resume();
  const t = e.changedTouches && e.changedTouches[0];
  if (core.activeId() !== 'legacy') {
    if (input._btnTouch) return;   // a HUD/quit touch button was already tapped
    if (t) core.onPointerDown(input.toLogical(t.clientX, t.clientY));
    return;
  }
  if (isLegacyTop() && (game.state === 'menu' || game.state === 'gameover') && !input._btnTouch) game.onAction();
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches && e.changedTouches[0];
  if (t) core.onPointerUp(input.toLogical(t.clientX, t.clientY));
}, { passive: true });
```

- [ ] **Step 4: Run the assertions and the full suite**

Run: `node tests/core/capabilities.test.mjs && for f in $(find tests -name "*.test.mjs"); do node "$f" >/dev/null || echo "FAIL $f"; done && npm run typecheck`
Expected: PASS, no `FAIL` lines, typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/main.js tests/core/capabilities.test.mjs
git commit -m "refactor(p11-2): generic pointer routing — delete the match-3 plumbing from main.js"
```

---

### Task 7: Close the phase — versions, docs, and a real device pass

**Files:**
- Modify: `src/version.js`, `docs/platform/architecture.md`, `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Bump the versions**

In `src/version.js`: `ENGINE_VERSION` `'1.1.0'` → `'1.2.0'` (the contract grew
`pause/resume/onPointerDown/onPointerUp` and the Core took ownership of chrome),
and `BUILD` → `'p11-2-chrome-<YYYY-MM-DD>'` using **today's actual date** — the
date suffix is not optional.

- [ ] **Step 2: Run the version test**

Run: `node tests/core/versions.test.mjs`
Expected: PASS.

- [ ] **Step 3: Document the chrome layer**

Add a "Shell chrome" section to `docs/platform/architecture.md` covering: which
modes get chrome (pushed only, base excluded until P11.5), the four phases, the
`deepdescent.briefed.v1` ledger, the `strict` flag, and the rule that a
minigame never implements quit. Update `CLAUDE.md`'s "Known gotchas" — the
gamepad-confirm entry now points at `input.confirmEdge()` as the single place
that edge is assembled.

- [ ] **Step 4: Full verification**

Run:
```bash
for f in $(find tests -name "*.test.mjs"); do node "$f" || echo "FAIL $f"; done
npm run typecheck
```
Expected: every file prints its `ok …` line, no `FAIL`, typecheck exits 0.

- [ ] **Step 5: Manual browser pass — required, not optional**

Nothing automated in this repo can reach the canvas. Serve the repo
(`python3 -m http.server 8000`) and verify, in this order:

1. Menu → dive → find a Guardian Chest → the **briefing** appears on the first
   ever match-3 launch, and the legend lines match the manifest.
2. Space/A dismisses it → play. Esc/Start → **PAUSED**, board frozen (no tile
   animation advances). Space resumes.
3. ✕ (click AND touch-emulated tap) → the **summary** shows the salvage banked,
   then dismisses back into the dive with the reef running.
4. Re-enter a chest → **no briefing** the second time.
5. Touch emulation specifically: the ✕ is the only quit route there, and the
   shell-vs-reef run-state gotcha has frozen touch devices twice before.
6. If a ROG Ally / Steam Deck is available: A confirms and Start pauses on every
   screen.

- [ ] **Step 6: Commit and finish the branch**

```bash
git add src/version.js docs/platform/architecture.md CLAUDE.md
git commit -m "chore(release): BUILD=p11-2-chrome — shell chrome for pushed minigames"
```

Then use `superpowers:finishing-a-development-branch` to land it.

---

## Out of scope for P11.2

- The Library screen, the discovery ledger and Salvage purchases — **P11.3**.
- `progression.registerGoals`, namespaced stats, per-game Trophy Wall sections —
  **P11.4**.
- Extracting the `home` minigame and routing the reef's own pause/help/game-over
  through the Core — **P11.5**. The base mode keeps its own chrome until then.
- Touch buttons generated from `controls.actions` (only the legend text is
  manifest-driven in this phase).
- Reward toasts beyond the summary's badge/tier lines.
