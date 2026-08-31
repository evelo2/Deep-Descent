// Control-scheme legend. The player picks how on-screen prompts are labelled:
// Keyboard, Steam Deck, or ROG Ally. Steam Deck and ROG Ally both use the
// Xbox-style ABXY gamepad layout, so they share one prompt vocabulary — only the
// device name shown in the selector differs. Touch prompts are handled separately
// (they're a device fact, not a chosen scheme).

export const SCHEMES = ['keyboard', 'steamdeck', 'rog'];
export const SCHEME_LABEL = { keyboard: 'Keyboard', steamdeck: 'Steam Deck', rog: 'ROG Ally' };
export const isPadScheme = (s) => s === 'steamdeck' || s === 'rog';
export function nextScheme(s) { const i = SCHEMES.indexOf(s); return SCHEMES[(i + 1 + SCHEMES.length) % SCHEMES.length]; }
export function prevScheme(s) { const i = SCHEMES.indexOf(s); return SCHEMES[(i - 1 + SCHEMES.length) % SCHEMES.length]; }

// Per-action prompt fragments: keyboard bindings vs the shared Xbox pad layout
// (see src/input.js for the actual button map these mirror).
const PROMPTS = {
  swim:  { key: 'Arrows / WASD', pad: 'Left stick / D-pad' },
  fire:  { key: 'Space / F',     pad: 'A' },
  aim:   { key: 'hold fire',     pad: 'hold A' },
  swap:  { key: 'Q / E',         pad: 'Y / LB' },
  flare: { key: 'G',             pad: 'LT' },
  torch: { key: 'T',             pad: 'R3' },
  shop:  { key: 'B',             pad: 'B' },
  pause: { key: 'P / Esc',       pad: 'Start' },
  mute:  { key: 'M',             pad: 'Back' },
  jump:  { key: 'Space',         pad: 'A' },
  climb: { key: '↑ / ↓',         pad: 'Stick ↑ / ↓' },
};

// One action's label for the given scheme (falls back to the keyboard label).
export function prompt(scheme, action) {
  const p = PROMPTS[action];
  if (!p) return '';
  return isPadScheme(scheme) ? p.pad : p.key;
}

// The Help screen's CONTROLS page, rebuilt for the chosen scheme.
export function controlsHelpLines(scheme) {
  const g = (a) => prompt(scheme, a);
  return [
    `Swim — ${g('swim')} / drag`,
    `Fire — ${g('fire')} / tap   ·   HOLD to aim the nearest threat, RELEASE to shoot it`,
    `Swap weapon — ${g('swap')}`,
    `Flare — ${g('flare')}   (light up a dark cave)`,
    `Torch — ${g('torch')}   (toggle a battery light; shares the shock-rod battery)`,
    `Shop — ${g('shop')}   at the boat or a dive bell`,
    `Pause — ${g('pause')}     Mute — ${g('mute')}`,
  ];
}

// The always-visible one-line strip (HTML #hint below the canvas + the menu).
export function hintStrip(scheme) {
  const g = (a) => prompt(scheme, a);
  return `${g('swim')} or drag to swim · ${g('fire')} / tap or 2nd-finger fire (hold to aim) · ${g('swap')} swap weapon · ${g('shop')} shop · ${g('pause')} pause`;
}

// The in-stage (platformer) control strip.
export function stageHintStrip(scheme) {
  const g = (a) => prompt(scheme, a);
  return `${g('swim')} walk   ·   ${g('jump')} jump   ·   ${g('climb')} climb ladders   ·   reach the › exit`;
}

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
