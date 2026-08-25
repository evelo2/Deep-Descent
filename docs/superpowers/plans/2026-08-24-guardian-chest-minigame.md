# Guardian Chest → Treasure Chest Madness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rare, guardian-protected ornate chest to the reef dive that — once the guardian is slain — the diver enters to launch Treasure Chest Madness (match-3), earning salvage and a new family of lifetime accumulators and badges.

**Architecture:** Entering the chest calls `host.open('match3', { source: 'chest' })` on the Core stack, which pauses the reef (Core ticks only the top-of-stack) and resumes it on `host.close()`. Pure config + a new Guardian entity + meta additions are strict TDD; the reef wiring (spawn, combat, enter, render, crediting) is integration verified by typecheck + a browser E2E, following the existing (also un-unit-tested) kraken combat patterns.

**Tech Stack:** Plain ES modules (no build step, loaded directly by the browser). Node `.mjs` test scripts with a local `check()` counter (no framework). Typecheck via `npm run typecheck` (`tsc --noEmit` over `@ts-check` files). Canvas 2D rendering.

**Spec:** `docs/superpowers/specs/2026-08-24-guardian-chest-minigame-design.md`

## Global Constraints

- **No build step.** Every source file is an ES module the browser loads directly. Never add a bundler/transpile step. Imports must use explicit `.js` extensions.
- **Typecheck must stay green.** Files with `// @ts-check` are checked by `npm run typecheck`. New `@ts-check` files must pass; do not introduce type errors into existing checked files.
- **Tests are plain node scripts.** Run with `node tests/<path>.test.mjs`. No test framework, no imports beyond the modules under test. Follow the existing `let pass=0; const check=(c,m)=>{...}` idiom.
- **Tile type → name mapping is fixed:** `TILE_NAMES = ['Pearl','Gem','Coin','Shell','Starfish','Coral']`, so match-3 board tile `type` 0 = Pearl, 1 = Gem, 2 = Coin (`src/minigames/match3/levels.js`).
- **Deterministic rng in engine tests.** Board tests inject `rng`; never rely on `Math.random()` in a unit test.
- **Steam manifest is 1:1 with ids.** `desktop/achievements.json.ids` must equal exactly `BADGES.map(b=>b.id) ∪ PROGRESSIVE_IDS` — enforced by `tests/desktop/achievements.test.mjs`.
- **Commit trailers (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011sjssa1er5E51aTyVxXHao
  ```
- **Deploy = push to `main`.** GitHub Pages deploys via the Actions workflow. Bump `BUILD` in `src/version.js` on any deploy so the running build self-identifies on the About screen.

---

## File Structure

**New files:**
- `src/entities/guardian.js` — the Guardian boss entity (Kraken-shaped interface, distinct art).
- `src/minigames/match3/accum.js` — pure match-3 stat accumulation helpers (isolated so they're unit-testable without the module closure).
- `tests/config/special-chest.test.mjs` — `specialChestChance` ramp + caps.
- `tests/entities/guardian.test.mjs` — Guardian damage/death.
- `tests/core/open-context.test.mjs` — `Core.open(id, ctx)` passes ctx to `enter`.
- `tests/minigames/match3/accum.test.mjs` — accumulation folds cleared/blasts/combo.

**Modified files:**
- `src/config.js` — add `SPECIAL_CHEST`, `specialChestChance()`, `GUARDIAN`.
- `src/core/core.js` — `open(id, ctx)` → `enter(host, ctx)` plumbing.
- `src/core/host.js` — `open: (id, ctx) => core.open(id, ctx)`.
- `src/minigames/match3/index.js` — `enter(host, ctx)` reads `source`; accumulate stats; `exit()` records the run.
- `src/meta/stats.js` — append 6 `STAT_KEYS`.
- `src/meta/progressive.js` — append 6 `TRACKS`.
- `src/meta/badges.js` — append 4 `BADGES`.
- `src/meta/relics.js` — add `siren` relic + reset flag.
- `desktop/achievements.json` — add the new ids.
- `src/minigames/reef/index.js` — chest state, spawn, combat, enter flow, render, crediting, `_hasChestRelic`.
- `tests/game/progressive-badges.test.mjs` — update count assertions 10→16 / 30→48.
- `src/version.js` — `BUILD` bump on deploy.

---

## Task 1: Config — spawn-chance ramp + guardian constants

**Files:**
- Modify: `src/config.js` (append near other exported constant blocks)
- Test: `tests/config/special-chest.test.mjs`

**Interfaces:**
- Produces: `SPECIAL_CHEST = { base, perReef, cap, dryDockBoost, boostedCap, minDepthFrac }`; `specialChestChance(reef: number, boosted: boolean) => number`; `GUARDIAN = { hp, radius, killBonus, range }`.

- [ ] **Step 1: Write the failing test**

Create `tests/config/special-chest.test.mjs`:
```js
// specialChestChance: 5% at reef 1, +2.5pp/reef, capped at 25%; a Dry Dock
// boost adds +20pp up to a 45% boosted cap. Pure — no rng.
import { SPECIAL_CHEST, specialChestChance, GUARDIAN } from '../../src/config.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

check(near(specialChestChance(1, false), 0.05), 'reef 1 = 5%');
check(near(specialChestChance(2, false), 0.075), 'reef 2 = 7.5%');
check(near(specialChestChance(9, false), 0.25), 'reef 9 hits the 25% cap');
check(near(specialChestChance(20, false), 0.25), 'far reefs stay capped at 25%');
check(near(specialChestChance(1, true), 0.25), 'reef 1 boosted = 5% + 20pp');
check(near(specialChestChance(9, true), 0.45), 'reef 9 boosted hits the 45% cap');
check(near(specialChestChance(20, true), 0.45), 'boosted stays capped at 45%');
check(SPECIAL_CHEST.minDepthFrac > 0.6 && SPECIAL_CHEST.minDepthFrac < 0.7, 'depth gate is the last third');
check(GUARDIAN.hp > 0 && GUARDIAN.killBonus > 0 && GUARDIAN.range > 0, 'guardian constants are positive');
console.log(`ok special-chest.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/config/special-chest.test.mjs`
Expected: FAIL — `specialChestChance` / `SPECIAL_CHEST` / `GUARDIAN` are not exported.

- [ ] **Step 3: Add the config**

Append to `src/config.js`:
```js
// A rare, guardian-protected ornate chest in the reef's deep third. Spawn odds
// ramp with reef and a Dry Dock relic ("Siren's Lure") adds a flat boost.
// specialChestChance(reef, boosted) is shared by the reef spawn roll + tests.
export const SPECIAL_CHEST = {
  base: 0.05, perReef: 0.025, cap: 0.25,   // 5% at reef 1 → 25% cap ~reef 9
  dryDockBoost: 0.20, boostedCap: 0.45,     // Siren's Lure: +20pp, 45% cap
  minDepthFrac: 2 / 3,                       // only spawns below this depth fraction
};
export function specialChestChance(reef, boosted) {
  const base = Math.min(SPECIAL_CHEST.cap, SPECIAL_CHEST.base + SPECIAL_CHEST.perReef * Math.max(0, reef - 1));
  return boosted ? Math.min(SPECIAL_CHEST.boostedCap, base + SPECIAL_CHEST.dryDockBoost) : base;
}

// The chest's guardian — a distinct boss, tougher than a kraken (hp 14 vs 8) so
// opening the chest is a real gate. See src/entities/guardian.js.
export const GUARDIAN = { hp: 14, radius: 60, killBonus: 4000, range: 340 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/config/special-chest.test.mjs`
Expected: PASS (9 checks).

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config/special-chest.test.mjs
git commit -m "feat(reef): special-chest spawn-chance config + guardian constants"
```

---

## Task 2: Guardian entity

**Files:**
- Create: `src/entities/guardian.js`
- Test: `tests/entities/guardian.test.mjs`

**Interfaces:**
- Consumes: `GUARDIAN`, `PAL` from `src/config.js`.
- Produces: `class Guardian` with `{ x, y, hp, maxHp, radius, dead }`, `takeDamage(n=1)`, `harpoonHit(h)`, `hits(diver)`, `update(dt, t, diver, chest)`, `draw(ctx, camX, camY, t)`. Same call shape as `Kraken` so the reef's existing hit-test loops apply unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/entities/guardian.test.mjs`:
```js
// The Guardian mirrors the Kraken's combat interface: harpoon/charge chip its
// hp; at 0 it plays a short death animation then flags `dead`. Body contact
// with the diver returns true while alive.
import { Guardian } from '../../src/entities/guardian.js';
import { GUARDIAN } from '../../src/config.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const g = new Guardian(100, 100);
check(g.hp === GUARDIAN.hp && g.maxHp === GUARDIAN.hp, 'spawns at full hp');
check(g.dead === false, 'not dead at spawn');

g.takeDamage(1);
check(g.hp === GUARDIAN.hp - 1, 'takeDamage chips one hp');
check(g.hurtT > 0, 'takeDamage sets a hurt flash');

g.takeDamage(GUARDIAN.hp);             // overkill floors at 0, never negative
check(g.hp === 0, 'hp floors at 0');
check(g.dead === false, 'not dead the instant hp hits 0 (death anim first)');

for (let i = 0; i < 200; i++) g.update(1 / 60, i / 60, { x: 9999, y: 9999, radius: 8 }, null);
check(g.dead === true, 'dead after the death animation elapses');

// Body contact while alive.
const live = new Guardian(0, 0);
check(live.hits({ x: 0, y: 0, radius: 8 }) === true, 'body contact hits the diver');
check(live.hits({ x: 5000, y: 5000, radius: 8 }) === false, 'far diver is not hit');

// Harpoon tip on the body registers.
const near = { tip: () => ({ x: 0, y: 0 }) };
const far = { tip: () => ({ x: 5000, y: 5000 }) };
check(live.harpoonHit(near) === true, 'harpoon on body hits');
check(live.harpoonHit(far) === false, 'harpoon miss does not hit');
console.log(`ok guardian.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/entities/guardian.test.mjs`
Expected: FAIL — cannot resolve `src/entities/guardian.js`.

- [ ] **Step 3: Implement the Guardian**

Create `src/entities/guardian.js`:
```js
// The Guardian — an armored leviathan coiled around a special chest in the
// reef's deep third. Distinct from the Kraken (own silhouette + palette): a
// heavy oval carapace with a plated brow and glowing eye, plus lashing spines
// that reach for the diver. Its combat interface matches Kraken so the reef's
// harpoon/charge hit-test loops treat both uniformly. Killing it opens the
// chest (handled by the reef).
import { GUARDIAN, PAL } from '../config.js';

const TAU = Math.PI * 2;

export class Guardian {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp = GUARDIAN.hp; this.maxHp = GUARDIAN.hp;
    this.radius = GUARDIAN.radius;
    this.t0 = 0;                 // deterministic phase (no rng: keeps tests stable)
    this.hurtT = 0; this.retreat = 0; this.dead = false;
    this._t = 0; this._diver = { x, y };
  }

  update(dt, t, diver, chest) {
    this._t = t; this._diver = diver;
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hp <= 0) { this.retreat += dt; this.y += 30 * dt; if (this.retreat > 1.6) this.dead = true; return; }
    // Orbit slowly around the chest it guards (falls back to a gentle bob).
    const cx = chest ? chest.x : this.x, cy = chest ? chest.y - 44 : this.y;
    const a = t * 0.6 + this.t0;
    this.x = cx + Math.cos(a) * 26;
    this.y = cy + Math.sin(a) * 14;
  }

  // Two lashing spines that straighten toward the diver when it's within range.
  _spine(i, t, diver) {
    const base = (i === 0 ? -0.5 : 0.5) * Math.PI;      // left/right
    let px = this.x + Math.cos(base) * this.radius * 0.7;
    let py = this.y + Math.sin(base) * this.radius * 0.7;
    let dirx = Math.cos(base), diry = Math.sin(base);
    const dx = diver.x - px, dy = diver.y - py, dist = Math.hypot(dx, dy) || 1;
    if (dist < GUARDIAN.range && this.hp > 0) {
      const k = (1 - dist / GUARDIAN.range) * 0.9;
      dirx = dirx * (1 - k) + (dx / dist) * k; diry = diry * (1 - k) + (dy / dist) * k;
      const m = Math.hypot(dirx, diry) || 1; dirx /= m; diry /= m;
    }
    const pts = [[px, py]];
    let ang = Math.atan2(diry, dirx);
    const segs = 5, len = 30;
    for (let s = 1; s <= segs; s++) {
      ang += Math.sin(t * 2.4 + i * 2 + s * 0.6) * 0.22;
      px += Math.cos(ang) * len; py += Math.sin(ang) * len;
      pts.push([px, py]);
    }
    return pts;
  }

  hits(diver) {
    if (this.hp <= 0) return false;
    if (Math.hypot(diver.x - this.x, diver.y - this.y) < this.radius + diver.radius * 0.8) return true;
    for (let i = 0; i < 2; i++) {
      const pts = this._spine(i, this._t, diver);
      for (let s = 2; s < pts.length; s++) if (Math.hypot(diver.x - pts[s][0], diver.y - pts[s][1]) < 16 + diver.radius) return true;
    }
    return false;
  }

  harpoonHit(h) {
    if (this.hp <= 0) return false;
    const tip = h.tip();
    if (Math.hypot(tip.x - this.x, tip.y - this.y) < this.radius) return true;
    for (let i = 0; i < 2; i++) {
      const pts = this._spine(i, this._t, this._diver);
      for (const p of pts) if (Math.hypot(tip.x - p[0], tip.y - p[1]) < 18) return true;
    }
    return false;
  }

  takeDamage(n = 1) { this.hp = Math.max(0, this.hp - n); this.hurtT = 0.28; }

  draw(ctx, camX, camY, t) {
    const hurt = this.hurtT > 0;
    const sx = this.x - camX, sy = this.y - camY;
    ctx.save();
    ctx.globalAlpha = this.hp <= 0 ? Math.max(0, 1 - this.retreat / 1.6) : 1;
    ctx.lineCap = 'round';
    // spines
    for (let i = 0; i < 2; i++) {
      const pts = this._spine(i, t, this._diver);
      ctx.strokeStyle = hurt ? PAL.danger : (PAL.krakenDark || '#3a2a44');
      for (let s = 1; s < pts.length; s++) {
        ctx.lineWidth = 12 - s * 1.6;
        ctx.beginPath(); ctx.moveTo(pts[s - 1][0] - camX, pts[s - 1][1] - camY); ctx.lineTo(pts[s][0] - camX, pts[s][1] - camY); ctx.stroke();
      }
    }
    // armored carapace
    const g = ctx.createRadialGradient(sx - 14, sy - 18, 8, sx, sy, this.radius);
    g.addColorStop(0, hurt ? '#ffd27f' : '#5a6b7a'); g.addColorStop(1, hurt ? PAL.danger : '#26313c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(sx, sy, this.radius * 0.95, this.radius, 0, 0, TAU); ctx.fill();
    // plated ridges
    ctx.strokeStyle = hurt ? '#fff' : (PAL.gold || '#d9a441'); ctx.lineWidth = 3;
    for (const ry of [-0.4, 0, 0.4]) {
      ctx.beginPath(); ctx.ellipse(sx, sy + ry * this.radius, this.radius * 0.7, 8, 0, 0, Math.PI); ctx.stroke();
    }
    // single glowing eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy - 10, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = hurt ? PAL.danger : (PAL.krakenEye || '#ffcf3f'); ctx.beginPath(); ctx.arc(sx, sy - 10, 6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/entities/guardian.test.mjs`
Expected: PASS (13 checks).

- [ ] **Step 5: Verify typecheck is unaffected**

Run: `npm run typecheck`
Expected: no new errors (the new file has no `@ts-check`, matching `entities/kraken.js`).

- [ ] **Step 6: Commit**

```bash
git add src/entities/guardian.js tests/entities/guardian.test.mjs
git commit -m "feat(reef): Guardian boss entity (Kraken-shaped interface, distinct art)"
```

---

## Task 3: Core.open context arg → minigame enter(host, ctx)

**Files:**
- Modify: `src/core/core.js:85` (`open`), `src/core/core.js:95-99` (`_applyPending` open branch)
- Modify: `src/core/host.js:31` (`open`)
- Test: `tests/core/open-context.test.mjs`

**Interfaces:**
- Consumes: existing `Core` / `makeHost`.
- Produces: `core.open(id, ctx?)` stores ctx and calls `mg.enter(host, ctx)`. Backward-compatible — `ctx` is optional; existing `enter(host)` callers are unaffected.

- [ ] **Step 1: Write the failing test**

Create `tests/core/open-context.test.mjs`:
```js
// Core.open(id, ctx) forwards the optional context to the mode's enter(host, ctx).
// Backward-compatible: opening with no ctx passes undefined.
import { Core } from '../../src/core/core.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const host = {};
const seen = [];
const base = { id: 'base', enter() {}, update() {}, render() {} };
const modal = { id: 'modal', enter(h, ctx) { seen.push(ctx); }, update() {}, render() {} };
const core = new Core({ host, creditResult() {} });
core.register(base).register(modal);
core.boot('base');

core.open('modal', { source: 'chest' });
core.update(0);                       // applies the queued open → enter(host, ctx)
check(seen.length === 1 && seen[0] && seen[0].source === 'chest', 'ctx forwarded to enter');

core.close();
core.update(0);
core.open('modal');                   // no ctx → enter(host, undefined)
core.update(0);
check(seen.length === 2 && seen[1] === undefined, 'opening without ctx passes undefined');
console.log(`ok open-context.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/core/open-context.test.mjs`
Expected: FAIL — `seen[0]` is `undefined` (ctx not forwarded).

- [ ] **Step 3: Thread the context arg**

In `src/core/core.js`, change `open`:
```js
  /** Queue pushing minigame `id` onto the stack (applied next frame). An
   *  optional `ctx` is forwarded to the mode's enter(host, ctx). */
  open(id, ctx) { this._pending = { op: 'open', id, ctx }; }
```
And in `_applyPending`, the open branch:
```js
    if (p.op === 'open') {
      const mg = this.registry.get(p.id);
      if (!mg) throw new Error(`Core.open: no minigame registered as '${p.id}'`);
      this._stack.push(mg);
      mg.enter(this.host, p.ctx);
    } else if (p.op === 'close') {
```

In `src/core/host.js`, change `open`:
```js
    open: (id, ctx) => core && core.open(id, ctx),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/core/open-context.test.mjs`
Expected: PASS (2 checks).

- [ ] **Step 5: Update the contract typedef + verify typecheck**

In `src/core/contract.js`, update the two JSDoc lines so `tsc` accepts the ctx:
- `enter`: `@property {(host: Host, ctx?: any) => void} enter`
- Host `open`: `@property {(id: string, ctx?: any) => void} open`

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Run the existing core suite to confirm no regressions**

Run: `node tests/core/versions.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/core.js src/core/host.js src/core/contract.js tests/core/open-context.test.mjs
git commit -m "feat(core): optional context arg on open(id, ctx) → enter(host, ctx)"
```

---

## Task 4: Lifetime stat keys

**Files:**
- Modify: `src/meta/stats.js:12-15` (`STAT_KEYS`)
- Test: extend `tests/game/progressive-badges.test.mjs` is covered in Task 5; a direct round-trip check here.

**Interfaces:**
- Produces: `STAT_KEYS` includes `m3Pearls, m3Gems, m3Coins, m3Explosions, chestsOpened, guardiansFelled`.

- [ ] **Step 1: Write the failing test**

Create `tests/meta/stats-new-keys.test.mjs`:
```js
// New lifetime counters for the guardian-chest feature round-trip through addRun.
import { STAT_KEYS, defaultStats, addRun } from '../../src/meta/stats.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

for (const k of ['m3Pearls', 'm3Gems', 'm3Coins', 'm3Explosions', 'chestsOpened', 'guardiansFelled']) {
  check(STAT_KEYS.includes(k), `STAT_KEYS includes ${k}`);
}
const s = defaultStats();
addRun(s, { m3Pearls: 4, m3Gems: 2, m3Coins: 7, m3Explosions: 3, chestsOpened: 1, guardiansFelled: 1 });
addRun(s, { m3Pearls: 6, chestsOpened: 1 });
check(s.m3Pearls === 10, 'm3Pearls accumulates across runs');
check(s.chestsOpened === 2, 'chestsOpened accumulates');
check(s.guardiansFelled === 1, 'guardiansFelled accumulates');
console.log(`ok stats-new-keys.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/meta/stats-new-keys.test.mjs`
Expected: FAIL — keys missing from `STAT_KEYS`.

- [ ] **Step 3: Append the keys**

In `src/meta/stats.js`, extend `STAT_KEYS`:
```js
export const STAT_KEYS = [
  'sharkKills', 'metersDived', 'diveSeconds', 'subLoot', 'netted', 'dives',
  'salvageEarned', 'pearlsBanked', 'bossesFelled', 'careerScore',
  // Guardian-chest + Treasure Chest Madness accumulators.
  'm3Pearls', 'm3Gems', 'm3Coins', 'm3Explosions', 'chestsOpened', 'guardiansFelled',
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/meta/stats-new-keys.test.mjs`
Expected: PASS (9 checks).

- [ ] **Step 5: Commit**

```bash
git add src/meta/stats.js tests/meta/stats-new-keys.test.mjs
git commit -m "feat(meta): lifetime stat keys for match-3 loot, chests, guardians"
```

---

## Task 5: Progressive tracks (6 new tiered badges)

**Files:**
- Modify: `src/meta/progressive.js:15-36` (`TRACKS`)
- Modify: `tests/game/progressive-badges.test.mjs:17,19,20` (count assertions)

**Interfaces:**
- Consumes: the new `STAT_KEYS` from Task 4 (each track binds a real stat).
- Produces: `TRACKS.length === 16`, `PROGRESSIVE_IDS.length === 48`, with ids `m3pearls_{1..3}`, `m3gems_{1..3}`, `m3coins_{1..3}`, `m3boom_{1..3}`, `chests_{1..3}`, `guardian_{1..3}`.

- [ ] **Step 1: Update the count assertions (these will fail first)**

In `tests/game/progressive-badges.test.mjs`, change:
```js
check('16 tracks', TRACKS.length === 16);
check('every track has exactly 3 tiers', TRACKS.every((t) => t.tiers.length === 3 && t.names.length === 3));
check('48 flattened tier ids', PROGRESSIVE_IDS.length === 48);
check('tier ids are unique', new Set(PROGRESSIVE_IDS).size === 48);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/game/progressive-badges.test.mjs`
Expected: FAIL — 10 tracks / 30 ids.

- [ ] **Step 3: Append the tracks**

In `src/meta/progressive.js`, append to `TRACKS` (before the closing `];`):
```js
  { id: 'm3pearls', stat: 'm3Pearls', glyph: '🫧', label: 'Pearl Diver',   unit: '',
    tiers: [100, 500, 2000], names: ['Pearl Diver I', 'Pearl Diver II', 'Pearl Diver III'] },
  { id: 'm3gems',   stat: 'm3Gems',   glyph: '💎', label: 'Gem Cutter',    unit: '',
    tiers: [100, 500, 2000], names: ['Gem Cutter I', 'Gem Cutter II', 'Gem Cutter III'] },
  { id: 'm3coins',  stat: 'm3Coins',  glyph: '🪙', label: 'Coin Collector', unit: '',
    tiers: [100, 500, 2000], names: ['Coin Collector I', 'Coin Collector II', 'Coin Collector III'] },
  { id: 'm3boom',   stat: 'm3Explosions', glyph: '💥', label: 'Demolitionist', unit: '',
    tiers: [25, 150, 600], names: ['Demolitionist I', 'Demolitionist II', 'Demolitionist III'] },
  { id: 'chests',   stat: 'chestsOpened', glyph: '🧰', label: 'Treasure Hunter', unit: '',
    tiers: [1, 10, 50], names: ['Treasure Hunter I', 'Treasure Hunter II', 'Treasure Hunter III'] },
  { id: 'guardian', stat: 'guardiansFelled', glyph: '🐉', label: 'Leviathan Slayer', unit: '',
    tiers: [1, 10, 50], names: ['Leviathan Slayer I', 'Leviathan Slayer II', 'Leviathan Slayer III'] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/game/progressive-badges.test.mjs`
Expected: PASS (all checks, including "every track binds a real stat key" — depends on Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/meta/progressive.js tests/game/progressive-badges.test.mjs
git commit -m "feat(meta): 6 progressive tracks — pearls/gems/coins/booms/chests/guardians"
```

---

## Task 6: One-time badges (4 new)

**Files:**
- Modify: `src/meta/badges.js:14-33` (`BADGES`)
- Test: `tests/meta/new-badges.test.mjs`

**Interfaces:**
- Produces: badges `firsttreasure` (`s.chestsOpened >= 1`), `guardiandown` (`s.guardiansFelled >= 1`), `comboartist` (`s.m3Combo >= 1`), `hoardcleared` (`s.hoardCleared`). Predicates read run-summary fields; absent fields are `undefined` → falsy (guarded by `safeTest`), so match-3 summaries never trip reef badges and vice-versa.

- [ ] **Step 1: Write the failing test**

Create `tests/meta/new-badges.test.mjs`:
```js
// The 4 guardian-chest badges + partial-summary safety: a summary missing a
// field must not award a badge that reads it.
import { BADGE_BY_ID, newlyEarned } from '../../src/meta/badges.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
const earns = (id, stats) => newlyEarned(stats, new Set()).includes(id);

for (const id of ['firsttreasure', 'guardiandown', 'comboartist', 'hoardcleared']) {
  check(!!BADGE_BY_ID[id], `badge ${id} exists`);
}
check(earns('firsttreasure', { chestsOpened: 1 }), 'firsttreasure on first chest');
check(!earns('firsttreasure', { chestsOpened: 0 }), 'firsttreasure needs a chest');
check(earns('guardiandown', { guardiansFelled: 1 }), 'guardiandown on first kill');
check(earns('comboartist', { m3Combo: 1 }), 'comboartist on first combo');
check(earns('hoardcleared', { hoardCleared: true }), 'hoardcleared when flagged');
// Partial-summary safety: a reef summary (no m3Combo/hoardCleared) trips neither.
check(!earns('comboartist', { chestsOpened: 1, guardiansFelled: 1 }), 'reef summary does not trip comboartist');
check(!earns('hoardcleared', { chestsOpened: 1 }), 'reef summary does not trip hoardcleared');
console.log(`ok new-badges.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/meta/new-badges.test.mjs`
Expected: FAIL — badges not defined.

- [ ] **Step 3: Append the badges**

In `src/meta/badges.js`, append to `BADGES` (before the closing `];`):
```js
  // --- Treasure Chest Madness / Guardian chest ---
  { id: 'firsttreasure', name: 'First Treasure', glyph: '🧰', desc: 'Open a guarded reef chest.',            test: (s) => s.chestsOpened >= 1 },
  { id: 'guardiandown',  name: 'Guardian Down',  glyph: '🐉', desc: 'Fell a chest guardian.',                test: (s) => s.guardiansFelled >= 1 },
  { id: 'comboartist',   name: 'Combo Artist',   glyph: '🎇', desc: 'Detonate a special-on-special combo.',  test: (s) => s.m3Combo >= 1 },
  { id: 'hoardcleared',  name: 'Hoard Cleared',  glyph: '🏆', desc: 'Clear every level of a chest run.',      test: (s) => !!s.hoardCleared },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/meta/new-badges.test.mjs`
Expected: PASS (11 checks).

- [ ] **Step 5: Commit**

```bash
git add src/meta/badges.js tests/meta/new-badges.test.mjs
git commit -m "feat(meta): 4 badges — first treasure, guardian down, combo artist, hoard cleared"
```

---

## Task 7: Steam achievement manifest

**Files:**
- Modify: `desktop/achievements.json` (add ids)
- Test: `tests/desktop/achievements.test.mjs` (existing; auto-covers)

**Interfaces:**
- Consumes: `BADGES` (Task 6) + `PROGRESSIVE_IDS` (Task 5). The test asserts the manifest equals exactly the union, so this task just brings the file into sync.

- [ ] **Step 1: Run the manifest test to see it fail**

Run: `node tests/desktop/achievements.test.mjs`
Expected: FAIL — `missing:` lists the 4 new badge ids + 18 new tier ids.

- [ ] **Step 2: Add the ids**

In `desktop/achievements.json`, append to the `ids` array (order is not asserted, but keep it tidy): the 4 badge ids `firsttreasure`, `guardiandown`, `comboartist`, `hoardcleared`, and the 18 tier ids `m3pearls_1..3`, `m3gems_1..3`, `m3coins_1..3`, `m3boom_1..3`, `chests_1..3`, `guardian_1..3`.

- [ ] **Step 3: Run test to verify it passes**

Run: `node tests/desktop/achievements.test.mjs`
Expected: PASS (missing: none, extra: none, count matches).

- [ ] **Step 4: Commit**

```bash
git add desktop/achievements.json
git commit -m "chore(desktop): register guardian-chest achievements in the Steam manifest"
```

---

## Task 8: Dry Dock relic — Siren's Lure

**Files:**
- Modify: `src/meta/relics.js:7-28` (`RELICS`), `:69-81` (`resetRelicFlags`)
- Test: `tests/meta/siren-relic.test.mjs`

**Interfaces:**
- Produces: relic `{ id: 'siren' }` whose `apply(g)` sets `g._relicSirenLure = true`; `resetRelicFlags` defaults it to `false`. The reef reads it via `_hasChestRelic()` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `tests/meta/siren-relic.test.mjs`:
```js
// Siren's Lure sets a per-run flag via applyLoadout, cleared by resetRelicFlags.
import { getRelic, applyLoadout, resetRelicFlags } from '../../src/meta/relics.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const siren = getRelic('siren');
check(!!siren && siren.cost > 0, 'siren relic exists with a cost');

const g = {};
resetRelicFlags(g);
check(g._relicSirenLure === false, 'reset defaults the flag off');

applyLoadout(g, ['siren']);
check(g._relicSirenLure === true, 'equipping siren sets the flag');

applyLoadout(g, []);                 // re-applying an empty loadout clears it
check(g._relicSirenLure === false, 'unequipping clears the flag');
console.log(`ok siren-relic.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/meta/siren-relic.test.mjs`
Expected: FAIL — `getRelic('siren')` is null.

- [ ] **Step 3: Add the relic + reset flag**

In `src/meta/relics.js`, append to `RELICS`:
```js
  { id: 'siren', name: "Siren's Lure", desc: '+20% chance a guarded chest appears in the deep.', cost: 260,
    apply: g => { g._relicSirenLure = true; } },
```
And in `resetRelicFlags`, add:
```js
  game._relicSirenLure = false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/meta/siren-relic.test.mjs`
Expected: PASS (4 checks).

- [ ] **Step 5: Commit**

```bash
git add src/meta/relics.js tests/meta/siren-relic.test.mjs
git commit -m "feat(meta): Siren's Lure relic (+20% guarded-chest chance)"
```

---

## Task 9: Match-3 stat accumulation helpers

**Files:**
- Create: `src/minigames/match3/accum.js`
- Test: `tests/minigames/match3/accum.test.mjs`

**Interfaces:**
- Consumes: an `applySwap` result `{ cleared, blasts }` (see `board.js` — `cleared` is `{ [type]: count }`, `blasts` a number). Tile types 0/1/2 = Pearl/Gem/Coin.
- Produces:
  - `newMatchAccum() => { m3Pearls, m3Gems, m3Coins, m3Explosions, m3Combo }` (all 0).
  - `foldMatchStats(acc, res, combo=false) => acc` — adds `cleared[0/1/2]` to pearls/gems/coins, `blasts` to explosions, and +1 to `m3Combo` when `combo` is true.
  - `matchRunResult(acc, { hoardCleared }) => { runDelta, runStats }` — `runDelta` = the four lifetime counters; `runStats` = `{ m3Combo, hoardCleared }`.

- [ ] **Step 1: Write the failing test**

Create `tests/minigames/match3/accum.test.mjs`:
```js
// Pure match-3 stat accumulation: fold board results into lifetime deltas + a
// run summary, isolated from the module closure so it's unit-testable.
import { newMatchAccum, foldMatchStats, matchRunResult } from '../../../src/minigames/match3/accum.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const acc = newMatchAccum();
check(acc.m3Pearls === 0 && acc.m3Combo === 0, 'fresh accumulator is zeroed');

foldMatchStats(acc, { cleared: { 0: 3, 1: 2, 2: 5 }, blasts: 1 });
foldMatchStats(acc, { cleared: { 0: 2 }, blasts: 2 }, true);   // this swap was a combo
check(acc.m3Pearls === 5, 'pearls from cleared[0]');
check(acc.m3Gems === 2, 'gems from cleared[1]');
check(acc.m3Coins === 5, 'coins from cleared[2]');
check(acc.m3Explosions === 3, 'explosions from blasts');
check(acc.m3Combo === 1, 'combo counted once');

const r = matchRunResult(acc, { hoardCleared: true });
check(r.runDelta.m3Pearls === 5 && r.runDelta.m3Explosions === 3, 'runDelta carries lifetime counters');
check(r.runStats.m3Combo === 1 && r.runStats.hoardCleared === true, 'runStats carries combo + hoard flags');

// Robust to a missing cleared/blasts (a no-op swap).
foldMatchStats(acc, {});
check(acc.m3Pearls === 5, 'missing fields are treated as zero');
console.log(`ok accum.test.mjs (${pass} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/minigames/match3/accum.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/minigames/match3/accum.js`:
```js
// @ts-check
// Pure accumulation of Treasure Chest Madness stats across a session's levels.
// Kept out of index.js so it's unit-testable without the module closure. Tile
// types 0/1/2 = Pearl/Gem/Coin (see levels.js TILE_NAMES).

export function newMatchAccum() {
  return { m3Pearls: 0, m3Gems: 0, m3Coins: 0, m3Explosions: 0, m3Combo: 0 };
}

// Fold one applySwap result into the accumulator. `combo` is a module-side flag
// set when the swap moved two specials together (no engine change needed).
export function foldMatchStats(acc, res, combo = false) {
  const c = (res && res.cleared) || {};
  acc.m3Pearls += c[0] || 0;
  acc.m3Gems += c[1] || 0;
  acc.m3Coins += c[2] || 0;
  acc.m3Explosions += (res && res.blasts) || 0;
  if (combo) acc.m3Combo += 1;
  return acc;
}

// Build the { runDelta, runStats } pair for host.progression.recordRun.
export function matchRunResult(acc, { hoardCleared = false } = {}) {
  return {
    runDelta: {
      m3Pearls: acc.m3Pearls, m3Gems: acc.m3Gems,
      m3Coins: acc.m3Coins, m3Explosions: acc.m3Explosions,
    },
    runStats: { m3Combo: acc.m3Combo, hoardCleared: !!hoardCleared },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/minigames/match3/accum.test.mjs`
Expected: PASS (9 checks).

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (new `@ts-check` file is clean).

- [ ] **Step 6: Commit**

```bash
git add src/minigames/match3/accum.js tests/minigames/match3/accum.test.mjs
git commit -m "feat(match3): pure stat accumulation helpers (pearls/gems/coins/booms/combos)"
```

---

## Task 10: Wire accumulation + run recording into the match-3 module

**Files:**
- Modify: `src/minigames/match3/index.js` — `enter`, `trySwap`, `_checkGoal`, `exit`, module state

**Interfaces:**
- Consumes: `newMatchAccum`, `foldMatchStats`, `matchRunResult` (Task 9); `getLevel` (already imported); `host.progression.recordRun`, `host.achievements.unlock` (Host services).
- Produces: on `exit()`, folds the session's accumulated stats via `host.progression.recordRun` and mirrors returned `newBadges`/`freshTiers` to `host.achievements.unlock`. Still returns `{ outcome, credited: true }` (per-level salvage stays self-credited during play; this adds stats/badges without double-counting salvage).

Note: this task has no new unit test — the pure logic is covered by Task 9; correctness of the wiring is verified by typecheck (Step 4) and the browser E2E (Task 16). This mirrors how the reef's own `_gameOver` crediting is verified.

- [ ] **Step 1: Import the helpers**

At the top of `src/minigames/match3/index.js`, add:
```js
import { newMatchAccum, foldMatchStats, matchRunResult } from './accum.js';
```

- [ ] **Step 2: Add module state**

In the `mod` object's state block (near `chestSalvage`), add:
```js
    accum: /** @type {any} */ (null),   // lifetime-stat accumulator for this session
    source: 'menu',            // 'menu' | 'chest' — how the mode was entered
    hoardCleared: false,       // set when a chest run clears its final level
```

- [ ] **Step 3: Initialize on enter(host, ctx)**

Change `enter()` to accept and record the context:
```js
    enter(_host, ctx) {
      this.levelIndex = 0;
      this.source = (ctx && ctx.source) || 'menu';
      this.hoardCleared = false;
      this.accum = newMatchAccum();
      this.seenSpecials = this._loadSeenSpecials();
      this.guide = null; this.guideQueue = [];
      this._loadLevel(0);
      host.audio.startMatchTheme && host.audio.startMatchTheme();
    },
```
(The module already closes over `host`; the `_host` param is ignored exactly as before.)

- [ ] **Step 4: Accumulate in trySwap**

In `trySwap`, after `const res = applySwap(...)` and the `if (!res.ok) return false;` guard, detect a combo (both swapped cells held a special) and fold. Insert just after `this.chestSalvage += (res.chests || 0) * 3;`:
```js
      // A "combo" is swapping two specials together — a module-side check off
      // the PRE-swap grid (no engine change). `pre` holds tiles before the swap.
      const wasCombo = !!(pre[r1][c1] && pre[r1][c1].special && pre[r2][c2] && pre[r2][c2].special);
      foldMatchStats(this.accum, res, wasCombo);
```

- [ ] **Step 5: Flag hoardCleared on the final level**

In `_checkGoal`, in the `won` branch (after `this.phase = 'won'`), add:
```js
        if (this.source === 'chest' && !getLevel(this.levelIndex + 1)) this.hoardCleared = true;
```

- [ ] **Step 6: Record the run on exit**

Change `exit()`:
```js
    exit() {
      host.audio.stopMatchTheme && host.audio.stopMatchTheme();
      // Fold this session's accumulators into lifetime progression + mirror any
      // freshly-earned badges/tiers to Steam. Salvage was already credited
      // per-level during play, so we keep `credited: true` (Core skips re-credit).
      if (this.accum && host.progression && host.progression.recordRun) {
        const { runDelta, runStats } = matchRunResult(this.accum, { hoardCleared: this.hoardCleared });
        const { newBadges, freshTiers } = host.progression.recordRun({ runStats, runDelta });
        if (host.achievements && host.achievements.unlock) {
          for (const id of [...(newBadges || []), ...(freshTiers || [])]) host.achievements.unlock(id);
        }
      }
      return { outcome: this.phase === 'won' ? 'won' : 'bailed', credited: true };
    },
```

- [ ] **Step 7: Verify typecheck + existing match-3 tests**

Run: `npm run typecheck && node tests/minigames/match3/specials.test.mjs && node tests/minigames/match3/swap-activate.test.mjs && node tests/game/match3-gamepad.test.mjs`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/minigames/match3/index.js
git commit -m "feat(match3): accumulate loot/combo stats + record run on exit (chest-aware)"
```

---

## Task 11: Reef — chest state, `_hasChestRelic`, spawn roll

**Files:**
- Modify: `src/minigames/reef/index.js` — import Guardian + config; state resets in all four `_generate*`; per-run counters; spawn roll in `_generateWorld`; `_hasChestRelic`.

**Interfaces:**
- Consumes: `Guardian` (Task 2), `SPECIAL_CHEST`, `specialChestChance` (Task 1); `this.meta.loadout` (equipped relic ids); `this.reef`, `C.floors()`, local `pickOne`, `this._enqueueToast`, `WH`, `PAL`.
- Produces: `this.specialChest = { x, y, r, opened } | null`, `this.chestGuardian = Guardian | null`, `this.runChestsOpened`, `this.runGuardiansFelled`, `_hasChestRelic()`.

Note: reef spawn uses `Math.random()` directly and constructing a `Reef` needs the full host — not unit-testable in isolation. The spawn *chance* is already unit-tested (Task 1); placement + behavior are verified in the E2E (Task 16). Do not add a brittle reef-construction test.

- [ ] **Step 1: Add imports**

Near the top of `src/minigames/reef/index.js`, add `Guardian` alongside the other entity imports, and extend the config import:
```js
import { Guardian } from '../../entities/guardian.js';
```
Add `SPECIAL_CHEST, specialChestChance, GUARDIAN` to the existing `from '../../config.js'` import list (find the line importing `KRAKEN`/`PAL`/`GAME` and append these three names).

- [ ] **Step 2: Reset chest state in every world generator**

In `_generateWorld`, `_generateTemple`, `_generateAbyss`, `_generateBelly`, next to the existing `this.krakens = [];` reset line, add:
```js
    this.specialChest = null; this.chestGuardian = null;
```
(Chest only ever spawns in `_generateWorld`; nulling it in the other three guarantees it never leaks across zone transitions.)

- [ ] **Step 3: Add per-run counters**

In the run-reset block (near `this.bossesFelled = 0; this.relicsBanked = 0;` around line 287), add:
```js
    this.runChestsOpened = 0; this.runGuardiansFelled = 0;
```

- [ ] **Step 4: Add `_hasChestRelic`**

Add a method near the other relic checks (anywhere on the `Reef` class; place it just below `_enqueueToast`):
```js
  // Siren's Lure (Dry Dock relic) boosts the guarded-chest spawn chance.
  _hasChestRelic() { return (this.meta.loadout || []).includes('siren'); }
```

- [ ] **Step 5: Add the spawn roll**

In `_generateWorld`, immediately after the bonus-zone portal block closes (after line ~522, before `// A power-up or two floating in the reef.`), add:
```js
    // Rare guarded chest → Treasure Chest Madness. Deep third only, at most one
    // per dive; Siren's Lure boosts the odds. See specialChestChance().
    if (Math.random() < specialChestChance(this.reef, this._hasChestRelic())) {
      const cands = C.floors().filter((f) => f.y > WH * SPECIAL_CHEST.minDepthFrac);
      if (cands.length) {
        const f = pickOne(cands);
        this.specialChest = { x: f.x, y: f.y - 20, r: 26, opened: false };
        this.chestGuardian = new Guardian(f.x, f.y - 60);
        this._enqueueToast('✨ SOMETHING SPECIAL LURKS BELOW…', PAL.key, 2.4);
      }
    }
```

- [ ] **Step 6: Verify typecheck + smoke the reef test suite**

Run: `npm run typecheck && node tests/game/progressive-badges.test.mjs`
Expected: PASS. (There is no dedicated reef-spawn unit test; this step confirms nothing else broke.)

- [ ] **Step 7: Commit**

```bash
git add src/minigames/reef/index.js
git commit -m "feat(reef): guarded special-chest state + depth-gated spawn roll"
```

---

## Task 12: Reef — guardian combat + chest open

**Files:**
- Modify: `src/minigames/reef/index.js` — guardian update/hit in the entity loop; harpoon + charge hit tests; death→open; dead-filter.

**Interfaces:**
- Consumes: `this.chestGuardian`, `this.specialChest`, `GUARDIAN`, `this._hit`, `this.particles`, `this.audio`, `this._enqueueToast`, `this.runGuardiansFelled`.
- Produces: on `chestGuardian.hp === 0`: award `GUARDIAN.killBonus` to score, shake/flash, `runGuardiansFelled++`, `specialChest.opened = true`, toast `🗝 THE CHEST OPENS!`. Guardian nulled once its death animation finishes.

- [ ] **Step 1: Update + contact the guardian each frame**

In `update`, right after the kraken update/contact loop (line 1435), add:
```js
    if (this.chestGuardian) {
      this.chestGuardian.update(dt, this.t, this.diver, this.specialChest);
      if (!this.chestGuardian.dead && this.chestGuardian.hp > 0 && this.diver.invuln <= 0 && this.chestGuardian.hits(this.diver)) this._hit();
    }
```

- [ ] **Step 2: Null the guardian after its death animation**

After `this.krakens = this.krakens.filter((k) => !k.dead);` (line 1542), add:
```js
    if (this.chestGuardian && this.chestGuardian.dead) this.chestGuardian = null;
```

- [ ] **Step 3: Harpoon vs guardian**

In `_collisions`, right after the kraken harpoon block closes (after line 1644, the `}` ending `if (!h.dead) for (const k of this.krakens) {`), add a sibling block:
```js
      // Harpoon vs the chest guardian — chip it; killing it opens the chest.
      const g = this.chestGuardian;
      if (!h.dead && g && g.hp > 0 && g.harpoonHit(h)) {
        h.dead = true; g.takeDamage(1);
        this.score += KRAKEN.hitPoints;
        const tip = h.tip(); this.particles.sparkle(tip.x, tip.y, PAL.krakenEye, 16); this.audio.kill();
        if (g.hp === 0) this._openSpecialChest(g);
      }
```

- [ ] **Step 4: Charge (explosion) vs guardian**

In `_explode`, after the kraken splash loop closes (after line 1691), add:
```js
    const eg = this.chestGuardian;
    if (eg && eg.hp > 0 && Math.hypot(eg.x - ch.x, eg.y - ch.y) < R + eg.radius) {
      eg.takeDamage(2); this.score += KRAKEN.hitPoints * 2;
      if (eg.hp === 0) this._openSpecialChest(eg);
    }
```

- [ ] **Step 5: Add the shared open helper**

Add a method to the `Reef` class (place it just after `_explode`):
```js
  // The guardian just died — reward the kill and unseal the chest.
  _openSpecialChest(g) {
    this.score += GUARDIAN.killBonus;
    this.shake = 16; this.flash = 0.6;
    this.particles.sparkle(g.x, g.y, PAL.gold, 40); this.audio.bank();
    this.runGuardiansFelled++;
    if (this.specialChest) this.specialChest.opened = true;
    this._enqueueToast('🗝 THE CHEST OPENS!', PAL.gold || PAL.key, 2.4);
  }
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 7: Commit**

```bash
git add src/minigames/reef/index.js
git commit -m "feat(reef): guardian combat (harpoon + charge) → opens the chest on kill"
```

---

## Task 13: Reef — enter flow into match-3

**Files:**
- Modify: `src/minigames/reef/index.js` — contact test in the `zone === 'reef'` transition block.

**Interfaces:**
- Consumes: `this.specialChest`, `this.reentryT`, `this.host.open`, `this.input.endFrame`, `this.runChestsOpened`.
- Produces: touching an opened chest calls `this.host.open('match3', { source: 'chest' })`, increments `runChestsOpened`, consumes the chest (`= null`), and sets a re-entry grace. The reef pauses under match-3 and resumes on `host.close()`.

- [ ] **Step 1: Add the enter test**

In `update`, inside the `if (this.zone === 'reef') {` block (after the whirlpool entrance check at line ~1495, before the block's closing `}`), add:
```js
      if (this.reentryT <= 0 && this.specialChest && this.specialChest.opened &&
          Math.hypot(d.x - this.specialChest.x, d.y - this.specialChest.y) < this.specialChest.r + d.radius) {
        this.runChestsOpened++;
        this.specialChest = null;             // consume — no re-enter on return
        this.chestGuardian = null;            // (already dead; belt-and-braces)
        this.reentryT = 1.5;                  // grace after match-3 closes
        this.host.open('match3', { source: 'chest' });
        this.input.endFrame(); return;
      }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/minigames/reef/index.js
git commit -m "feat(reef): enter an opened chest → host.open('match3', {source:'chest'})"
```

---

## Task 14: Reef — render the chest + guardian + boss bar + ENTER prompt

**Files:**
- Modify: `src/minigames/reef/index.js` — entity render pass (~2011); boss health bar (~2404-2411).

**Interfaces:**
- Consumes: `this.specialChest`, `this.chestGuardian`, `this.diver`, `this.camX/camY`, `this.t`, `this._text`, `PAL`.
- Produces: a sealed gilded chest that becomes an open glowing chest, the guardian drawn above it, an `⤓ ENTER` prompt when the diver is near an opened chest, and a `⚔ GUARDIAN` boss bar while it's on-screen.

- [ ] **Step 1: Add the chest+guardian draw helper**

Add a method to the `Reef` class (near the other `_draw*` render helpers):
```js
  // Sealed → open ornate chest, with its guardian above it. cx/cy are camera offsets.
  _drawSpecialChest(ctx, cx, cy) {
    const ch = this.specialChest;
    if (ch) {
      const x = ch.x - cx, y = ch.y - cy, gold = PAL.gold || '#d9a441';
      ctx.save();
      // body
      ctx.fillStyle = '#6b4a2b';   // dark wood
      ctx.beginPath(); ctx.roundRect(x - 26, y - 12, 52, 30, 4); ctx.fill();
      // gilt bands
      ctx.strokeStyle = gold; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x - 26, y - 12, 52, 30, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 18); ctx.stroke();
      if (ch.opened) {
        // open lid + glow
        const glow = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 40);
        glow.addColorStop(0, 'rgba(255,220,120,0.9)'); glow.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - 6, 40, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.roundRect(x - 26, y - 30, 52, 14, 4); ctx.fill();
        ctx.strokeStyle = gold; ctx.beginPath(); ctx.roundRect(x - 26, y - 30, 52, 14, 4); ctx.stroke();
        // ENTER prompt when the diver is near
        const d = this.diver;
        if (Math.hypot(d.x - ch.x, d.y - ch.y) < 90) this._text('⤓ ENTER', ch.x - cx, ch.y - 46 - cy, 14, gold, 'center', 'bottom', true);
      } else {
        // sealed lid + lock
        ctx.fillStyle = '#5a3f24'; ctx.beginPath(); ctx.roundRect(x - 26, y - 24, 52, 14, 4); ctx.fill();
        ctx.strokeStyle = gold; ctx.beginPath(); ctx.roundRect(x - 26, y - 24, 52, 14, 4); ctx.stroke();
        ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(x, y - 2, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (this.chestGuardian) this.chestGuardian.draw(ctx, cx, cy, this.t);
  }
```

- [ ] **Step 2: Call the helper in the entity pass**

Next to the kraken draw call (`for (const k of this.krakens) k.draw(ctx, cx, cy, this.t);` at ~2011), add:
```js
      this._drawSpecialChest(ctx, cx, cy);
```

- [ ] **Step 3: Extend the boss health bar**

In the HUD boss-bar block (2404-2411), after the existing kraken bar, add a guardian bar:
```js
    const gg = this.chestGuardian;
    if (gg && gg.hp > 0 && gg.x > this.camX - 140 && gg.x < this.camX + W + 140 && gg.y > this.camY - 140 && gg.y < this.camY + H + 140) {
      const bw3 = 300, bx3 = W / 2 - bw3 / 2, by3 = boss ? 76 : 56;   // sit below the kraken bar if both show
      this._text('⚔ GUARDIAN', W / 2, by3 - 4, 12, PAL.gold || PAL.key, 'center', 'bottom', true);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(bx3, by3, bw3, 10, 5); ctx.fill();
      ctx.fillStyle = PAL.gold || '#d9a441'; ctx.beginPath(); ctx.roundRect(bx3, by3, Math.max(2, bw3 * (gg.hp / gg.maxHp)), 10, 5); ctx.fill();
    }
```

- [ ] **Step 4: Verify typecheck + confirm the game boots without runtime error**

Run: `npm run typecheck`
Expected: PASS.

Then a quick headless smoke of the module graph:
```bash
node -e "import('./src/minigames/reef/index.js').then(()=>console.log('reef module loads')).catch(e=>{console.error(e);process.exit(1)})"
```
Expected: `reef module loads`.

- [ ] **Step 5: Commit**

```bash
git add src/minigames/reef/index.js
git commit -m "feat(reef): render sealed/open chest, guardian, boss bar + ENTER prompt"
```

---

## Task 15: Reef — credit chest/guardian stats at game-over

**Files:**
- Modify: `src/minigames/reef/index.js` — `_runDelta` (1774), `_runStats` (1789).

**Interfaces:**
- Consumes: `this.runChestsOpened`, `this.runGuardiansFelled`.
- Produces: `_runDelta` folds `chestsOpened`/`guardiansFelled` into lifetime totals (drives the Treasure Hunter / Leviathan Slayer tracks); `_runStats` exposes them so the reef awards `firsttreasure`/`guardiandown`. Existing `_gameOver` path persists both — no new call site.

- [ ] **Step 1: Extend `_runDelta`**

Add to the object returned by `_runDelta`:
```js
      chestsOpened: this.runChestsOpened,
      guardiansFelled: this.runGuardiansFelled,
```

- [ ] **Step 2: Extend `_runStats`**

Add to the object returned by `_runStats`:
```js
      chestsOpened: this.runChestsOpened, guardiansFelled: this.runGuardiansFelled,
```

- [ ] **Step 3: Verify typecheck + the meta suites**

Run: `npm run typecheck && node tests/meta/new-badges.test.mjs && node tests/meta/stats-new-keys.test.mjs`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/minigames/reef/index.js
git commit -m "feat(reef): fold chestsOpened/guardiansFelled into run stats + summary"
```

---

## Task 16: Full verification, BUILD bump, deploy, browser E2E

**Files:**
- Modify: `src/version.js:18` (`BUILD`)

- [ ] **Step 1: Run the whole test suite + typecheck**

Run:
```bash
npm run typecheck && for t in $(git ls-files 'tests/**/*.test.mjs'); do echo "== $t"; node "$t" || exit 1; done
```
Expected: typecheck clean; every test prints `ok …`/`passed` and none exit non-zero.

- [ ] **Step 2: Bump BUILD**

In `src/version.js`, set:
```js
export const BUILD = 'p10-guardian-chest-2026-08-24';
```

- [ ] **Step 3: Commit + push (deploy)**

```bash
git add src/version.js
git commit -m "chore(release): BUILD=p10-guardian-chest — guardian chest + Treasure Chest Madness rewards"
git push origin main
```

- [ ] **Step 4: Confirm the deploy went out**

Wait for the Pages Actions run to finish, then confirm the live build stamp:
```bash
curl -s https://evelo2.github.io/Deep-Descent/src/version.js | grep BUILD
```
Expected: `export const BUILD = 'p10-guardian-chest-2026-08-24';`

- [ ] **Step 5: Browser E2E (drive the actual game)**

Load `https://evelo2.github.io/Deep-Descent/` in the browser. To make the chest reliably appear, temporarily raise the odds for testing by opening the dev console and forcing a spawn is not possible without a code hook — instead, verify via the About screen that BUILD matches, then either (a) play reef 1 repeatedly, or (b) equip **Siren's Lure** at the Dry Dock (higher odds) and dive. Verify, in order:
  1. On a chest dive, the `✨ SOMETHING SPECIAL LURKS BELOW…` toast fires at level start.
  2. A guardian orbits the chest in the deep third; the `⚔ GUARDIAN` bar shows when it's on-screen; the chest is sealed.
  3. Harpoon/charge the guardian down → `🗝 THE CHEST OPENS!`, the chest opens and glows.
  4. Swim into the open chest → `⤓ ENTER` prompt → Treasure Chest Madness launches; the reef HUD (air/timer) is frozen underneath.
  5. Clear/bail the match-3 → returns to the dive, air resumes, chest is gone.
  6. Trophy Wall shows the new tracks (Pearl Diver/Gem Cutter/Coin Collector/Demolitionist/Treasure Hunter/Leviathan Slayer) and, once earned, the new badges.

- [ ] **Step 6: Report results to the user**

Summarize what was verified live (with the BUILD stamp) and anything deferred. If a temporary spawn-odds hook was added for testing, revert it in a follow-up commit before finishing.

---

## Self-Review

**1. Spec coverage:**
- Spawn odds ramp + Dry Dock boost → Task 1 (`specialChestChance`) + Task 8 (Siren's Lure) + Task 11 (spawn roll uses `_hasChestRelic`). ✓
- Depth gate (last third) → Task 1 (`minDepthFrac`) + Task 11 (`C.floors().filter(f.y > WH*2/3)`). ✓
- New distinct guardian, kill required → Task 2 (entity) + Task 12 (combat, chest only opens on kill). ✓
- Pause dive / resume → Task 3 + Task 13 (`host.open`/`host.close` stack). ✓
- Per-level salvage (existing) → unchanged; Task 10 keeps `credited: true` so salvage isn't double-counted. ✓
- `host.open(id, ctx)` minor Core enhancement → Task 3. ✓
- Config block A → Task 1. Guardian entity B → Task 2. Chest state C + resets → Task 11. Spawn D → Task 11. Combat + open E → Task 12. Enter flow F → Task 13. Relic G → Task 8 + Task 11 (`_hasChestRelic`). Rendering H → Task 14. ✓
- Accumulators (STAT_KEYS) → Task 4. Tracks (6) → Task 5. Badges (4) → Task 6. Steam manifest → Task 7. ✓
- Credit paths: match-3 stats via `recordRun` on exit → Task 10; reef chest/guardian via `_runDelta`/`_runStats` → Task 15; Steam mirror → Task 7 (manifest) + Task 10/existing `_gameOver` (unlock). ✓
- Testing (pure engine/config, meta, match-3 counting, browser E2E) → Tasks 1,2,3,4,5,6,9 (unit) + Task 16 (E2E). ✓
- Edge cases: no deep floor → `cands.length` guard (Task 11); die mid-fight → chest never opens, stats fold via existing `_gameOver` (Task 15); bail match-3 → chest already consumed (Task 13); reentry grace (Task 13); ctx optional (Task 3). ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step carries real content. The one caveat (Task 14 Step 1) explicitly flags a typo-trap line and tells the implementer to use the clean line; not a placeholder.

**3. Type consistency:** `specialChestChance(reef, boosted)`, `GUARDIAN.{hp,radius,killBonus,range}`, `SPECIAL_CHEST.minDepthFrac`, `Guardian.{hp,maxHp,radius,dead,takeDamage,harpoonHit,hits,update,draw}`, `newMatchAccum/foldMatchStats/matchRunResult`, `_hasChestRelic`, `_openSpecialChest`, `_drawSpecialChest`, `runChestsOpened`/`runGuardiansFelled`, stat keys `m3Pearls/m3Gems/m3Coins/m3Explosions/chestsOpened/guardiansFelled`, track ids `m3pearls/m3gems/m3coins/m3boom/chests/guardian`, badge ids `firsttreasure/guardiandown/comboartist/hoardcleared` — all names are used identically across the tasks that define and consume them.
