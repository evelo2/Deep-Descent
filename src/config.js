// Tuning constants + palette for Deep Descent.
// The playfield has a fixed 900×600 "core"; the VISIBLE logical viewport flexes
// to the device aspect so the canvas fills the screen (see computeViewport).

export const WORLD = {
  W: 900,          // viewport (screen) width — logical units (live; see computeViewport)
  H: 600,          // viewport (screen) height (live)
  WW: 2760,        // full world width  (scrolls in x)
  WH: 4200,        // full world height (scrolls in y)
  SURFACE: 90,     // y of the sea surface line
  OPEN_BAND: 250,  // fully-open sea water down to this y; caves begin below
  CELL: 60,        // cave grid cell size
};

// The 900×600 core is the design reference; the visible logical viewport is
// extended along the LONG axis to match the device aspect so the canvas fills
// the screen instead of letterboxing inside a fixed 3:2 box. The core is always
// fully visible; extension is clamped so the view never gets extreme (an extreme
// portrait phone keeps gentle top/bottom bars rather than an absurdly tall view).
// Pure + DOM-free so it's unit-testable; main.js feeds it window.inner{Width,Height}.
export const VIEWPORT = { coreW: 900, coreH: 600, maxW: 1500, maxH: 1050 };
export function computeViewport(vw, vh, cfg = VIEWPORT) {
  const { coreW, coreH, maxW, maxH } = cfg;
  const aspect = vw / vh;
  if (aspect >= coreW / coreH) {
    // wider than 3:2 → keep the core height, extend the width to fill
    return { w: Math.round(Math.min(Math.max(coreH * aspect, coreW), maxW)), h: coreH };
  }
  // taller than 3:2 → keep the core width, extend the height to fill
  return { w: coreW, h: Math.round(Math.min(Math.max(coreW / aspect, coreH), maxH)) };
}

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
  hitLootPenalty: 0.3,  // fraction of un-banked carried loot lost on a hit (stakes)
  maxLives: 5,          // extra lives can't bank past this — no snowball
  firstLifeScore: 8000, // score for the first extra life (was a flat 5000)
  lifeScoreStep: 6000,  // additional score required per subsequent extra life
  // Each new reef bites harder: air drains this much faster per reef (15% each),
  // capped, on top of the creature-count/size scaling.
  oxygenPenaltyPerReef: 0.15,
  oxygenPenaltyCap: 8,
  pearlMinDepthFrac: 0.16,   // clams (pearls) only spawn below this fraction of the world
  exitAirRefillFrac: 0.5,    // leaving ANY special level tops up air by up to this fraction of the tank
  // Ambient combat encounter (a whale OR a kraken) — a flat, modest roll so even
  // early reefs feel alive without piling on bonus-zone portals.
  ambientEncounterChance: 0.35,
  // Bonus-zone portals (temple / stage / abyss / whirlpool) are reef-GATED: rare
  // early, ramping with depth, and AT MOST ONE per reef. Chance of a portal
  // appearing = min(cap, base + perReef * (reef - 1)). See bonusZoneChance().
  bonusZone: { base: 0.02, perReef: 0.07, cap: 0.60 },
};

// 2D cave system. A grid is carved by "miner" agents into tunnels, drop-offs
// and chambers, then turned into a smooth distance field for organic rock and
// sliding collision. See systems/cave.js.
export const CAVE = {
  carve: 50,        // px carve radius — wall offset from open-cell centres
  miners: 5,        // parallel miners carving from the surface (reef 1 baseline)
  minerSteps: 190,  // steps each miner walks (reef 1 baseline)
  branchChance: 0.14,
  // Reef scaling: deeper reefs carve denser, multi-route networks — more miners,
  // longer tunnels, and more forks — so the map opens from a sparse single route
  // into a sprawling maze to explore. Reef 1 keeps the baseline exactly.
  minersPerReef: 1.2, stepsPerReef: 22, branchPerReef: 0.022,
  branchMax: 0.30, minerCap: 16, concurrentCapBase: 44,
};

