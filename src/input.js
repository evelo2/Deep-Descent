// Unified input: keyboard + touch + gamepad → a normalised intent vector
// {x, y} in [-1,1], plus edge-triggered actions (pause, mute, fire, start).
// Gamepad support covers handheld PCs (Steam Deck, ROG Ally, etc.) and any
// controller the browser exposes via the standard Gamepad API.
import { KEYMAP, WORLD } from './config.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.touch = { x: 0, y: 0, active: false };
    this._pressed = new Set();   // edge buffer for one-shot keyboard actions
    this.pad = { x: 0, y: 0 };    // gamepad stick/dpad intent
    this._padPrev = {};           // previous gamepad button states
    this._padEdges = new Set();   // one-shot gamepad actions (pause, mute)
    this._padStart = false;       // gamepad confirm/start edge (menus)
    this.canvas = canvas;
    // On-screen touch buttons (pause/mute/sail): the game sets their logical
    // rects each frame, we hit-test taps against them so touch-only players get
    // the actions that are otherwise keyboard/gamepad-only.
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    this.touchButtons = [];       // [{id, x, y, w, h}] in logical (900×600) units
    this._btnHits = new Set();    // one-shot: buttons tapped this frame
    this._btnTouch = false;       // the active touch landed on a button
    // Unified fire state (keyboard / mouse / gamepad / touch AIM hold). fireDown
    // = held this frame; firePress = rising edge; recomputed each poll().
    this._mouseDown = false; this._padFire = false; this._aimBtnActive = false;
    this._firePrev = false; this.fireDown = false; this.firePress = false;
    addEventListener('mousedown', (e) => { if (e.target === canvas) this._mouseDown = true; });
    addEventListener('mouseup', () => { this._mouseDown = false; });

    addEventListener('keydown', (e) => {
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this._pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Multi-touch controls: the FIRST free finger is a virtual joystick (touch
    // anywhere, drag to steer; a quick tap fires once). A SECOND free finger is
    // FIRE — held, it drives the same fire path as the Space key (tap = a quick
    // shot so you keep swimming; hold = aim-lock), so you can swim and fire at
    // once. Fingers are tracked by identifier so either can lift independently.
    this._tapFire = false;
    this._touchFire = false;        // a second finger is held → fire
    const origin = { x: 0, y: 0, ts: 0, maxDrag: 0 };
    let steerId = null, fireId = null, aimId = null, steerHadSecond = false;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const hit = this._hitButton(t.clientX, t.clientY);
        if (hit === 'aim') { this._aimBtnActive = true; this._btnTouch = true; aimId = t.identifier; continue; }   // hold to aim (tracked by id)
        if (hit) { this._btnHits.add(hit); this._btnTouch = true; continue; }
        if (steerId === null) {
          steerId = t.identifier; steerHadSecond = false;
          origin.x = t.clientX; origin.y = t.clientY; origin.ts = e.timeStamp; origin.maxDrag = 0;
          this.touch.active = true; this.touch.x = 0; this.touch.y = 0;
        } else if (fireId === null) {
          fireId = t.identifier; this._touchFire = true; steerHadSecond = true;
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== steerId) continue;
        const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
        origin.maxDrag = Math.max(origin.maxDrag, Math.hypot(dx, dy));
        const R = 60;
        this.touch.x = Math.max(-1, Math.min(1, dx / R));
        this.touch.y = Math.max(-1, Math.min(1, dy / R));
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === steerId) {
          // A quick tap fires once — but only for a genuine single-finger tap
          // (no second finger present during this press).
          if (origin.maxDrag < 14 && e.timeStamp - origin.ts < 260 && !steerHadSecond) this._tapFire = true;
          steerId = null; this.touch.active = false; this.touch.x = 0; this.touch.y = 0;
        } else if (t.identifier === fireId) {
          fireId = null; this._touchFire = false;
        } else if (t.identifier === aimId) {   // the AIM-hold finger lifted (by id, so tapping other buttons can't cancel aim)
          aimId = null; this._aimBtnActive = false;
        }
      }
      // Menu-start suppression: no button touch is holding while no aim finger is down.
      if (aimId === null) this._btnTouch = false;
      e.preventDefault();
    };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: false });
    canvas.addEventListener('touchcancel', onEnd, { passive: false });
  }

  _isGameKey(code) {
    return Object.values(KEYMAP).some((arr) => arr.includes(code));
  }

  // Map a client (CSS-pixel) point to logical playfield units and return the id
  // of the first touch button it lands on, or null. The canvas letterboxes the
  // logical 900×600 field, so scale by the rendered rect.
  _hitButton(clientX, clientY) {
    if (!this.touchButtons.length) return null;
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const lx = (clientX - r.left) / r.width * WORLD.W;
    const ly = (clientY - r.top) / r.height * WORLD.H;
    for (const b of this.touchButtons) {
      if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) return b.id;
    }
    return null;
  }

  // True once per tap on the given on-screen button.
  consumeButton(id) {
    if (this._btnHits.has(id)) { this._btnHits.delete(id); return true; }
    return false;
  }

  // Mouse support for on-screen buttons: which button (if any) is under a client
  // point, and register a click on it (the game consumes it via consumeButton).
  hitButtonAt(clientX, clientY) { return this._hitButton(clientX, clientY); }
  pressButton(id) { this._btnHits.add(id); }

  _any(action) { return KEYMAP[action].some((c) => this.keys.has(c)); }

  // Poll the first connected gamepad. Called once per frame by the game.
  // Standard mapping: axes 0/1 = left stick; buttons 0=A 1=B 2=X 3=Y, 5/7 =
  // RB/RT, 8=Back 9=Start, 12-15 = D-pad up/down/left/right.
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    let gp = null;
    if (pads) for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.padConnected = !!gp;   // exposed so the game can auto-pick pad prompts
    if (!gp) { this.pad.x = 0; this.pad.y = 0; this._padPrev = {}; this._padFire = false; }
    else {
      const dead = 0.28;
      let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      x = Math.abs(x) > dead ? x : 0; y = Math.abs(y) > dead ? y : 0;
      const B = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (B(14)) x = -1; else if (B(15)) x = 1;
      if (B(12)) y = -1; else if (B(13)) y = 1;
      this.pad.x = x; this.pad.y = y;
      this._padFire = B(0) || B(2) || B(5) || B(7);                       // fire held (drives tap + aim)
      const edge = (i) => B(i) && !this._padPrev[i];
      if (edge(9)) this._padEdges.add('pause');                            // Start → pause
      if (edge(8)) this._padEdges.add('mute');                             // Back → mute
      if (edge(3)) this._padEdges.add('weaponNext');                       // Y → next weapon
      if (edge(4)) this._padEdges.add('weaponPrev');                       // LB → prev weapon
      if (edge(1)) this._padEdges.add('shop');                             // B → open shop (at a station)
      if (edge(6)) this._padEdges.add('flare');                            // LT → light a flare
      if (edge(11)) this._padEdges.add('torch');                           // R3 → toggle torch (provisional; #38 finalizes pad map)
      if (edge(12)) this._padEdges.add('up');                              // D-pad ↑ (menu/shop nav)
      if (edge(13)) this._padEdges.add('down');                            // D-pad ↓ (menu/shop nav)
      if (edge(0) || edge(9)) this._padStart = true;                       // A/Start → confirm on menus
      this._padPrev = {};
      for (let i = 0; i < gp.buttons.length; i++) this._padPrev[i] = gp.buttons[i].pressed;
    }
    // Unified fire state across keyboard / mouse / gamepad (+ touch AIM hold).
    const kb = this.keys.has('Space') || this.keys.has('KeyF') || this.keys.has('Enter');
    const primary = kb || this._mouseDown || this._padFire || this._touchFire;   // sources that also quick-fire on press (2nd-finger fire included)
    this.firePress = primary && !this._firePrev;
    this._firePrev = primary;
    this.fireDown = primary || this._aimBtnActive;                       // any hold engages aim
  }

  // True while a fire control is held (engages hold-to-aim).
  fireHeld() { return this.fireDown; }

  // Edge-triggered action: true once per press (keyboard or gamepad).
  pressed(action) {
    const hit = KEYMAP[action].find((c) => this._pressed.has(c));
    if (hit) { this._pressed.delete(hit); return true; }
    if (this._padEdges.has(action)) { this._padEdges.delete(action); return true; }
    return false;
  }

  // Continuous movement intent (keyboard + touch + gamepad).
  vector() {
    let x = 0, y = 0;
    if (this._any('left')) x -= 1;
    if (this._any('right')) x += 1;
    if (this._any('up')) y -= 1;
    if (this._any('down')) y += 1;
    if (this.touch.active) { x += this.touch.x; y += this.touch.y; }
    x += this.pad.x; y += this.pad.y;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  // True once per quick screen tap or gamepad fire button.
  consumeTapFire() { const f = this._tapFire; this._tapFire = false; return f; }
  // True once per gamepad confirm/start press (used on menus).
  consumeStart() { const s = this._padStart; this._padStart = false; return s; }

  // Clear one-shot edge buffers at end of frame.
  endFrame() { this._pressed.clear(); this._padEdges.clear(); this._btnHits.clear(); }
}
