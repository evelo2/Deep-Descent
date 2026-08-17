// Tuning constants + palette for Deep Descent.
// The playfield is a fixed logical size; the canvas scales to fit the viewport.

export const WORLD = {
  W: 900,          // logical playfield width
  H: 600,          // logical playfield height (one screen)
  SEABED: 560,     // y of the ocean floor
  SURFACE: 70,     // y of the water surface line
  DEPTH_MAX: 4200, // total dive depth in world units (camera scrolls this far)
};

export const DIVER = {
  accel: 620,      // px/s^2 thrust from input
  drag: 2.4,       // velocity damping per second
  buoyancy: 42,    // slight upward drift (px/s^2) — water lift
  maxSpeed: 240,
  radius: 16,
};

export const AIR = {
  max: 100,
  drainPerSec: 3.2,     // baseline air use
  drainDepthFactor: 0.0009, // extra drain the deeper you are
  refillPerSec: 55,     // refill rate while docked at boat
  ventRefillPerSec: 34, // refill rate while inside a vent's bubble stream
};

// Air vents: bubble clams on ledges emit a rising stream; swim through it to
// refill air. Makes deep cave diving viable without surfacing.
export const VENT = {
  streamHeight: 190,  // how far the bubble column reaches upward
  streamHalfW: 20,    // half-width of the collectible stream
  cycle: 3.4,         // open/emit period (they pulse like the pearl clams)
};

export const GAME = {
  startLives: 3,
  invulnAfterHit: 1.6,  // seconds of mercy invulnerability
  hitCost: 1,           // lives lost per hit
};

// Cave terrain: below the open surface zone, rock walls form a winding corridor
// with wide chambers and narrow passages.
export const CAVE = {
  openEnd: WORLD.SURFACE + 780,  // full-width open water above this depth
  minHalfWidth: 150,             // narrowest passage
  maxHalfWidth: 370,             // widest chamber
  segment: 250,                  // vertical spacing of wall control points
  centerRange: 150,              // how far the corridor centre wanders from mid
  wallDamp: -0.25,               // velocity retained on wall bump (soft)
};

// Harpoon gun.
export const HARPOON = {
  speed: 640,
  life: 0.85,      // seconds before it fizzles
  cooldown: 0.5,
  length: 28,
};

// Points awarded for spearing each creature type.
export const KILL_POINTS = { Shark: 300, Octopus: 200, Puffer: 150, Jelly: 100 };

// Cohesive underwater palette — deep blues → teal, warm treasure accents,
// bioluminescent highlights. Colour is backed by shape/motion for accessibility.
export const PAL = {
  surfaceLight: '#3bb6d9',
  waterTop:    '#1b6f9c',
  waterMid:    '#0d3f66',
  waterDeep:   '#061f3a',
  abyss:       '#02101f',
  seabed:      '#0a2438',
  seabedLight: '#12455f',
  weed:        '#1f8a6d',
  weedDark:    '#136b54',
  diver:       '#ffcf6b',
  diverSuit:   '#2b3a54',
  diverGlass:  '#8fe6ff',
  air:         '#5fe0c8',
  airLow:      '#ff5d5d',
  pearl:       '#f4faff',
  gold:        '#ffcf5c',
  goldDark:    '#d99a2b',
  clam:        '#c98fb0',
  clamDark:    '#8a4f74',
  octo:        '#c65b8a',
  shark:       '#8fa3b8',
  jelly:       '#b98cff',
  puffer:      '#ffa24d',
  bubble:      'rgba(180,230,255,0.55)',
  glow:        '#7ff3ff',
  hudText:     '#eaf6ff',
  danger:      '#ff5d5d',
  rock:        '#22323f',
  rockDark:    '#131f2a',
  rockLight:   '#3a5064',
  rockEdge:    '#0b141c',
  harpoon:     '#dfeaf5',
  harpoonTip:  '#9fb4c8',
  gem:         '#61dcff',
  gemCore:     '#eafcff',
  ventClam:    '#7fd9c4',
  ventClamDk:  '#3f9a86',
};

export const KEYMAP = {
  up:    ['ArrowUp', 'KeyW'],
  down:  ['ArrowDown', 'KeyS'],
  left:  ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  pause: ['KeyP', 'Escape'],
  mute:  ['KeyM'],
};