// Per-reef cave generation parameters (pure/Node-testable). reef 1 → baseline.
// `shafts` = parallel top→bottom descent routes spread across the width (so a
// deep reef has many routes, not one); `wanderers` = horizontal-biased miners
// that weave between them and carve chambers. Both grow with reef, opening the
// map from a single corridor into a sprawling multi-route network.
export function caveParams(reef = 1) {
  const r = Math.max(0, (Math.floor(reef) || 1) - 1);
  return {
    shafts: Math.min(5, 1 + Math.floor(r / 3)),
    wanderers: Math.min(CAVE.minerCap, Math.round(CAVE.miners - 1 + r * CAVE.minersPerReef)),
    steps: Math.round(CAVE.minerSteps + r * CAVE.stepsPerReef),
    branch: Math.min(CAVE.branchMax, CAVE.branchChance + r * CAVE.branchPerReef),
    concurrentCap: Math.min(120, CAVE.concurrentCapBase + r * 8),
    maxIters: 4000 + r * 900,
  };
}

// Sharks come in sizes — small darters to big hunters.
export const SHARK = { minScale: 0.7, maxScale: 1.7 };

// The kraken boss — guards a hoard in a deep chamber.
export const KRAKEN = { hp: 8, radius: 54, arms: 7, hitPoints: 120, killBonus: 2500, range: 320 };

// Per-reef objective: bank the relic OR bank the points goal to sail on.
export const RELIC = {
  value: 2000,          // score for banking the relic (the primary way to sail on)
  goalBase: 12000,      // high points fallback for reef 1 (grind-heavy alternative)
  goalPerReef: 2500,    // added per reef
  types: ['anchor', 'statue', 'map', 'idol'],
};

// Display name + glyph per relic type — for the reef-intro relic flash.
export const RELIC_INFO = {
  anchor: { name: 'Ancient Anchor', glyph: '⚓' },
  statue: { name: 'Sunken Statue',  glyph: '🗿' },
  map:    { name: 'Treasure Map',   glyph: '🗺️' },
  idol:   { name: 'Golden Idol',    glyph: '🪙' },
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
  // Rare deep GIANT clam with a golden pearl — a trophy worth score+gold AND a
  // chunk of Salvage. ~one per deep reef (giantChance), only below giantMinDepthFrac.
  giantRadius: 64, giantValue: 1600, giantSalvage: 40,
  giantChance: 0.4, giantMinDepthFrac: 0.62,
};

// Big collectible air bubbles released when a shell opens.
export const BUBBLE = { air: 22, rise: 44, r: 18, life: 7 };

// Water currents that sweep the diver along.
export const CURRENT = { accel: 360 };   // push acceleration (px/s^2)

// Gold economy: banking carried loot at the boat or a dive bell yields full
// score points plus gold (a fraction of the value) to spend on gear.
export const GOLD = { rate: 0.2 };       // gold earned per point of loot banked

// Salvage: the persistent meta-progression currency (The Salvage Log). Earned
// at the end of every run — win OR death — from milestones. Starting values;
// a later balance pass tunes these.
export const SALVAGE = { perReef: 8, perBoss: 40, perRelic: 15, perPearl: 30, startSlots: 2, maxSlots: 5, slotCostBase: 200 };
// Salvage-Log rentals: relics are rented for a number of DIVES (one run each),
// ticking down only on dives where the relic was equipped. Rent/renew refills to
// `dives`; `maxDives` is the load-time sanitize cap.
export const RENTAL = { dives: 20, maxDives: 999 };
// Reef-skip relics: finding a reef's objective relic banks a one-use token to
// start a new run one reef deeper, with goldPerReef × (startReef − 1) head-start.
export const SKIP = { goldPerReef: 500 };

// Treasure-sweep bonus: collecting this fraction of a reef's loose treasure
// awards this much Salvage (once each), rewarding a thorough clean-out.
export const COLLECT_BONUS = [[0.8, 10], [0.9, 20], [1.0, 50]];

// Dark caves: pitch-black chambers that only light up around a burning flare.
// They hide rich loot, so a flare is the price of admission.
export const DARKZONE = {
  count: 2,             // attempted dark rooms per reef
  minDepthFrac: 0.38,   // only place below this fraction of the world
  radius: 360,          // room radius
  unlitAlpha: 0.99,     // near-total black past the diver's tiny unlit view
  litAlpha: 0.8,        // still meaningfully dark even with a flare burning
  falloff: 120,         // px over which the black closes in past the visible radius
};
// Torch: a battery-powered sustained light for dark caves. Standalone shop item;
// shares the shock-rod battery (SHOCK.batteryMax) — light now vs. zaps later.
export const TORCH = {
  cost: 350,        // shop price (deliberately a commitment)
  minReef: 2,       // shop-gate: appears from reef 2
  litRadius: 250,   // dark-cave visible radius while lit (unlit 52 < this < flare 300)
  drain: 8,         // battery drained per second while lit (~12.5s on a full battery)
};
export const FLARE = {
  startCount: 2,
  duration: 16,         // seconds a flare burns (long, to offset the darker caves)
  litRadius: 300,       // visible radius while a flare is lit
  diverRadius: 52,      // small dim radius you can see without a flare
  pack: 3, packCost: 90, // shop pack
  findMin: 1, findMax: 3, // pickup grant
};

