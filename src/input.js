// Unified input: keyboard + touch → a normalised intent vector {x, y} in [-1,1],
// plus edge-triggered actions (pause, mute).
import { KEYMAP } from './config.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.touch = { x: 0, y: 0, active: false };
    this._pressed = new Set();   // edge buffer for one-shot actions
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this._pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Virtual joystick: touch anywhere, drag from the initial touch point.
    const origin = { x: 0, y: 0 };
    const onStart = (e) => {
      const t = e.changedTouches[0];
      origin.x = t.clientX; origin.y = t.clientY;
      this.touch.active = true; this.touch.x = 0; this.touch.y = 0;
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!this.touch.active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
      const R = 60;
      this.touch.x = Math.max(-1, Math.min(1, dx / R));
      this.touch.y = Math.max(-1, Math.min(1, dy / R));
      e.preventDefault();
    };
    const onEnd = (e) => { this.touch.active = false; this.touch.x = 0; this.touch.y = 0; e.preventDefault(); };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: false });
    canvas.addEventListener('touchcancel', onEnd, { passive: false });
  }

  _isGameKey(code) {
    return Object.values(KEYMAP).some((arr) => arr.includes(code));
  }

  _any(action) { return KEYMAP[action].some((c) => this.keys.has(c)); }

  // Edge-triggered: true once per physical press.
  pressed(action) {
    const hit = KEYMAP[action].find((c) => this._pressed.has(c));
    if (hit) { this._pressed.delete(hit); return true; }
    return false;
  }

  // Continuous movement intent.
  vector() {
    let x = 0, y = 0;
    if (this._any('left')) x -= 1;
    if (this._any('right')) x += 1;
    if (this._any('up')) y -= 1;
    if (this._any('down')) y += 1;
    if (this.touch.active) { x += this.touch.x; y += this.touch.y; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  // Clear the edge buffer at end of frame for any keys not consumed.
  endFrame() { this._pressed.clear(); }
}
