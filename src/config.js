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
  drainPerSec: 2.6,     // baseline air use (eased for a little more breathing room)
  drainDepthFactor: 0.00072, // extra drain the deeper you are
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
};

// Sharks come in sizes — small darters to big hunters.
export const SHARK = { minScale: 0.7, maxScale: 1.7 };

// The kraken boss — guards a hoard in a deep chamber.
export const KRAKEN = { hp: 8, radius: 54, arms: 7, hitPoints: 120, killBonus: 2500, range: 320 };

// Per-reef objective: bank the relic OR bank the points goal to sail on.
export const RELIC = {
  value: 2000,          // score for banking the relic (the primary way to sail on)
  goalBase: 8000,       // high points fallback for reef 1 (grind-heavy alternative)
  goalPerReef: 1500,    // added per reef
  types: ['anchor', 'statue', 'map', 'idol'],
};

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

// Gold economy: banking carried loot at the boat or a dive bell yields full
// score points plus gold (a fraction of the value) to spend on gear.
export const GOLD = { rate: 0.5 };       // gold earned per point of loot banked

// Weapons. The harpoon is always carried; the rest are unlocked/bought later.
// Order here is the cycle order; each has a fire cooldown (s) and a HUD glyph.
export const WEAPON_ORDER = ['harpoon', 'net', 'speargun', 'charge', 'shock'];
// Each weapon: fire cooldown, HUD glyph, gold cost to unlock and the reef it
// first appears in the shop (harpoon is owned from the start). Higher reefs
// surface stronger (and pricier) gear.
export const WEAPON_INFO = {
  harpoon:  { name: 'HARPOON',      cd: 0.52, glyph: '➤', cost: 0,   minReef: 0 },
  net:      { name: 'NET GUN',      cd: 0.75, glyph: '🕸', cost: 150, minReef: 1 },
  shock:    { name: 'SHOCK PROD',   cd: 0.70, glyph: '⚡', cost: 300, minReef: 2 },
  speargun: { name: 'SPEARGUN',     cd: 0.95, glyph: '⋙', cost: 260, minReef: 2 },
  charge:   { name: 'DEPTH CHARGE', cd: 1.15, glyph: '💣', cost: 520, minReef: 3 },
};

// Shop: spend gold at the boat or a dive bell.
export const SHOP = {
  maxWeaponLevel: 3,        // weapons upgrade 1→3, each level boosts its key stat
  weaponUpgradeBase: 200,   // cost to reach level 2 (=base), level 3 (=base*2)
  tankBonus: 25,            // +max air per tank upgrade
  tankBaseCost: 180,        // first tank upgrade
  tankCostGrowth: 140,      // added per subsequent tank level
  tankMaxLevel: 6,
};
export const NET = { speed: 340, range: 340, snare: 4.5, r: 17 };
export const CHARGE = { speed: 250, gravity: 240, up: 70, fuse: 1.5, blast: 115 };
export const SHOCK = { radius: 125, stun: 3.5, knock: 150 };
export const SPEARGUN = { shots: 3, interval: 0.07, spread: 0.06 };

// Dive bells: deep refuel/bank checkpoints so you don't have to surface.
export const BELL = {
  count: 2,          // attempted bells per reef
  minDepthFrac: 0.42, // only place below this fraction of the world height
  radius: 46,        // interaction radius (swim in to dock)
  refillPerSec: 90,  // fast air refill while inside (tops you up quickly)
};

// Power-ups.
export const POWERUP = {
  tankBonus: 30,         // extra max air per tank (persists for the run)
  multifireDuration: 30, // seconds of 3-way harpoon spread per pickup
  spread: 0.28,          // radians between spread shots
  shieldDuration: 8,     // seconds of invulnerability
  speedDuration: 20,     // seconds of faster swimming
  speedMult: 1.6,        // swim accel/max-speed multiplier while boosted
  magnetDuration: 18,    // seconds of treasure magnet
  magnetRadius: 210,     // pull range
  magnetPull: 560,       // pull acceleration toward the diver (px/s^2)
  // Spawn weights by type.
  weights: { tank: 3, multifire: 3, shield: 2, speed: 2, magnet: 2, life: 1 },
};

// Hold-to-aim: holding fire roots the diver in place, swings the aim onto the
// nearest threat, and auto-fires once locked. The "Targeting System" shop
// upgrade speeds the swing and the fire rate; at level 0 it is deliberately
// slow (the standard harpoon is a slow, deliberate weapon).
export const AIM = {
  threshold: 0.14,        // seconds of hold before aim mode engages
  baseRate: 3.0,          // rad/s the aim swings toward target at level 0 (slow)
  ratePerLevel: 2.4,      // extra rad/s per targeting level
  fireMultPerLevel: 0.78, // cooldown ×= this per targeting level (faster fire)
  lockTol: 0.17,          // radians within which it will fire
  range: 720,             // only auto-target threats within this range
  maxLevel: 3,
  cost: [0, 250, 450, 700],  // gold for levels 1..3 (index = current level)
};

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
  bell:        '#c8a24a',
  bellDark:    '#7c5f28',
  bellLight:   '#ffe9a6',
  bellGlass:   '#ffdf8f',
};

export const KEYMAP = {
  up:    ['ArrowUp', 'KeyW'],
  down:  ['ArrowDown', 'KeyS'],
  left:  ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  pause: ['KeyP', 'Escape'],
  mute:  ['KeyM'],
  weaponNext: ['KeyE', 'BracketRight'],
  weaponPrev: ['KeyQ', 'BracketLeft'],
  shop: ['KeyB'],
};