// Weapons. The harpoon is always carried; the rest are unlocked/bought later.
// Order here is the cycle order; each has a fire cooldown (s) and a HUD glyph.
export const WEAPON_ORDER = ['harpoon', 'net', 'speargun', 'charge', 'shock'];
// Each weapon: fire cooldown, HUD glyph, gold cost to unlock and the reef it
// first appears in the shop (harpoon is owned from the start). Higher reefs
// surface stronger (and pricier) gear.
export const WEAPON_INFO = {
  // The harpoon is a slow, deliberate weapon: even fully upgraded it fires at
  // most once every 2s (minCd floor), so aimed single shots matter.
  harpoon:  { name: 'HARPOON',      cd: 2.6,  minCd: 2.0, glyph: '➤', cost: 0,   minReef: 0 },
  net:      { name: 'NET GUN',      cd: 0.75, glyph: '🕸', cost: 150, minReef: 1 },
  shock:    { name: 'SHOCK ROD',    cd: 0.55, glyph: '⚡', cost: 6000, minReef: 2 },
  speargun: { name: 'SPEARGUN',     cd: 0.95, glyph: '⋙', cost: 5200, minReef: 2 },
  charge:   { name: 'DEPTH CHARGE', cd: 1.15, glyph: '💣', cost: 520, minReef: 3 },
};

// Shop: spend gold at the boat or a dive bell.
// Upgrade costs all double per level (see game._dblCost). The *Base fields are
// the level-1 price; refills (harpoon/charge packs) are flat.
export const SHOP = {
  maxWeaponLevel: 3,        // weapons upgrade 1→3, each level boosts its key stat
  weaponUpgradeBase: 180,   // weapon level-up base cost (doubles per level)
  tankBonus: 25,            // +max air per tank upgrade
  tankBaseCost: 180,        // tank level-1 cost (doubles per level)
  tankMaxLevel: 6,
  harpoonPack: 10,          // harpoons per purchase
  harpoonPackCost: 70,      // gold per pack (flat refill)
  harpoonCapStep: 10,       // +max harpoons per capacity upgrade
  harpoonCapMaxLevel: 3,
  harpoonCapBase: 200,      // harpoon-capacity level-1 cost (doubles per level)
};
// Timed consumable buffs — bought with gold at the shop, they run a long timer
// OR until death (whichever comes first), then they're spent. Gameplay-tied to
// the core loops (air / mobility / loot) and distinct from the PERMANENT relic
// passives: a per-run gold sink with real risk (you lose it on death). Each
// entry names the run-field flag it flips while active (see game.js buffT).
// `dur` is deliberately long — a run rarely lasts it out, so in practice these
// are "until death". See _shopItems / _shopBuy / the buffT tick + HUD.
export const CONSUMABLE = [
  { id: 'suit',    name: 'Sealed Wetsuit',  glyph: '🧥', cost: 700, dur: 900, minReef: 1, desc: '−35% air drain', airMult: 0.65 },
  { id: 'fins',    name: 'Turbo Fins',      glyph: '🐟', cost: 600, dur: 900, minReef: 1, desc: '+40% swim speed', swimMult: 1.4 },
  { id: 'lantern', name: 'Salvage Lantern', glyph: '🧲', cost: 650, dur: 900, minReef: 2, desc: 'draws in loot',   magnet: true },
];
export const CONSUMABLE_BY_ID = Object.fromEntries(CONSUMABLE.map((c) => [c.id, c]));

// Supply-crate loot table. A crate should MOSTLY refill the staples (harpoons /
// air) and only RARELY cough up a weapon or a consumable buff. Weighted roll in
// game._openCrate; entries whose precondition fails (e.g. no lockable weapon,
// air already full) are skipped and their weight redistributes to the rest.
export const CRATE = {
  weights: { harpoons: 34, air: 28, flares: 14, gold: 10, consumable: 6, weapon: 8 },
  goldFind: 200,     // gold granted by a "gold" crate
};

