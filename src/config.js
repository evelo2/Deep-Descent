// Tuning constants + palette for Deep Descent.
// The playfield is a fixed logical size; the canvas scales to fit the viewport.

export const WORLD = {
  W: 900,          // viewport (screen) width — logical units
  H: 600,          // viewport (screen) height
  WW: 2760,        // full world width  (scrolls in x)
  WH: 4200,        // full world height (scrolls in y)
  SURFACE: 90,     // y of the sea surface line
  OPEN_BAND: 250,  // fully-open sea water down to this y; caves begin below
  CELL: 60,        // cave grid cell size
};

export const DIVER = {
  accel: 640,      // px/s^2 thrust from input
  drag: 2.5,       // velocity damping per second
  buoyancy: 30,    // gentle upward drift (px/s^2) — water lift
  maxSpeed: 250,
  radius: 15,
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

// 2D cave system. A grid is carved by "miner" agents into tunnels, drop-offs
// and chambers, then turned into a smooth distance field for organic rock and
// sliding collision. See systems/cave.js.
export const CAVE = {
  carve: 50,        // px carve radius — wall offset from open-cell centres
  miners: 5,        // parallel miners carving from the surface
  minerSteps: 190,  // steps each miner walks
  branchChance: 0.14,
  wallDamp: 0.2,    // fraction of into-wall velocity retained on a bump
};

// Sharks come in sizes — small darters to big hunters.
export const SHARK = { minScale: 0.7, maxScale: 1.7 };

// The kraken boss — guards a hoard in a deep chamber.
export const KRAKEN = { hp: 8, radius: 54, arms: 7, hitPoints: 120, killBonus: 2500, range: 320 };

// The living whale — a benign giant you can swim into to enter its belly.
export const WHALE = {
  scale: 1.0,        // overall size multiplier (whale is authored ~360px long)
  mouthCycle: 5.5,   // seconds per open/close of the mouth
  drift: 14,         // gentle horizontal drift speed
};

// Ledge-mounted open/close containers (clams & chests). They pulse open and
// shut, release a big air bubble on opening, hold loot (grab while open), and
// bite — costing a life — if they close on the diver.
export const SHELL = {
  clamRadius: 40, clamCycle: 4.8,   // rattle → slow open → hold → snap shut
  chestRadius: 36, chestCycle: 6.5,
  openGrab: 0.55,    // openness above which loot can be grabbed
  biteShut: 0.30,    // openness below which a closing shell bites
};

// Big collectible air bubbles released when a shell opens.
export const BUBBLE = { air: 22, rise: 44, r: 18, life: 7 };

// Water currents that sweep the diver along.
export const CURRENT = { accel: 360 };   // push acceleration (px/s^2)

// Shared open/close envelope for all shells (clams, chests, vents). Maps a cycle
// phase p∈[0,1) to { open, shake }: closed with a building rattle (a bubble
// forming) → slow eased open → hold open → fast snap shut.
export function shellShape(p) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (u) => u * u * (3 - 2 * u);
  if (p < 0.44) return { open: 0, shake: p > 0.30 ? clamp01((p - 0.30) / 0.14) : 0 };
  if (p < 0.60) return { open: smooth((p - 0.44) / 0.16), shake: 0 };  // slow open
  if (p < 0.90) return { open: 1, shake: 0 };                           // hold open
  if (p < 0.94) return { open: 1 - (p - 0.90) / 0.04, shake: 0 };       // snap shut
  return { open: 0, shake: 0 };
}

// Harpoon gun.
export const HARPOON = {
  speed: 640,
  life: 0.85,      // seconds before it fizzles
  cooldown: 0.5,
  length: 28,
};

// Points awarded for spearing each creature type.
export const KILL_POINTS = { Shark: 300, Octopus: 200, Puffer: 150, Jelly: 100, Eel: 250, Angler: 400 };

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
  kraken:      '#7a3b6b',
  krakenDark:  '#45203f',
  krakenEye:   '#ffd34d',
  whale:       '#4a6d86',
  whaleDark:   '#2f4a5e',
  whaleBelly:  '#9fb8c8',
  fleshRock:   '#7a3944',
  fleshDark:   '#3f1c25',
  membrane:    '#c76b74',
  templeRock:  '#6a5c46',
  templeDark:  '#37301f',
  templeRim:   '#a4906a',
  gateGlow:    '#8fe6ff',
  key:         '#ffd35c',
  keyDark:     '#c99a2b',
  door:        '#8a7a5c',
  doorDark:    '#4a3f2c',
  rib:         '#e9e2cf',
  throat:      '#ffd27a',
  kelp:        '#2fae7d',
  kelpDark:    '#1c7d5b',
  coral:       '#ff8f6b',
  coralPink:   '#ff6fa5',
  coralGold:   '#ffc861',
  anemone:     '#b06bff',
  anemoneTip:  '#ffd1f5',
  polyp:       '#66f0d8',
};

export const KEYMAP = {
  up:    ['ArrowUp', 'KeyW'],
  down:  ['ArrowDown', 'KeyS'],
  left:  ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  pause: ['KeyP', 'Escape'],
  mute:  ['KeyM'],
};
