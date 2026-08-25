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

    enter() {
      this.levelIndex = 0;
      this._loadLevel(0);
      host.audio.startMatchTheme && host.audio.startMatchTheme();   // looping treasure theme
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
      const madeSpecial = res.steps.some((s) => s.kind === 'clear' && (s.spawns || []).some((sp) => sp.special));
      if (madeSpecial) host.audio.specialSpawn && host.audio.specialSpawn();
      if (res.blasts) host.audio.detonate && host.audio.detonate();
      if (res.chests) host.audio.chestJingle && host.audio.chestJingle();
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
      this.clock += dt;   // free-running; drives the ambient side critters every phase
      // Advance the resolution animation (a time-based replay; the renderer
      // reads anim.t / anim.dur). Settle the board once it completes.
      if (this.anim) {
        this.anim.t += dt;
        if (this.anim.t >= this.anim.dur) this._advance();
      }
      // Read the confirm edge ONCE this frame — input.pressed() consumes the
      // edge, so a second read would return false. Every phase (including the
      // play-phase swap in _handlePlayInput) uses this single value.
      const confirm = input.pressed('confirm') || input.consumeButton('confirm');
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