// Pick a key from `weights` restricted to those whose `allowed[key]` is truthy,
// proportional to weight. `r` is a roll in [0,1). Returns null if nothing is
// allowed. Pure/Node-testable — used for supply-crate contents (see _openCrate).
export function pickWeighted(weights, allowed, r) {
  const keys = Object.keys(weights).filter((k) => allowed[k] && weights[k] > 0);
  if (!keys.length) return null;
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let x = Math.max(0, Math.min(0.999999, r)) * total;
  for (const k of keys) { x -= weights[k]; if (x < 0) return k; }
  return keys[keys.length - 1];
}

export const NET = { speed: 340, range: 340, snare: 4.5, r: 17 };
// Depth charge: a scarce, hand-detonated mine. Click once to throw it (it sinks
// and settles), click again to detonate. The blast reaches 10× the charge's
// size and saps your own air if you're inside it.
export const CHARGE = {
  speed: 250, gravity: 240, up: 70,
  size: 10,             // drawn radius; blast reaches 10× this
  safetyFuse: 12,       // auto-detonates this long after landing if never triggered
  startAmmo: 3, baseMax: 3, capMax: 10,
  refillCost: 250,      // gold per charge (deliberately expensive)
  capCostBase: 300,     // capacity upgrade base cost (doubles per level)
  diverAirLoss: 0.5,    // fraction of current air lost if caught in your own blast
};
// Shock rod: fires a lightning bolt at the nearest creature that then arcs to
// nearby ones (one extra target per upgrade level). Drains a battery that
// recharges slowly, so it can't be spammed.
export const SHOCK = {
  primaryRange: 320,   // range to the first struck creature
  chainRange: 240,     // arc distance from one creature to the next
  stun: 3.5, knock: 150,
  hitsToKill: 2,       // first zap stuns; the second (cumulative) kills the creature
  batteryMax: 100, cost: 40, recharge: 11,   // ~2-3 zaps on a full battery, ~9s to refill
};
export const SPEARGUN = {
  shots: 3, interval: 0.07, spread: 0.06,
  startAmmo: 20,     // spears granted on first acquiring the speargun
  ammoMax: 100,      // capacity ceiling (buy in packs up to here)
  ammoPack: 20,      // spears per shop purchase
  packCost: 450,     // deliberately expensive — the rapid 3-shot burst is strong
};

// Dive bells: deep refuel/bank checkpoints so you don't have to surface.
export const BELL = {
  count: 1,          // attempted bells per reef (scarcer refuel — air matters more)
  minDepthFrac: 0.67, // always at least two-thirds down — a deep-water safe haven
                      // (also keeps the depth-scaled bank discount meaningful)
  radius: 46,        // interaction radius (swim in to dock)
  refillPerSec: 90,  // fast air refill while inside (tops you up quickly)
  // Banking at a bell is an opt-in convenience that costs a depth-scaled cut of
  // the deposit's value (both score and gold); the boat always banks at full.
  // The deeper the bell, the bigger the cut — so the richest deep hauls are the
  // most tempting to carry up to the boat instead. See bellBankRate + _bankLoot.
  bankDiscountMin: 0.10,  // cut at the shallowest bell (at minDepthFrac)
  bankDiscountMax: 0.35,  // cut at a bell right at the world floor
};

// Depth-scaled dive-bell banking multiplier: 1.0 = full value (the boat). A bell
// pays 1 − discount, where the discount ramps from bankDiscountMin (shallow) to
// bankDiscountMax (deep) across the reachable bell depth range.
export function bellBankRate(bellY) {
  const f = Math.max(0, Math.min(1, bellY / WORLD.WH));
  const span = Math.max(1e-6, 1 - BELL.minDepthFrac);
  const t = Math.max(0, Math.min(1, (f - BELL.minDepthFrac) / span));
  return 1 - (BELL.bankDiscountMin + (BELL.bankDiscountMax - BELL.bankDiscountMin) * t);
}

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
  // AIM SPEED (how fast the reticle swings onto a target) is a SEPARATE knob
  // from FIRE SPEED (how often you can shoot, fireMultPerLevel below). You hold
  // to aim and RELEASE to fire, so the swing rate sets how long you must hold to
  // lock, while fireMultPerLevel sets the shot cooldown.
  aimRateBase: 1.5,       // rad/s the reticle swings at level 1 (slower than the old 2.3 — hold to lock)
  aimRatePerLevel: 0.7,   // extra rad/s per Targeting level above unlock (L2 2.2, L3 2.9)
  fireMultPerLevel: 0.78, // fire COOLDOWN ×= this per targeting level (faster fire) — independent of aim
  lockTol: 0.17,          // radians within which the reticle reads as 'locked' (visual cue)
  range: 720,             // only auto-target threats within this range
  unlockLevel: 1,         // auto-aim LOCK is gated: engages only at aimLevel >= this (0 = manual fire only)
  maxLevel: 3,
  baseCost: 250,   // level 1 cost; doubles each subsequent level
};

