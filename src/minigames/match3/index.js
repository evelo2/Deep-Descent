// @ts-check
// Salvage Match — a match-3 MiniGame (Platform Phase 9). Bring-your-own-engine:
// it ignores host.world and runs its own board update/render, feeding the ONE
// shared economy via host.economy.earn({ salvage }). Menu-launched now (via the
// Core minigame stack, host.open('match3')); designed self-contained so the same
// module drops into a nested reef special-level later. See docs/superpowers/specs.

import { makeBoard, applySwap, legalSwap } from './board.js';
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
    introT: 0, resultT: 0,     // phase timers
    anim: null,                // active resolution animation (steps + cursor + t)
    cursor: { r: 0, c: 0 }, sel: null,   // keyboard/gamepad cursor + first-picked cell

    enter() {
      this.levelIndex = 0;
      this._loadLevel(0);
    },

    _loadLevel(i) {
      const lv = getLevel(i);
      if (!lv) { host.close(this.exit()); return; }   // past the last level → back to menu
      this.levelIndex = i;
      this.level = lv;
      this.board = makeBoard({ cols: 8, rows: 8, types: lv.tiles, rng: host.rng });
      this.progress = 0;
      this.movesLeft = lv.moves;
      this.phase = 'intro';
      this.introT = 0; this.resultT = 0;
      this.anim = null; this.sel = null; this.cursor = { r: 0, c: 0 };
    },

    // Attempt a swap; on success queue its resolution animation, spend a move,
    // and fold cleared target-tiles into progress. Returns true if it matched.
    trySwap(r1, c1, r2, c2) {
      if (this.phase !== 'play' || this.anim) return false;
      if (!legalSwap(this.board, r1, c1, r2, c2)) { host.audio.select && host.audio.select(); return false; }
      const res = applySwap(this.board, r1, c1, r2, c2);
      if (!res.ok) return false;
      this.movesLeft -= 1;
      this.score += res.score;
      this.progress += res.cleared[this.level.targetTile] || 0;
      this.anim = { steps: res.steps, i: 0, t: 0 };
      host.audio.select && host.audio.select();
      return true;
    },

    // Win when the objective is met; lose when moves run out first.
    _checkGoal() {
      if (this.phase !== 'play') return;
      if (this.progress >= this.level.targetCount) {
        this.phase = 'won'; this.resultT = 0;
        const bonus = leftoverBonus(this.movesLeft);
        host.economy.earn({ salvage: this.level.reward + bonus });   // per-level credit (banks on quit)
      } else if (this.movesLeft <= 0) {
        this.phase = 'lost'; this.resultT = 0;
      }
    },

    _advance() {
      // called after an animation completes to settle the board + re-check goal
      this.anim = null;
      this._checkGoal();
    },

    update(dt) {
      const input = host.input;
      // Advance any running resolution animation (renderer reads anim.i / anim.t).
      if (this.anim) {
        this.anim.t += dt;
        if (this.anim.t >= 0.14) { this.anim.t = 0; this.anim.i++; }
        if (this.anim.i >= this.anim.steps.length) this._advance();
      }
      // Phase transitions on confirm/back.
      const confirm = input.pressed('confirm') || input.consumeButton('confirm') || input.pressed('match3');
      const back = input.pressed('back') || input.consumeButton('back') || input.pressed('pause');
      if (back) { host.close(this.exit()); input.endFrame && input.endFrame(); return; }
      if (this.phase === 'intro') { this.introT += dt; if (confirm || this.introT > 1.2) this.phase = 'play'; }
      else if (this.phase === 'play') { this._handlePlayInput(input); }
      else if (this.phase === 'won') { this.resultT += dt; if (confirm) this._loadLevel(this.levelIndex + 1); }
      else if (this.phase === 'lost') { this.resultT += dt; if (confirm) this._loadLevel(this.levelIndex); }
      input.endFrame && input.endFrame();
    },

    // Cursor + swap input (keyboard/gamepad); mouse/touch swaps are injected by
    // the renderer/host hit-testing calling trySwap directly (Task 8/9).
    _handlePlayInput(input) {
      if (this.anim) return;
      const move = (dr, dc) => { this.cursor.r = Math.max(0, Math.min(this.board.rows - 1, this.cursor.r + dr)); this.cursor.c = Math.max(0, Math.min(this.board.cols - 1, this.cursor.c + dc)); };
      if (input.pressed('up')) move(-1, 0);
      else if (input.pressed('down')) move(1, 0);
      else if (input.pressed('left')) move(0, -1);
      else if (input.pressed('right')) move(0, 1);
      if (input.pressed('confirm') || input.consumeButton('confirm')) {
        if (!this.sel) this.sel = { r: this.cursor.r, c: this.cursor.c };
        else { this.trySwap(this.sel.r, this.sel.c, this.cursor.r, this.cursor.c); this.sel = null; }
      }
    },

    render(ctx) { drawMatch3(ctx, this, host); },

    exit() { return { outcome: this.phase === 'won' ? 'won' : 'bailed', credited: true }; },
  };
  return mod;
}
