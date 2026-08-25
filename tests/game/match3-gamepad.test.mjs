// Gamepad support for Treasure Chest Madness (match-3) on handhelds (ROG Ally,
// Steam Deck). Two gaps froze the controls:
//   1. input.poll() added D-pad edges for up(12)/down(13) but NOT left(14)/
//      right(15), so pressed('left')/pressed('right') never fired from the pad
//      → the grid cursor couldn't move sideways.
//   2. The match-3 module read confirm only via pressed('confirm') (Space/Enter)
//      and consumeButton, never consumeStart() — but the gamepad A button feeds
//      _padStart (consumeStart), so A did nothing: no select, no swap, no
//      advancing the win/lose screens.
// These tests stub the Gamepad API + a host so both paths run headless in Node.

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

// --- minimal DOM/gamepad stubs so Input constructs + polls in Node ----------
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.window = globalThis;   // input.js checks `'ontouchstart' in window`
const fakeCanvas = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }) };
let padButtons = new Array(16).fill(0).map(() => ({ pressed: false }));
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [{ connected: true, axes: [0, 0], buttons: padButtons }] },
  configurable: true, writable: true,
});

const { Input } = await import('../../src/input.js');

// 1) D-pad left/right must produce edge-triggered pressed('left'/'right').
{
  const input = new Input(fakeCanvas);
  const setBtn = (i, v) => { padButtons[i] = { pressed: v }; };
  // press D-pad right (15) → poll → pressed('right') true once, then false.
  setBtn(15, true); input.poll();
  check(input.pressed('right') === true, 'D-pad right (button 15) → pressed(right)');
  check(input.pressed('right') === false, "pressed(right) is one-shot (consumed)");
  input.endFrame();
  // press D-pad left (14) → poll → pressed('left') true once.
  setBtn(15, false); setBtn(14, true); input.poll();
  check(input.pressed('left') === true, 'D-pad left (button 14) → pressed(left)');
  input.endFrame();
  padButtons = new Array(16).fill(0).map(() => ({ pressed: false }));
}

// 2) The match-3 module must poll the gamepad itself (the reef is paused while
//    match-3 is active) AND treat the gamepad confirm (consumeStart) as confirm.
//    Modelled faithfully: the A-button edge only becomes readable AFTER poll()
//    runs, so a module that forgets to poll can never see the confirm.
{
  const { makeMatch3 } = await import('../../src/minigames/match3/index.js');
  let polled = false, aHeld = true, padStart = false;
  const input = {
    poll() { polled = true; if (aHeld) padStart = true; },   // reef-style gamepad poll
    pressed() { return false; },
    consumeButton() { return false; },
    consumeStart() { const s = padStart; padStart = false; return s; },
    endFrame() {},
  };
  let seed = 1;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const host = {
    rng, input,
    audio: {}, economy: { earn() {}, state: { salvage: 0 } },
    viewport: { W: 900, H: 600 },
    close() {}, open() {},
  };
  const mod = makeMatch3({ host });
  mod.enter();
  mod.phase = 'play';                 // skip the intro
  mod.cursor = { r: 2, c: 3 };
  check(mod.sel === null, 'no cell selected before any confirm');
  mod.update(1 / 60);
  check(polled === true, 'match-3 polls the gamepad itself (reef is paused while it is active)');
  check(mod.sel && mod.sel.r === 2 && mod.sel.c === 3, 'gamepad A (poll → consumeStart) selects the cursor cell');
}

console.log(`ok match3-gamepad.test.mjs (${pass} checks)`);