// Shared open/close envelope for all shells (clams, chests, vents). Maps a cycle
// phase p∈[0,1) to { open, shake }: closed with a building rattle (a bubble
// forming) → slow eased open → hold open → fast snap shut.
export function shellShape(p) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (u) => u * u * (3 - 2 * u);
  if (p < 0.44) return { open: 0, shake: p > 0.30 ? clamp01((p - 0.30) / 0.14) : 0 };  // rattle before opening
  if (p < 0.60) return { open: smooth((p - 0.44) / 0.16), shake: 0 };  // slow open
  if (p < 0.82) return { open: 1, shake: 0 };                          // hold open (calm, grab now)
  if (p < 0.90) return { open: 1, shake: clamp01((p - 0.82) / 0.08) }; // SHUDDER — telegraph the imminent close
  if (p < 0.94) return { open: 1 - (p - 0.90) / 0.04, shake: 1 };      // snap shut (still shuddering)
  return { open: 0, shake: 0 };
}

// Harpoon gun.
export const HARPOON = {
  speed: 640,
  life: 0.85,      // seconds before it fizzles
  cooldown: 0.5,
  length: 28,
  // Harpoons are a consumable: the net gun is your unlimited fallback, the
  // harpoon a limited kill-shot. Start with a partial stock, buy/find more.
  startAmmo: 10,
  baseMax: 20,
  findMin: 1, findMax: 5,   // ground pickups grant this many
};

// Cave-entrance platformer stages. A themed, few-room platform minigame reached
// through a reef entrance (see src/stage/). Fixed 30×20 tile screen at 30px.
export const STAGE = {
  tile: 30, cols: 30, rows: 20,
  gravity: 1500,      // px/s^2 downward
  maxFall: 640,       // terminal fall speed
  walk: 210,          // horizontal walk speed
  jump: 560,          // jump impulse (upward velocity on press when grounded)
  climb: 150,         // ladder climb speed
  bodyW: 20, bodyH: 28,   // diver-on-foot AABB (fits inside a 30px tile)
  moverSpeed: 72,     // patroller / sliding-hazard speed
  respawnInvuln: 1.1, // brief mercy window after respawning at a room start
  cacheValue: 1200,   // final loot cache payout (richer than a normal reef find)
  coinValue: 60, gemValue: 140,   // per 'o' pickup (alternating by theme accent)
  substep: 1 / 120,   // physics sub-step cap so fast falls never tunnel tiles
  entranceR: 42,      // reef-side entrance proximity radius for contains()
  doorGrace: 0.6,     // after entering a room, ignore door tiles this long so a
                      // residual/held input at the transition can't bounce you
                      // straight back out through the adjacent retreat door
  decorPerRoom: [3, 6],   // min..max procedural decor props placed per generated room
};

// The deep-dive abyss — a loot-rich trench off the reef, reached through its
// own entrance (coexists with the reef's whale/kraken/temple/stage special).
// airMult: air drains this much faster while on foot in the abyss (Phase 1;
// the buyable mini-sub in Phase 2 negates it). subCost: gold price of the
// mini-sub (Phase 2). entranceChance: odds a given reef spawns an entrance.
// "The Deep" — a dark trench you enter by boarding a submarine that rests on a
// deep reef floor (free to board — the sub IS the entrance). Inside you pilot the
// sub (headlights only) from a random safe spawn to one of several exit hatches;
// deeper exits pay a bigger Salvage bonus. airMult kept for legacy zones.
export const ABYSS = {
  airMult: 1.5, entranceChance: 0.5,
  entranceMinDepthFrac: 0.6,   // the sub only appears on floors below this depth
  exits: 3,                    // exit hatches to find (deeper ones pay more)
  exitBonusBase: 15,           // Salvage per exit, scaled by its depth fraction
  // Extraction kicker: the FIRST loot grab in the trench trips a countdown — the
  // trench "destabilises". Reach an exit before it hits 0 for a fat time-scaled
  // Salvage bonus; let it lapse and pressure spikes (air drains extractLapseMult
  // faster) until you surface through a hatch. Pure reward-under-pressure — no
  // instant fail. See game._updateExtraction.
  extractSecs: 45,             // countdown length once tripped
  extractBonusBase: 60,        // Salvage for extracting with time to spare (scaled by fraction left)
  extractLapseMult: 2.2,       // air-drain multiplier once the countdown lapses
};

