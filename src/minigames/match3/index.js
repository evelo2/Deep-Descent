// @ts-check
// Salvage Match — a match-3 MiniGame (Platform Phase 9). Bring-your-own-engine:
// it ignores host.world and runs its own board update/render, feeding the ONE
// shared economy via host.economy.earn({ salvage }). Menu-launched now (via the
// Core minigame stack, host.open('match3')); designed self-contained so the same
// module drops into a nested reef special-level later. See docs/superpowers/specs.

import { makeBoard, applySwap, legalSwap } from './board.js';
import { buildTimeline } from './anim.js';
import { getLevel, leftoverBonus } from './levels.js';
import { drawMatch3 } from '../../render/match3.js';

/**
 * @param {{ host: import('../../core/contract.js').Host }} deps
 * @returns {import('../../core/contract.js').MiniGame}
 */
export function makeMatch3({ host }) {
  const mod = {
    id: 'match3',
    name: 'Treasure Chest Madness',   // About-screen display name + version
    version: '1.1.0',                 // 1.1: chest special + ambient + theme + gamepad

    // --- state (armed by enter/_loadLevel) ---
    phase: 'intro',            // 'intro' | 'play' | 'won' | 'lost'
    levelIndex: 0,
    level: /** @type {any} */ (null),
    board: /** @type {any} */ (null),
    progress: 0,               // count of target tiles collected this level
    movesLeft: 0,
    score: 0,
    chestSalvage: 0,           // bonus salvage banked from chest detonations this level
    lastPayout: 0,             // actual salvage credited on the most recent level clear
    clock: 0,                  // free-running seconds — drives ambient side critters (all phases)
    introT: 0, resultT: 0,     // phase timers
    anim: null,                // active resolution animation (steps + cursor + t)
    cursor: { r: 0, c: 0 }, sel: null,   // keyboard/gamepad cursor + first-picked cell
    guide: null,               // active first-time special-guide toast { special, t, dur }
    guideQueue: [],            // pending guides (if several new specials land at once)
    seenSpecials: null,        // Set of special ids the player has already been taught

    enter() {
      this.levelIndex = 0;
      this.seenSpecials = this._loadSeenSpecials();
      this.guide = null; this.guideQueue = [];
      this._loadLevel(0);
      host.audio.startMatchTheme && host.audio.startMatchTheme();   // looping treasure theme
    },

    // First-time special guides are remembered across sessions in localStorage
    // (browser-only; guarded so headless/Node never throws).
    _loadSeenSpecials() {
      try { const s = JSON.parse(localStorage.getItem('tcm.specialsSeen') || '[]'); return new Set(Array.isArray(s) ? s : []); }
      catch (e) { return new Set(); }
    },
    _persistSeenSpecials() {
      try { localStorage.setItem('tcm.specialsSeen', JSON.stringify([...this.seenSpecials])); } catch (e) { /* private mode / no storage */ }
    },
    // Queue a guide toast for each special in `created` the player hasn't seen.
    _queueSpecialGuides(created) {
      let fresh = false;
      for (const sp of created) {
        if (this.seenSpecials.has(sp)) continue;
        this.seenSpecials.add(sp); this.guideQueue.push(sp); fresh = true;
      }
      if (fresh) this._persistSeenSpecials();
    },

    _loadLevel(i) {
      const lv = getLevel(i);
      if (!lv) { host.close(this.exit()); return; }   // past the last level → back to menu
      this.levelIndex = i;
      this.level = lv;
      this.board = makeBoard({ cols: 8, rows: 8, types: lv.tiles, rng: host.rng });
      this.progress = 0;
      this.chestSalvage = 0;
      this.movesLeft = lv.moves;
      this.phase = 'intro';
      this.introT = 0; this.resultT = 0;
      this.anim = null; this.sel = null; this.cursor = { r: 0, c: 0 };
    },

    // Deep-copy the tile grid so the renderer can replay the swap→pop animation
    // while the engine (which resolves synchronously) already holds the settled
    // result in this.board.
    _snapshot() {
      return this.board.tiles.map((row) => row.map((t) => (t ? { type: t.type, special: t.special, axis: t.axis } : null)));
    },

    // Attempt a swap; on success build a full resolution timeline, spend a move,
    // and fold cleared target-tiles into progress. Returns true if it matched.
    // The engine settles this.board immediately; `anim` drives a time-based
    // replay of EVERY cascade pass (swap → clear/burst → fall → refill) plus
    // collect-flyers that arc into the HUD counter, and gates input until it
    // finishes. `progressStart` lets the renderer count the objective up as the
    // flyers land rather than snapping the moment the swap resolves.
    trySwap(r1, c1, r2, c2) {
      if (this.phase !== 'play' || this.anim) return false;
      if (!legalSwap(this.board, r1, c1, r2, c2)) { host.audio.select && host.audio.select(); return false; }
      const pre = this._snapshot();                         // grid BEFORE the swap
      const res = applySwap(this.board, r1, c1, r2, c2);
      if (!res.ok) return false;
      this.movesLeft -= 1;
      this.score += res.score;
      this.chestSalvage += (res.chests || 0) * 3;   // each chest banks a little bonus salvage
      const progressStart = this.progress;
      this.progress += res.cleared[this.level.targetTile] || 0;
      const tl = buildTimeline(pre, res.steps, this.level.targetTile, this.board.tiles);
      // Hold the animation until both the cascade beats AND the flyers finish.
      this.anim = { ...tl, t: 0, progressStart, dur: Math.max(tl.totalDur, tl.flyersEndT) };
      host.audio.select && host.audio.select();
      // Match SFX: a chime when a special is created, a boom when one detonates,
      // and a sparkle when a treasure chest pops.
      const created = new Set();
      for (const s of res.steps) if (s.kind === 'clear') for (const sp of (s.spawns || [])) if (sp.special) created.add(sp.special);
      if (created.size) host.audio.specialSpawn && host.audio.specialSpawn();
      if (res.blasts) host.audio.detonate && host.audio.detonate();
      if (res.chests) host.audio.chestJingle && host.audio.chestJingle();
      // First time a player makes each special, flash up a guide for what it does.
      this._queueSpecialGuides(created);
      return true;
    },

    // Win when the objective is met; lose when moves run out first.
    _checkGoal() {
      if (this.phase !== 'play') return;
      if (this.progress >= this.level.targetCount) {
        this.phase = 'won'; this.resultT = 0;
        const bonus = leftoverBonus(this.movesLeft);
        this.lastPayout = this.level.reward + bonus + this.chestSalvage;
        host.economy.earn({ salvage: this.lastPayout });   // per-level credit (banks on quit)
        host.audio.levelClear && host.audio.levelClear();
      } else if (this.movesLeft <= 0) {
        this.phase = 'lost'; this.resultT = 0;
      }
    },

    // Advance a non-play phase from a pointer tap (touch has no confirm key;
    // mirrors the confirm handling in update()). No-op during play.
    _pointerAdvance() {
      if (this.phase === 'intro') this.phase = 'play';
      else if (this.phase === 'won') this._loadLevel(this.levelIndex + 1);
      else if (this.phase === 'lost') this._loadLevel(this.levelIndex);
    },

    _advance() {
      // called after an animation completes to settle the board + re-check goal
      this.anim = null;
      this._checkGoal();
    },

    update(dt) {
      const input = host.input;
      // Poll the gamepad HERE: while match-3 is the active minigame the reef is
      // paused and never runs its own input.poll(), so without this the pad is
      // never read — A/confirm and the D-pad were dead on handhelds (ROG Ally),
      // even though keyboard/touch (event-driven) worked. Must run before any
      // pressed()/consumeStart() below.
      input.poll && input.poll();
      this.clock += dt;   // free-running; drives the ambient side critters every phase
      // Advance / dequeue the first-time special guide toast (non-blocking).
      if (this.guide) { this.guide.t += dt; if (this.guide.t >= this.guide.dur) this.guide = null; }
      if (!this.guide && this.guideQueue.length) this.guide = { special: this.guideQueue.shift(), t: 0, dur: 4.5 };
      // Advance the resolution animation (a time-based replay; the renderer
      // reads anim.t / anim.dur). Settle the board once it completes.
      if (this.anim) {
        this.anim.t += dt;
        if (this.anim.t >= this.anim.dur) this._advance();
      }
      // Read the confirm edge ONCE this frame — input.pressed() consumes the
      // edge, so a second read would return false. Every phase (including the
      // play-phase swap in _handlePlayInput) uses this single value.
      // consumeStart() = the gamepad A/Start edge (handhelds: ROG Ally, Steam
      // Deck). Without it, A did nothing here — no select, no swap, no advancing
      // the win/lose screens. Start also raises the 'pause' edge, so `back` below
      // still exits on Start; A (no pause edge) confirms.
      const confirm = input.pressed('confirm') || input.consumeButton('confirm') || input.consumeStart();
      const back = input.pressed('back') || input.consumeButton('back') || input.pressed('pause');
      if (back) { host.close(this.exit()); input.endFrame && input.endFrame(); return; }
      // The launch key (N) also begins the intro, but must NOT count as a swap.
      if (this.phase === 'intro') { this.introT += dt; if (confirm || input.pressed('match3') || this.introT > 1.2) this.phase = 'play'; }
      else if (this.phase === 'play') { this._handlePlayInput(input, confirm); }
      else if (this.phase === 'won') { this.resultT += dt; if (confirm) this._loadLevel(this.levelIndex + 1); }
      else if (this.phase === 'lost') { this.resultT += dt; if (confirm) this._loadLevel(this.levelIndex); }
      input.endFrame && input.endFrame();
    },

    // Cursor + swap input (keyboard/gamepad); mouse/touch swaps are injected by
    // the renderer/host hit-testing calling trySwap directly (Task 8/9).
    // `confirm` is the confirm edge already read (once) by update(), passed in
    // because input.pressed() consumes it and can't be read a second time.
    _handlePlayInput(input, confirm) {
      if (this.anim) return;
      const move = (dr, dc) => { this.cursor.r = Math.max(0, Math.min(this.board.rows - 1, this.cursor.r + dr)); this.cursor.c = Math.max(0, Math.min(this.board.cols - 1, this.cursor.c + dc)); };
      if (input.pressed('up')) move(-1, 0);
      else if (input.pressed('down')) move(1, 0);
      else if (input.pressed('left')) move(0, -1);
      else if (input.pressed('right')) move(0, 1);
      if (confirm) {
        if (!this.sel) this.sel = { r: this.cursor.r, c: this.cursor.c };
        else { this.trySwap(this.sel.r, this.sel.c, this.cursor.r, this.cursor.c); this.sel = null; }
      }
    },

    render(ctx) { drawMatch3(ctx, this, host); },

    exit() {
      host.audio.stopMatchTheme && host.audio.stopMatchTheme();   // silence the looping theme on close
      return { outcome: this.phase === 'won' ? 'won' : 'bailed', credited: true };
    },
  };
  return mod;
}