// Sub piloting physics: heavy — slow to accelerate, lots of glide/inertia (low
// drag), but a higher top speed than the nimble diver. Plus its headlights.
export const SUB = {
  accel: 300, drag: 0.9, buoyancy: 4, maxSpeed: 340,
  armor: 4,             // contact hits the hull absorbs before it's breached;
                        // the next hit after that EJECTS the diver (trench haul lost)
  ambient: 104,         // bright glow radius around the hull (the core lit bubble)
  halo: 260,            // soft outer halo — light bleeds this far into the dark, gently
  glowWarm: 0.20,       // strength of the warm additive bloom around the hull
  coneRange: 380,       // headlight throw
  coneHalfAngle: 0.52,  // headlight cone half-angle (rad)
  darkAlpha: 0.95,      // how black the unlit trench is
};

// The whirlpool — a survival sweep off the reef, reached through its own maw
// (independent roll, coexists with the abyss/temple/stage specials). The
// diver is swept DOWN an accelerating shaft (baseSpeed → maxSpeed at accel
// px/s^2) while steering laterally to dodge obstacles; a hit or air-out ends
// the run with NO life lost (see game.js's _exitWhirlpool/_updateWhirlpool).
// tierStep/rewards are Phase 2 (Salvage speed-break payouts); the rest is live
// from Phase 1. shaftHalfW/obstacleR size the shaft and its debris.
// tierSalvageBase/tierScore drive the speed-break payout (see whirlpoolReward
// below): each whirlSpeed tier crossed awards Salvage + score, once, in
// game.js's _updateWhirlpool.
export const WHIRL = {
  entranceChance: 0.5, baseSpeed: 120, accel: 22, maxSpeed: 520, tierStep: 90,
  shaftHalfW: 220, obstacleR: 22, tierSalvageBase: 12, tierScore: 250,
  // Endless survival: obstacles/collectibles stream past forever and density
  // ramps from LOW to high over rampSecs, so a moderate player lasts ~30s. Air
  // drains at a fixed rate (not depth-scaled — depth is unbounded now).
  airDrain: 4.0,          // air/sec while swept (bubbles refill)
  rampSecs: 26,           // time to reach peak obstacle density
  rowGapStart: 560, rowGapEnd: 190,   // vertical px between obstacle rows: sparse → dense
  rowCountMax: 3,         // obstacles per row at peak density (1 at the start)
  bubbleGap: 620, treasureGap: 470, pearlEvery: 9,   // collectible cadence (px)
  safeDrop: 520,          // clear stretch below the drop-in before obstacles begin
  lives: 3,               // obstacle hits the sub can survive before the sweep ends
  hitInvuln: 1.2,         // seconds of i-frames after a hit (so one rock ≠ all lives)
};

// Cumulative Salvage reward for having reached `tier` whirlSpeed breaks —
// monotonic increasing, tier 0 → 0. Pure/exported so it's Node-testable.
// The marginal award for crossing INTO a given tier is
// whirlpoolReward(tier) - whirlpoolReward(tier - 1) = tierSalvageBase * tier,
// so later tiers pay out more (the deeper/faster you survive, the bigger the
// payout) — see game.js's _updateWhirlpool for where that marginal award is
// actually granted, one tier at a time.
export function whirlpoolReward(tier) { return Math.round(WHIRL.tierSalvageBase * tier * (tier + 1) / 2); }

// Points awarded for spearing each creature type.
export const KILL_POINTS = { Shark: 300, Octopus: 200, Puffer: 150, Jelly: 100, Eel: 250, Angler: 400, Piranha: 40, Stonefish: 180, Barracuda: 260, Moray: 240, ElectricRay: 320, Grouper: 300, Urchin: 120, GiantSquid: 900, Parasite: 60, Sentinel: 300 };

// Per-type tuning for creatures (speeds/ranges/points/etc.), keyed by the
// same `k` used in ZONE_FAUNA / spawnCreature (src/entities/spawn.js). Empty
// for the existing roster — their params still live inline in creatures.js;
// later creature tasks add an entry per new archetype here.
export const CREATURES = {
  // Piranha — small swarm hazard: a cluster of fast homing fish, low value each.
  piranha: { speed: 70, count: [6, 9], radius: 9, jitter: 14, shoalHp: 1 },  // shoalHp = shared pool; 1 = one hit clears the swarm. Bump for harder reefs.
  // Stonefish — camouflaged bottom-dweller: near-invisible until lit (flare/
  // torch) or the diver strays within revealRange; contact always damages.
  stonefish: { revealRange: 70, hiddenAlpha: 0.12, radius: 18 },
  // Barracuda — charger: patrols horizontally, winds up (visible tell) when
  // the diver lines up in range + vertically aligned, then dashes straight
  // at them before recovering. A snare cancels a windup/dash.
  barracuda: { patrolSpeed: 60, sightRange: 320, alignBand: 46, windupTime: 0.5, dashSpeed: 420, dashTime: 0.5, recover: 0.7, radius: 20 },
  // Moray — ambusher: anchored in a wall/wreck crevice, hidden until the
  // diver enters strikeRange, then lunges its head out toward them along a
  // 0→reach→0 curve over strikeTime and retracts, with a cooldown before it
  // can strike again. Only the extended head (hidden, it's parked inside the
  // wall at the anchor) is the hazard.
  moray: { strikeRange: 120, reach: 90, strikeTime: 0.35, cooldown: 2.5, radius: 16 },
  // Electric Ray — ranged pulse: drifts slowly, periodically emitting an
  // expanding pulse ring. Both the body AND the ring's leading edge (a band
  // `band` px wide, checked in the overridden hits()) are hazards.
  ray: { pulseR: 130, pulseCycle: 2.4, pulseTime: 0.6, band: 10, driftSpeed: 20, radius: 20 },
  // Grouper — territorial guardian: anchored at a loot node (e.g. a wreck
  // chest). Homes on the diver while they're inside `territory` of the
  // anchor; once they leave, disengages and drifts back toward the anchor
  // (at a slower speed) instead of chasing.
  grouper: { territory: 260, guardSpeed: 70, radius: 22 },
  // Sea Urchin — static/slow-drift spiky contact hazard: net-immune (nothing
  // for the net to grab onto), but dies like any creature to harpoon/spear/
  // charge. driftSpeed is 0 by default — most placements barely move,
  // threading currents/dark rooms into obstacle courses.
  urchin: { driftSpeed: 0, radius: 15 },
  // Giant Squid — deep-water pursuer mini-boss: homes persistently on the
  // diver and lunges (a speed burst) once it closes to lungeRange, then rests
  // before it can lunge again. A small HP pool (chipped down like the Kraken,
  // but simpler — no arms, no boss HP bar) rather than a one-hit kill.
  squid: { cruise: 60, lunge: 240, lungeRange: 220, lungeTime: 0.45, restTime: 0.8, hp: 4, radius: 26 },
  // Gut Parasite — belly-zone reskin of the Piranha: a translucent acid blob
  // that drifts/darts toward the diver the same way, just a touch slower.
  parasite: { speed: 58, radius: 10, jitter: 12 },
  // Stone Sentinel — temple-zone reskin of the Grouper: an animated statue
  // anchored at the key/vault. Identical guard geometry (territory/speed),
  // but gated by a public `awake` flag the temple flips on the key grab —
  // until then it only guards when the diver strays inside `territory`.
  sentinel: { territory: 260, guardSpeed: 66, radius: 24 },
};

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
  abyssRock:   '#1a1430',
  abyssDark:   '#080612',
  abyssRim:    '#5c3fae',
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
  blackPearl:      '#241c33',
  blackPearlSheen: '#b98cff',
  whirlRim:    '#2ee6c8',
  whirlRock:   '#123a3a',
  whirlDark:   '#081f1f',
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
  help: ['KeyH'],
  drydock: ['KeyR'],
  badges: ['KeyB'],   // opens the Trophy Wall on the menu / game-over (shop key is unused there)
  flare: ['KeyG'],
  torch: ['KeyT'],
  controls: ['KeyC'],
};
