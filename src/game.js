// Game orchestration: state machine, 2D world generation, 2D camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, GAME, CAVE, HARPOON, SHARK, SHELL, BUBBLE, PAL } from './config.js';
import { Diver } from './entities/diver.js';
import { Boat } from './entities/boat.js';
import { Clam, Chest } from './entities/shell.js';
import { BigBubble } from './entities/bigbubble.js';
import { Treasure } from './entities/treasure.js';
import { spawnCreature, pickFauna } from './entities/spawn.js';
import { Cave } from './systems/cave.js';
import { Flora } from './render/flora.js';
import { Harpoon } from './entities/harpoon.js';
import { AirVent } from './entities/airvent.js';
import { Wreck } from './entities/wreck.js';
import { Whale } from './entities/whale.js';
import { Kraken } from './entities/kraken.js';
import { Current } from './entities/current.js';
import { PowerUp } from './entities/powerup.js';
import { Relic } from './entities/relic.js';
import { DiveBell } from './entities/divebell.js';
import { Net, DepthCharge, SupplyCrate } from './entities/weapons.js';
import { SCHEMES, SCHEME_LABEL, nextScheme, prevScheme, prompt as ctrlPrompt, controlsHelpLines, hintStrip, stageHintStrip } from './controls.js';
import { KRAKEN, POWERUP, RELIC, GOLD, BELL, bellBankRate, WEAPON_ORDER, WEAPON_INFO, NET, CHARGE, SHOCK, SPEARGUN, SHOP, AIM, DARKZONE, FLARE, TORCH, SALVAGE, ABYSS, WHIRL, whirlpoolReward, DIVER } from './config.js';
import { drawWhaleSkeleton, drawRib, drawThroat, drawTempleGate, drawAbyssMaw, drawWhirlMaw, drawSub, drawKey, drawDoor, drawColumn } from './render/props.js';
import { Stage } from './stage/stage.js';
import { StageEntrance } from './entities/stageentrance.js';
import { THEMES } from './stage/themes.js';
import { makeStageRooms, mulberry32 } from './stage/chunkgen.js';
import { drawStageScene, drawStageHud } from './render/stage.js';
import { STAGE } from './config.js';
import { loadSalvage, saveSalvage, runPayout, bankReefRelic, consumeReefRelic, availableSkips, skipStartGold } from './meta/salvage.js';
import { applyLoadout, RELICS, getRelic } from './meta/relics.js';

const HI_KEY = 'deepdescent.hi';
const HI_REEF_KEY = 'deepdescent.hireef';
const CONTROLS_KEY = 'deepdescent.controls';
// W/H are the VISIBLE logical viewport and flex to fill the device screen
// (main.js sizes them on resize): the 900x600 core is always on screen and the
// long axis is extended out to the edges. They're module-level `let` so all
// HUD / menu / camera layout here — and input.js + render, which read WORLD.W/H
// — follow the live size. WW/WH (the scrollable world) stay fixed.
let { W, H } = WORLD;
const { WW, WH, OPEN_BAND, CELL } = WORLD;

// Called by main.js whenever the viewport resizes/rotates. Updates both the
// module-level W/H used throughout this file and WORLD.W/H used by input.js and
// the render modules, keeping every consumer on one live viewport size.
export function setViewport(w, h) {
  W = w; H = h;
  WORLD.W = w; WORLD.H = h;
}

// Reef flavour: each reef gets a wacky procedural name and a light theme (a
// tag emoji + a faint water tint + themed words mixed into the name).
const REEF_THEMES = [
  { key: 'kelp',     tag: '🌿', tint: [60, 175, 120], adjs: ['Overgrown', 'Mossy', 'Tangled', 'Verdant'], nouns: ['Kelp Forest', 'Seagrass Meadow', 'Weed Bank'] },
  { key: 'volcanic', tag: '🌋', tint: [220, 95, 55],  adjs: ['Smoldering', 'Molten', 'Blistered', 'Scalding'], nouns: ['Caldera', 'Ember Trench', 'Lava Vent'] },
  { key: 'frozen',   tag: '❄',  tint: [120, 185, 235], adjs: ['Frostbitten', 'Glacial', 'Shivering', 'Icebound'], nouns: ['Ice Shelf', 'Frost Grotto', 'Glacier Drop'] },
  { key: 'haunted',  tag: '👻', tint: [155, 115, 205], adjs: ['Haunted', 'Ghostly', 'Whispering', 'Cursed'], nouns: ['Wreckyard', 'Bone Reef', 'Spirit Hollow'] },
  { key: 'neon',     tag: '✨', tint: [90, 220, 215],  adjs: ['Glowing', 'Bioluminescent', 'Electric', 'Radiant'], nouns: ['Glow Gardens', 'Neon Shoals', 'Lantern Deep'] },
  { key: 'junk',     tag: '⚓', tint: [195, 155, 95],  adjs: ['Rusty', 'Crusty', 'Barnacled', 'Salvaged'], nouns: ['Scrapyard', 'Anchor Graveyard', 'Rust Basin'] },
];
const WACKY_ADJ = ['Soggy', 'Bubbly', 'Grumpy', 'Wobbly', 'Sneaky', 'Salty', 'Squishy', 'Giggling', 'Suspicious', 'Sleepy', 'Cranky', 'Slippery', 'Peculiar', 'Ludicrous', 'Damp'];
const WACKY_PLACE = ['Trench', 'Grotto', 'Cove', 'Lagoon', 'Abyss', 'Hollow', 'Gully', 'Chasm', 'Sinkhole', 'Gorge', 'Nook', 'Reef'];
const WACKY_CRITTER = ['Barnacle', 'Anglerfish', 'Urchin', 'Clam', 'Seahorse', 'Eel', 'Jellyfish', 'Octopus', 'Pufferfish', 'Squid'];
const WACKY_NAMES = ['Captain Sniffle', 'Old Barnacle Pete', 'Sir Wobbles', 'Grandma Squid', 'Mad Morgan', 'Bubbles McGee', 'Admiral Flapjack', 'Nana Nautilus'];
const WACKY_OF = ['of Doom', 'of Secrets', 'of Regret', 'of Lost Socks', 'of Whispers', 'of No Return', 'of Questionable Snacks', 'of Eternal Dampness', 'of Mild Peril', 'of the Ancients'];

// How-to-play pages shown on the Help screen.
const HELP_PAGES = [
  { title: '🐟 CONTROLS', id: 'controls', lines: [
    'Swim — Arrows / WASD / drag / left stick',
    'Fire — Space / F / tap / A   ·   HOLD fire to auto-aim the nearest threat',
    'Swap weapon — Q / E   ·   gamepad Y / LB',
    'Flare — G   (light up a dark cave)',
    'Torch — T   (toggle a battery light; shares the shock-rod battery)',
    'Shop — B   at the boat or a dive bell',
    'Pause — P / Esc     Mute — M',
  ] },
  { title: '🔫 WEAPONS', lines: [
    '➤ Harpoon — limited ammo; a slow, hard-hitting kill shot. Buy or find more.',
    '🕸 Net gun — unlimited; snares a creature so you can slip past it.',
    '⋙ Speargun — a rapid three-shot burst; limited spears, restock at the shop.',
    '💣 Depth charge — click to throw, click again to detonate. Huge blast that',
    '     hurts you too — keep clear! Scarce and expensive to restock.',
    '⚡ Shock rod — chain lightning; first zap stuns, a second kills. Battery-fed.',
  ] },
  { title: '🫧 STAY ALIVE', lines: [
    'Air drains constantly — faster the deeper you go, and more each new reef.',
    'Refill at the boat (surface) or a 🔔 dive bell (deep); both bank your loot.',
    'Swim through bubble vents and the bubbles shells puff out to top up air.',
    'Dark caves are pitch black — light a Flare (G) to see. Rich loot hides there.',
    'Run out of air, or take a hit with no lives left, and the dive is over.',
  ] },
  { title: '💰 GOLD & GEAR', lines: [
    'Grab pearls, gems, treasure and relics; bank them for points AND gold.',
    'Spend gold at the shop (boat/bell): unlock & upgrade weapons, air tanks,',
    'targeting, ammo, capacity and flares. Upgrade prices double each level.',
    '⚓ Bank the relic (or hit the points goal), then sail on to a harder reef.',
    'Supply crates and floor pickups give free gear, harpoons and flares.',
  ] },
];

// Cartoon pop-up name + colour flashed up when a power-up is collected.
const PU_INFO = {
  tank:      { name: '+30 AIR!',         col: PAL.air },
  multifire: { name: 'TRIPLE SHOT!',     col: PAL.harpoonTip },
  shield:    { name: 'SHIELD UP!',       col: PAL.gateGlow },
  speed:     { name: 'SPEED FINS!',      col: PAL.air },
  magnet:    { name: 'TREASURE MAGNET!', col: PAL.gold },
  life:      { name: 'EXTRA LIFE!',      col: PAL.diver },
};

// Pure: the effective air-drain multiplier for a given reef number + zone —
// the reef's own depth penalty, times an extra 150% while on foot in the
// abyss. Piloting the mini-sub (`inSub`) negates that abyss factor entirely,
// so it drains at the plain reef rate even at extreme depth.
// A single source of truth shared by update()'s drain path and unit tests.
export function oxygenMultiplier(reef, zone, inSub = false) {
  let m = 1 + GAME.oxygenPenaltyPerReef * Math.min(reef - 1, GAME.oxygenPenaltyCap);
  if (zone === 'abyss' && !inSub) m *= ABYSS.airMult;
  return m;
}

export class Game {
  constructor(ctx, input, audio, particles, background) {
    this.ctx = ctx; this.input = input; this.audio = audio;
    this.particles = particles; this.bg = background;
    this.state = 'menu';                 // menu | playing | paused | gameover
    this.t = 0; this.shake = 0;
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.hi = +(localStorage.getItem(HI_KEY) || 0);
    this.hiReef = +(localStorage.getItem(HI_REEF_KEY) || 1);
    this.meta = loadSalvage();
    // On-screen control legend: Keyboard / Steam Deck / ROG Ally. A saved choice
    // wins; otherwise we start on Keyboard and auto-switch to pad prompts once a
    // gamepad shows up (until the player picks manually).
    const savedScheme = localStorage.getItem(CONTROLS_KEY);
    this.controlScheme = SCHEMES.includes(savedScheme) ? savedScheme : 'keyboard';
    this._schemeManual = !!savedScheme;
    this._applyHintStrip();
    this.diver = new Diver();
    this.boat = new Boat();
    this.flash = 0; this.bankPulse = 0;
    this.harpoons = []; this.nets = []; this.charges = []; this.explosions = []; this.vents = []; this.wrecks = []; this.cave = null; this.flora = null;
    this.shells = []; this.bigBubbles = []; this.skeletons = []; this.whales = []; this.currents = []; this.krakens = [];
    this.zone = 'reef'; this.ribs = []; this.whaleExit = null; this.savedReef = null;
    this.templeGate = null; this.templeExit = null; this.door = null; this.key = null; this.hasKey = false; this.columns = [];
    this.stageEntrances = []; this.stage = null; this._enteredEntrance = null;
    this.abyssEntrance = null; this.abyssExit = null;
    this.whirlEntrance = null; this.whirlExit = null; this.whirlShaft = null; this.whirlObstacles = [];
    this.whirlSpeed = 0; this.whirlScore = 0; this.whirlTier = 0; this.whirlSalvageEarned = 0;
    this.whirlBubbles = []; this.whirlTreasures = [];
    this.hasSub = false; this.inSub = false; this._subHull = false;   // mini-sub: owned/piloting this reef
    this.powerups = []; this.airMax = AIR.max; this.multiFireT = 0; this.bells = []; this.crates = []; this.darkZones = [];
    this.relic = null; this.relicBanked = false; this.carryingRelic = false; this.reefBanked = 0; this.reefGoal = RELIC.goalBase;
    this.reef = 1; this.dockHold = 0; this.sailT = 0; this.zoneFade = 0;
    this.pendingStartReef = 1;   // menu 'START AT' selection (cash a reef relic)
    this.reefName = ''; this.reefTheme = REEF_THEMES[0];
    this.puT = 0; this.puName = ''; this.puCol = '#fff';   // power-up name flourish
    this.diver.reset();
  }

  // ---- lifecycle -------------------------------------------------------
  start(startReef = 1) {
    this.state = 'playing';
    // Reef-skip: a cashed reef relic starts the run deeper with a gold head-start.
    startReef = Math.max(1, Math.floor(startReef) || 1);
    this.score = 0; this.carried = 0; this.gold = skipStartGold(startReef); this.lives = GAME.startLives; this.atBell = null;
    this.airMax = AIR.max; this.air = this.airMax; this.multiFireT = 0;
    // Salvage Log: apply the equipped loadout's relic flags for this run (resets
    // per-run relic state first, so an empty loadout = no behavior change), then
    // fold the Reinforced Lungs bonus into the base air tank.
    applyLoadout(this, this.meta.loadout);
    this.airMax = AIR.max + this._relicAirBonus; this.air = this.airMax;
    this.shieldT = 0; this.speedT = 0; this.magnetT = 0;
    this.nextLifeScore = GAME.firstLifeScore; this.oneUpT = 0;
    this.depthReached = 0; this.fireCd = 0;
    // Per-run Salvage milestone counters (Salvage Log payout at run end).
    this.bossesFelled = 0; this.relicsBanked = 0; this.blackPearlsBanked = 0;
    this.carriedPearls = 0;   // Black Pearls collected but not yet banked — at risk like loot
    // Flash the equipped relics so the player sees their Salvage Log build is live.
    if (this.meta.loadout.length) {
      const names = this.meta.loadout.map((id) => (getRelic(id) ? getRelic(id).name : id)).join('  ·  ');
      this.puName = `⚙ ${names}`; this.puCol = PAL.gateGlow; this.puT = 2.6;
    }
    // Weapons: harpoon owned from the start; the rest are bought at the shop.
    // weapons[] is the equippable (owned) list in cycle order; weaponIdx cycles
    // it. weaponLevel tracks per-weapon upgrade tier (1..maxWeaponLevel).
    // Net gun is the free, unlimited default; the harpoon is a limited-ammo
    // kill-shot you buy/find more of. Both owned from the start.
    this.owned = new Set(['harpoon', 'net']);
    this.weapons = WEAPON_ORDER.filter((w) => this.owned.has(w));
    this.weaponIdx = 0; this.weaponSwapT = 0;
    this.harpoonAmmo = HARPOON.startAmmo; this.harpoonMax = HARPOON.baseMax; this.harpoonCapLevel = 0;
    this.speargunAmmo = 0;   // no speargun at start; granted on first acquiring it
    this.chargeAmmo = CHARGE.startAmmo; this.chargeMax = CHARGE.baseMax; this.chargeCapLevel = 0;
    this.armedCharge = null; this.explosions = [];
    this.flares = FLARE.startCount; this.flareT = 0; this.darkZones = [];
    this.hasTorch = false; this.torchOn = false;   // battery-powered dark-cave light (shop item)
    this._fireGrace = 0.3;   // ignore the fire that started the game
    this.weaponLevel = {}; for (const w of WEAPON_ORDER) this.weaponLevel[w] = 1;
    this.tankLevel = 0; this.shopSel = 0; this.shopDeny = 0;
    // Hold-to-aim state.
    this.aimLevel = 0; this.aiming = false; this.fireHeldT = 0; this.aimAngle = 0; this.aimTarget = null;
    this._prevHolding = false; this._didAim = false;
    this._chargeLock = false;   // a live charge detonates on a *fresh* trigger, not the same hold
    this.nets = []; this.charges = []; this.burst = 0; this.burstT = 0; this.shockT = 0;
    this.shockBattery = SHOCK.batteryMax; this.shockBolts = [];
    this.puT = 0; this.puName = ''; this.reentryT = 0;
    this.won = false; this.newHi = false; this.deathCause = null;
    this.zone = 'reef'; this.savedReef = null; this.reef = startReef;
    // Consume the cashed reef relic (a reef-(N−1) token unlocks a start at reef N)
    // and persist; flash the head-start so the skip is legible.
    if (startReef > 1 && consumeReefRelic(this.meta, startReef - 1)) {
      saveSalvage(this.meta);
      this.puName = `⚓ Skipped to Reef ${startReef} · +${this.gold}g`; this.puCol = PAL.key; this.puT = 2.6;
    }
    this.pendingStartReef = 1;   // reset the menu selection for next time
    this.hasSub = false; this.inSub = false;   // the mini-sub is bought per-reef
    this._newReefName();
    this.diver.reset();
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this._generateWorld();
    // Prospector's Chart: reveal a wider patch of fog around the reef's entry
    // point (bigger than the normal per-frame radius-5 reveal at ~1125).
    if (this._relicChart) this.cave.reveal(this.diver.x, this.diver.y, 14);
    this.audio.select();
  }

  _generateWorld() {
    const C = this.cave = new Cave('reef', this.reef);
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = []; this.skeletons = [];
    this.whales = []; this.ribs = []; this.whaleExit = null; this.currents = []; this.krakens = [];
    this.columns = []; this.door = null; this.key = null; this.templeExit = null; this.hasKey = false; this.powerups = []; this.bells = []; this.crates = []; this.darkZones = [];
    this.stageEntrances = []; this.abyssEntrance = null; this.abyssExit = null;
    this.whirlEntrance = null; this.whirlExit = null; this.whirlShaft = null; this.whirlObstacles = [];
    this.whirlSpeed = 0; this.whirlScore = 0; this.whirlTier = 0; this.whirlSalvageEarned = 0;
    this.whirlBubbles = []; this.whirlTreasures = [];
    const chestValue = (y) => 200 + Math.round((y / WH) * 400);   // 200..600 by depth

    // Clams and chests rest on cave-floor ledges, opening and closing. Pearls
    // (clams) only appear below a minimum depth — the shallows hold chests.
    const pearlMinDepth = WH * GAME.pearlMinDepthFrac;
    for (const f of spread(C.floors(), 34, 150)) {
      if (f.y > pearlMinDepth && Math.random() < 0.62) this.shells.push(new Clam(f.x, f.y - SHELL.clamRadius * 0.35));
      else this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, chestValue(f.y)));
    }
    // Scattered coins & gems drift in open water.
    for (let i = 0; i < 40; i++) {
      const c = C.randomOpen(); if (!c) continue;
      this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.14 + (c.y / WH) * 0.18 ? 'gem' : 'coin'));
    }

    // Air vents on cave walls, spread out.
    for (const w of spread(C.walls(), 14, 360)) this.vents.push(new AirVent(w.x, w.y, w.side));

    // Shipwrecks seated on chamber floors, with a big chest on the deck + gems.
    for (const ch of spread(C.chambers(), 4, 700)) {
      const floorY = C.surfaceBelow(ch.x, ch.y, 300);
      this.wrecks.push(new Wreck(ch.x, floorY - 42));
      const cx = ch.x, cy = floorY - 66;
      this.shells.push(new Chest(cx, cy, chestValue(ch.y) + 200));
      for (let k = 0; k < 3; k++) {
        const tx = ch.x + (Math.random() - 0.5) * 200, ty = floorY - 24 - Math.random() * 60;
        if (!C.isSolid(tx, ty)) this.treasures.push(new Treasure(tx, ty, 'gem'));
      }
      // A wreck guardian (moray/grouper) anchored at the deck chest.
      const we = pickFauna('wreck', this.reef);
      if (we) {
        const g = spawnCreature(we, cx, cy, this.reef, { anchor: { x: cx, y: cy } });
        if (Array.isArray(g)) this.creatures.push(...g); else if (g) this.creatures.push(g);
      }
    }

    // Dive bells: deep refuel/bank checkpoints hanging in roomy chambers.
    let bellSpots = spread(C.chambers(WH * BELL.minDepthFrac), BELL.count, 900);
    if (!bellSpots.length) { const c = C.randomOpen(WH * 0.5); if (c) bellSpots = [c]; }
    for (const s of bellSpots) this.bells.push(new DiveBell(s.x, s.y));

    // A supply crate sometimes drifts in the reef — free gear when you reach it.
    if (Math.random() < 0.5) { const c = C.randomOpen(OPEN_BAND + 300); if (c) this.crates.push(new SupplyCrate(c.x, c.y)); }

    // Dark caves: pitch-black chambers (light a flare) hiding rich loot.
    const darkSpots = spread(C.chambers(WH * DARKZONE.minDepthFrac), DARKZONE.count, 800);
    for (const s of darkSpots) {
      this.darkZones.push({ x: s.x, y: s.y, r: DARKZONE.radius });
      // Reward the dark: a few gems, a flare or two, and a supply crate.
      for (let k = 0; k < 3; k++) {
        const gx = s.x + (Math.random() - 0.5) * 260, gy = s.y + (Math.random() - 0.5) * 200;
        if (!C.isSolid(gx, gy)) this.treasures.push(new Treasure(gx, gy, 'gem'));
      }
      const fc = C.randomOpen(s.y - 120) || s;
      if (Math.hypot(fc.x - s.x, fc.y - s.y) < DARKZONE.radius) this.powerups.push(new PowerUp(fc.x, fc.y, 'flare'));
      this.crates.push(new SupplyCrate(s.x, s.y - 30));
      // A couple of dark-cave creatures lurking inside the zone.
      const dCount = 1 + (Math.random() * 3 | 0);   // 1-3
      for (let k = 0; k < dCount; k++) {
        const dx = s.x + (Math.random() - 0.5) * DARKZONE.radius, dy = s.y + (Math.random() - 0.5) * DARKZONE.radius;
        if (C.isSolid(dx, dy)) continue;
        const de = pickFauna('dark', this.reef); if (!de) continue;
        const spawned = spawnCreature(de, dx, dy, this.reef);
        if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
      }
    }

    // Flora rooted on cave floors — lots of it, for atmosphere.
    this.flora = new Flora(spread(C.floors(), 110, 70));

    // Whale skeletons resting on the deepest floors.
    const deepFloors = C.floors().filter((f) => f.y > WH * 0.72);
    for (const s of spread(deepFloors, 3, 500)) this.skeletons.push({ x: s.x, y: s.y - 6 });

    // Creatures change with depth; density and shark size rise with the reef
    // number so later reefs stay tense even as lives accumulate.
    const nCreatures = 28 + this.reef * 3;                      // 31 → 67 by reef 13 — threat keeps pace
    const sizeUp = Math.min((this.reef - 1) * 0.06, 0.5);      // bigger sharks deeper into a run
    for (let i = 0; i < nCreatures; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const deep = c.y / WH;
      const band = deep < 0.30 ? 'shallow' : deep < 0.62 ? 'mid' : 'deep';
      const entry = pickFauna(band, this.reef); if (!entry) continue;
      const spawned = spawnCreature(entry, c.x, c.y, this.reef, { sizeUp });
      if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
    }

    // Water currents sweep through a few spots — mostly sideways, one downdraft.
    this._makeCurrents(5);
    // A couple of urchins drifting as obstacle hazards near current lanes
    // (reef-gated — nothing spawns below reef 4).
    for (const cur of this.currents.slice(0, 2)) {
      const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
      if (C.isSolid(cx, cy)) continue;
      const ce = pickFauna('current', this.reef); if (!ce) continue;
      const spawned = spawnCreature(ce, cx, cy, this.reef);
      if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
    }

    // At most one special encounter per reef, and only sometimes — so each dive
    // feels different: a whale, a kraken, a temple gate, or just a plain reef.
    this.templeGate = null;
    if (Math.random() < 0.7) {
      const pickOne = (arr) => arr[(Math.random() * arr.length) | 0];
      const roomy = C.chambers(OPEN_BAND + 500);
      const deep = C.chambers(WH * 0.5);
      const gateFloors = C.floors().filter((f) => f.y > WH * 0.3 && f.y < WH * 0.7);
      const stageFloors = C.floors().filter((f) => f.y > OPEN_BAND + 300 && f.y < WH * 0.72);
      const options = [];
      if (roomy.length) options.push('whale');
      if (deep.length) options.push('kraken');
      if (gateFloors.length) options.push('temple');
      if (stageFloors.length) options.push('stage');
      const pick = options.length ? pickOne(options) : null;
      if (pick === 'whale') {
        const s = pickOne(roomy); this.whales.push(new Whale(s.x, s.y - 10));
      } else if (pick === 'kraken') {
        const den = pickOne(deep); this.krakens.push(new Kraken(den.x, den.y));
        for (let k = 0; k < 6; k++) {
          const gx = den.x + (Math.random() - 0.5) * 260, gy = den.y + (Math.random() - 0.5) * 200;
          if (!C.isSolid(gx, gy)) this.treasures.push(new Treasure(gx, gy, Math.random() < 0.6 ? 'gem' : 'coin'));
        }
      } else if (pick === 'temple') {
        const gf = pickOne(gateFloors); this.templeGate = { x: gf.x, y: gf.y - 50, r: 46 };
      } else if (pick === 'stage') {
        const sf = pickOne(stageFloors);
        const theme = THEMES[(Math.random() * THEMES.length) | 0];
        this.stageEntrances.push(new StageEntrance(sf.x, sf.y - STAGE.entranceR, theme));
      }
    }

    // The abyss entrance: an independent extra portal (like the stage
    // entrances) that coexists with whatever special the reef rolled above —
    // a deep trench off to the side, near the floor, gated by its own chance.
    this.abyssEntrance = null;
    {
      const floorSpots = C.floors().filter((f) => f.y > WH * 0.55);
      if (floorSpots.length && Math.random() < ABYSS.entranceChance) {
        const af = floorSpots[(Math.random() * floorSpots.length) | 0];
        this.abyssEntrance = { x: af.x, y: af.y - 50, r: 46 };
      }
    }

    // The whirlpool entrance: another independent extra portal, coexisting
    // with the abyss/stage/temple specials rolled above — a swirling maw near
    // the floor, gated by its own chance. Mirrors the abyss entrance roll.
    this.whirlEntrance = null;
    {
      const floorSpots = C.floors().filter((f) => f.y > WH * 0.55);
      if (floorSpots.length && Math.random() < WHIRL.entranceChance) {
        const wf = floorSpots[(Math.random() * floorSpots.length) | 0];
        this.whirlEntrance = { x: wf.x, y: wf.y - 50, r: 46 };
      }
    }

    // A power-up or two floating in the reef.
    this._makePowerups(1 + (Math.random() < 0.5 ? 1 : 0));

    // Spare harpoons resting on cave floors — replenish your ammo.
    for (const f of spread(C.floors(), 3 + (Math.random() * 2 | 0), 240)) this.powerups.push(new PowerUp(f.x, f.y - 10, 'ammo'));

    // The reef's relic objective + this reef's high points fallback.
    this.reefBanked = 0; this.relicBanked = false; this.carryingRelic = false;
    this.reefGoal = RELIC.goalBase + (this.reef - 1) * RELIC.goalPerReef;
    const rc = C.randomOpen(OPEN_BAND + 400) || C.randomOpen(OPEN_BAND) || { x: WW / 2, y: WH * 0.5 };
    this.relic = new Relic(rc.x, rc.y, RELIC.types[(Math.random() * RELIC.types.length) | 0]);

    // Black Pearls (Salvage Log): 1-2 per reef, seeded deep — the depth itself
    // is the risk, no guardian needed for v1. Banked (not just carried) to
    // convert to persistent Salvage.
    const pearlCount = 1 + (Math.random() < 0.5 ? 1 : 0) + (this._relicEye ? 1 : 0);
    for (let i = 0; i < pearlCount; i++) {
      const pc = C.randomOpen(WH * 0.55);
      if (pc && !C.isSolid(pc.x, pc.y)) this.treasures.push(new Treasure(pc.x, pc.y, 'blackpearl'));
    }

    this._orientShells();
    this._clearCreaturesNearPortals();
  }

  // Keep hazards clear of "portals" — zone entrances/exits and dive stations — so
  // you never arrive at (or get dropped back beside) one straight into an enemy.
  // Call at the end of a generator, once every portal for the zone exists (some
  // reef specials are placed after the creature loop, so this is a cleanup pass).
  // Orient ledge shells to their surroundings: a directional clam is flipped to
  // open toward open water (away from a side wall), and any shell clipping a
  // side wall is nudged clear so it sits flush rather than embedded in rock.
  _orientShells() {
    const C = this.cave; if (!C) return;
    for (const s of this.shells) {
      const r = s.radius;
      const rockR = C.isSolid(s.x + r * 0.85, s.y);
      const rockL = C.isSolid(s.x - r * 0.85, s.y);
      if (rockR && !rockL) { s.facing = -1; s.x -= r * 0.18; }        // wall on right → open left, nudge clear
      else if (rockL && !rockR) { s.facing = 1; s.x += r * 0.18; }    // wall on left → open right, nudge clear
      // both sides rock (tight niche) or open both sides → keep default facing
    }
  }

  _clearCreaturesNearPortals() {
    const portals = [];
    if (this.zone === 'reef') {
      for (const b of this.bells) portals.push({ x: b.x, y: b.y, r: BELL.radius });
      if (this.templeGate) portals.push({ x: this.templeGate.x, y: this.templeGate.y, r: this.templeGate.r });
      for (const w of this.whales) { const m = w.mouthZone(); portals.push({ x: m.x, y: m.y, r: 70 }); }
      for (const e of this.stageEntrances) portals.push({ x: e.x, y: e.y, r: STAGE.entranceR });
      if (this.abyssEntrance) portals.push({ x: this.abyssEntrance.x, y: this.abyssEntrance.y, r: this.abyssEntrance.r });
      if (this.whirlEntrance) portals.push({ x: this.whirlEntrance.x, y: this.whirlEntrance.y, r: this.whirlEntrance.r });
    } else if (this.zone === 'belly' && this.whaleExit) {
      portals.push({ x: this.whaleExit.x, y: this.whaleExit.y, r: this.whaleExit.r });
    } else if (this.zone === 'temple' && this.templeExit) {
      portals.push({ x: this.templeExit.x, y: this.templeExit.y, r: this.templeExit.r });
    } else if (this.zone === 'abyss' && this.abyssExit) {
      portals.push({ x: this.abyssExit.x, y: this.abyssExit.y, r: this.abyssExit.r });
    }
    if (!portals.length) return;
    const clear = 90;   // gap kept beyond the portal's own interaction radius
    this.creatures = this.creatures.filter((cr) =>
      !portals.some((p) => Math.hypot(cr.x - p.x, cr.y - p.y) < p.r + clear + (cr.radius || 14)));
  }

  // Roll a wacky, theme-flavoured name for the upcoming reef.
  _newReefName() {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const theme = pick(REEF_THEMES);
    this.reefTheme = theme;
    const p = (Math.random() * 4) | 0;
    if (p === 0) this.reefName = `The ${pick([...theme.adjs, ...WACKY_ADJ])} ${pick([...theme.nouns, ...WACKY_PLACE])} ${pick(WACKY_OF)}`;
    else if (p === 1) this.reefName = `${pick(WACKY_ADJ)} ${pick(WACKY_CRITTER)} ${pick(WACKY_PLACE)}`;
    else if (p === 2) this.reefName = `${pick(WACKY_NAMES)}’s ${pick([...theme.nouns, ...WACKY_PLACE])}`;
    else this.reefName = `The ${pick(theme.adjs)} ${pick(WACKY_CRITTER)} ${pick(WACKY_PLACE)}`;
  }

  _makePowerups(count) {
    const bag = [];
    for (const [type, w] of Object.entries(POWERUP.weights)) for (let i = 0; i < w; i++) bag.push(type);
    for (let i = 0; i < count; i++) {
      const c = this.cave.randomOpen(OPEN_BAND + 300); if (!c) continue;
      this.powerups.push(new PowerUp(c.x, c.y, bag[(Math.random() * bag.length) | 0]));
    }
  }

  // Open a supply crate: unlock a reef-available weapon you don't own, else
  // upgrade a weapon that isn't maxed, else a stash of gold.
  _openCrate() {
    const d = this.diver;
    const lockable = WEAPON_ORDER.filter((w) => WEAPON_INFO[w].cost > 0 && !this.owned.has(w) && this.reef >= WEAPON_INFO[w].minReef);
    if (lockable.length) {
      const w = lockable[(Math.random() * lockable.length) | 0];
      this.owned.add(w); if (w === 'speargun') this.speargunAmmo = SPEARGUN.startAmmo;
      this._rebuildWeapons(); this.weaponIdx = this.weapons.indexOf(w);
      this.puName = `${WEAPON_INFO[w].name}!`; this.puCol = PAL.gold; this.puT = 1.7;
    } else {
      const upg = WEAPON_ORDER.filter((w) => w !== 'charge' && this.owned.has(w) && this.weaponLevel[w] < SHOP.maxWeaponLevel);
      if (upg.length) {
        const w = upg[(Math.random() * upg.length) | 0]; this.weaponLevel[w] += 1;
        this.puName = `${WEAPON_INFO[w].name} Lv${this.weaponLevel[w]}`; this.puCol = PAL.air; this.puT = 1.7;
      } else {
        this.gold += 200; this.puName = '+200 GOLD!'; this.puCol = PAL.gold; this.puT = 1.7;
      }
    }
    this.particles.sparkle(d.x, d.y, PAL.gold, 26); this.audio.bank();
  }

  // ---- shop (spend gold at the boat or a dive bell) --------------------
  _rebuildWeapons() {
    const cur = this.weapons[this.weaponIdx];
    this.weapons = WEAPON_ORDER.filter((w) => this.owned.has(w));
    this.weaponIdx = Math.max(0, this.weapons.indexOf(cur));
  }

  // The items on offer, given reef (gates unlocks), ownership and levels.
  _shopItems() {
    const items = [];
    // At a dive bell with an un-banked haul: banking is the first shop choice,
    // at the bell's depth-scaled rate (the boat always banks in full, elsewhere).
    if (this.shopWhere === 'bell' && (this.carried > 0 || this.carriedPearls > 0)) {
      const rate = this._relicBellFull ? 1 : (this.atBell ? bellBankRate(this.atBell.y) : 1);
      const value = Math.round(this.carried * rate);
      const pearlBit = this.carriedPearls > 0 ? `  + ${this.carriedPearls}◦ pearls` : '';
      const lootBit = this.carried > 0 ? `${this.carried} → ${value}  (${Math.round(rate * 100)}%)` : 'Black Pearls';
      items.push({ kind: 'bank', id: 'bank', label: `🔔 Bank here — ${lootBit}${pearlBit}`, cost: 0 });
    }
    for (const w of WEAPON_ORDER) {
      const info = WEAPON_INFO[w];
      if (info.cost > 0 && !this.owned.has(w) && this.reef >= info.minReef)
        items.push({ kind: 'weapon', id: w, label: `${info.glyph} Unlock ${info.name}`, cost: info.cost });
    }
    for (const w of WEAPON_ORDER) {
      if (w === 'charge') continue;   // the depth charge upgrades capacity, not level
      if (this.owned.has(w) && this.weaponLevel[w] < SHOP.maxWeaponLevel)
        items.push({ kind: 'upgrade', id: w, label: `${WEAPON_INFO[w].glyph} Upgrade ${WEAPON_INFO[w].name} → Lv${this.weaponLevel[w] + 1}`, cost: this._dblCost(SHOP.weaponUpgradeBase, this.weaponLevel[w] - 1) });
    }
    items.push({ kind: 'flares', id: 'flares', label: `🔥 Flares ×${FLARE.pack}  (have ${this.flares})`, cost: FLARE.packCost });
    if (this.harpoonAmmo < this.harpoonMax)
      items.push({ kind: 'harpoons', id: 'harpoons', label: `➤ Harpoons ×${SHOP.harpoonPack}  (${this.harpoonAmmo}/${this.harpoonMax})`, cost: SHOP.harpoonPackCost });
    if (this.harpoonCapLevel < SHOP.harpoonCapMaxLevel)
      items.push({ kind: 'harpooncap', id: 'harpooncap', label: `➤ Harpoon Capacity +${SHOP.harpoonCapStep} (Lv${this.harpoonCapLevel + 1})`, cost: this._dblCost(SHOP.harpoonCapBase, this.harpoonCapLevel) });
    if (this.owned.has('speargun') && this.speargunAmmo < SPEARGUN.ammoMax)
      items.push({ kind: 'spears', id: 'spears', label: `⋙ Spears ×${SPEARGUN.ammoPack}  (${this.speargunAmmo}/${SPEARGUN.ammoMax})`, cost: SPEARGUN.packCost });
    if (this.owned.has('charge') && this.chargeAmmo < this.chargeMax)
      items.push({ kind: 'charges', id: 'charges', label: `💣 Depth Charge ×1  (${this.chargeAmmo}/${this.chargeMax})`, cost: CHARGE.refillCost });
    if (this.owned.has('charge') && this.chargeMax < CHARGE.capMax)
      items.push({ kind: 'chargecap', id: 'chargecap', label: `💣 Charge Capacity +1 (${this.chargeMax}→${this.chargeMax + 1})`, cost: this._dblCost(CHARGE.capCostBase, this.chargeCapLevel) });
    if (this.aimLevel < AIM.maxLevel)
      items.push({ kind: 'aim', id: 'aim', label: `🎯 Targeting System → Lv${this.aimLevel + 1} (${this.aimLevel === 0 ? 'unlock auto-aim' : 'faster aim + fire rate'})`, cost: this._dblCost(AIM.baseCost, this.aimLevel) });
    if (this.tankLevel < SHOP.tankMaxLevel)
      items.push({ kind: 'tank', id: 'tank', label: `🫁 Air Tank +${SHOP.tankBonus} (Lv${this.tankLevel + 1})`, cost: this._dblCost(SHOP.tankBaseCost, this.tankLevel) });
    if (!this.hasTorch && this.reef >= TORCH.minReef)
      items.push({ kind: 'torch', id: 'torch', label: `🔦 Torch — battery light for dark caves (T)`, cost: TORCH.cost });
    items.push({ kind: 'close', id: 'close', label: 'Close', cost: 0 });
    return items;
  }

  // Upgrade prices double each level: base at level 0, 2× at level 1, 4× at 2…
  _dblCost(base, level) { return Math.round(base * Math.pow(2, level)); }

  // Row geometry adapts to the item count so a long list (many unlocks +
  // upgrades + refills) still fits — and its Close row stays tappable — inside
  // the 600px playfield; short lists keep the roomy 46px spacing.
  _shopRow(i) {
    const n = this._shopItems().length;
    const top = 176, bottom = 556, w = 470, x = (W - w) / 2;
    const step = Math.min(46, (bottom - top) / Math.max(1, n));
    return { x, y: top + i * step, w, h: Math.min(40, step - 6) };
  }

  _openShop(where) { this.state = 'shop'; this.shopWhere = where; this.shopSel = 0; this.shopDeny = 0; this.audio.select(); }
  _closeShop() { this.state = 'playing'; this._fireGrace = 0.3; }   // don't fire on the closing press
  _shopMove(dir) { const n = this._shopItems().length; this.shopSel = (this.shopSel + dir + n) % n; this.audio.pickup(); }

  _shopBuy() {
    const items = this._shopItems();
    const it = items[this.shopSel]; if (!it) return;
    if (it.kind === 'close') { this._closeShop(); return; }
    if (it.kind === 'bank') {
      this._bankLoot(this._relicBellFull ? 1 : (this.atBell ? bellBankRate(this.atBell.y) : 1));   // plays the bank sfx
      this.shopSel = 0;   // the bank row is gone now — reselect the top
      return;
    }
    if (this.gold < it.cost) { this.shopDeny = 0.6; this.audio.gasp(); return; }
    this.gold -= it.cost;
    if (it.kind === 'weapon') {
      this.owned.add(it.id); if (it.id === 'speargun') this.speargunAmmo = SPEARGUN.startAmmo;
      this._rebuildWeapons(); this.weaponIdx = this.weapons.indexOf(it.id);
      this.puName = `${WEAPON_INFO[it.id].name}!`; this.puCol = PAL.gold; this.puT = 1.6;
    } else if (it.kind === 'upgrade') {
      this.weaponLevel[it.id] += 1;
      this.puName = `${WEAPON_INFO[it.id].name} Lv${this.weaponLevel[it.id]}`; this.puCol = PAL.air; this.puT = 1.6;
    } else if (it.kind === 'tank') {
      this.tankLevel += 1; this.airMax += SHOP.tankBonus; this.air = this.airMax;
      this.puName = 'BIGGER TANK!'; this.puCol = PAL.air; this.puT = 1.6;
    } else if (it.kind === 'aim') {
      this.aimLevel += 1;
      this.puName = `TARGETING Lv${this.aimLevel}`; this.puCol = PAL.gateGlow; this.puT = 1.6;
    } else if (it.kind === 'harpoons') {
      this.harpoonAmmo = Math.min(this.harpoonMax, this.harpoonAmmo + SHOP.harpoonPack);
    } else if (it.kind === 'spears') {
      this.speargunAmmo = Math.min(SPEARGUN.ammoMax, this.speargunAmmo + SPEARGUN.ammoPack);
    } else if (it.kind === 'torch') {
      this.hasTorch = true;
      this.puName = 'TORCH!'; this.puCol = PAL.gateGlow; this.puT = 1.6;
    } else if (it.kind === 'harpooncap') {
      this.harpoonCapLevel += 1; this.harpoonMax += SHOP.harpoonCapStep;
      this.puName = `HARPOON CAP ${this.harpoonMax}`; this.puCol = PAL.harpoon; this.puT = 1.6;
    } else if (it.kind === 'flares') {
      this.flares += FLARE.pack;
    } else if (it.kind === 'charges') {
      this.chargeAmmo = Math.min(this.chargeMax, this.chargeAmmo + 1);
    } else if (it.kind === 'chargecap') {
      this.chargeCapLevel += 1; this.chargeMax = Math.min(CHARGE.capMax, this.chargeMax + 1);
      this.puName = `CHARGE CAP ${this.chargeMax}`; this.puCol = PAL.puffer; this.puT = 1.6;
    }
    this.audio.bank();
    if (this.shopSel >= this._shopItems().length) this.shopSel = this._shopItems().length - 1;
  }

  _shopScreen() {
    const ctx = this.ctx;
    this._panel(0.74);
    this._text('⚙ DIVE SHOP', W / 2, 118, 34, PAL.gold, 'center', 'middle', true);
    this._text(`💰 ${this.gold} gold`, W / 2, 152, 16, this.shopDeny > 0 ? PAL.danger : PAL.hudText, 'center', 'middle', true);
    const items = this._shopItems();
    if (this.shopSel >= items.length) this.shopSel = items.length - 1;
    items.forEach((it, i) => {
      const r = this._shopRow(i), sel = i === this.shopSel, afford = this.gold >= it.cost || it.kind === 'close';
      ctx.fillStyle = sel ? 'rgba(30,84,124,0.92)' : 'rgba(8,26,44,0.82)';
      ctx.strokeStyle = sel ? PAL.gold : 'rgba(120,200,255,0.22)'; ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
      this._text(it.label, r.x + 16, r.y + r.h / 2, 15, afford ? PAL.hudText : 'rgba(210,130,130,0.85)', 'left', 'middle', sel);
      if (it.kind !== 'close') this._text(`${it.cost}g`, r.x + r.w - 16, r.y + r.h / 2, 14, afford ? PAL.gold : '#c88', 'right', 'middle', true);
    });
    const hint = this.input.isTouch ? 'Tap an item to buy · tap Close to leave' : '↑ / ↓ select   ·   Space / A buy   ·   P / Esc close';
    this._text(hint, W / 2, this._shopRow(items.length).y + 8, 13, '#9fc6e0', 'center', 'middle');
  }

  // ---- dry dock (spend Salvage between runs: unlock relics, equip them into
  // slots, buy more slots) — mirrors the in-run shop's UI/nav closely. -----
  _dryDockRows() {
    const rows = [];
    for (const r of RELICS) {
      if (this.meta.unlocked.includes(r.id)) {
        rows.push({ kind: 'relic', id: r.id, label: `${r.name} — ${r.desc}`, cost: 0, equipped: this.meta.loadout.includes(r.id) });
      } else {
        rows.push({ kind: 'buy', id: r.id, label: `🔒 ${r.name} — ${r.desc}`, cost: r.cost });
      }
    }
    if (this.meta.slots < SALVAGE.maxSlots) {
      rows.push({ kind: 'slot', id: 'slot', label: `➕ Loadout slot (${this.meta.slots} → ${this.meta.slots + 1})`, cost: this._dblCost(SALVAGE.slotCostBase, this.meta.slots - SALVAGE.startSlots) });
    }
    rows.push({ kind: 'close', id: 'close', label: 'Close', cost: 0 });
    return rows;
  }

  // Row geometry mirrors _shopRow — a touch wider to fit relic descriptions.
  _ddRow(i) {
    const n = this._dryDockRows().length;
    const top = 194, bottom = 556, w = 620, x = (W - w) / 2;
    const step = Math.min(46, (bottom - top) / Math.max(1, n));
    return { x, y: top + i * step, w, h: Math.min(40, step - 6) };
  }

  _openDryDock(from) { this.ddReturn = from; this.state = 'drydock'; this.ddSel = 0; this.ddDeny = 0; this.audio.select(); }
  _closeDryDock() { this.state = this.ddReturn || 'menu'; }
  _dryDockMove(dir) { const n = this._dryDockRows().length; this.ddSel = (this.ddSel + dir + n) % n; this.audio.pickup(); }

  _dryDockAct() {
    const rows = this._dryDockRows();
    const row = rows[this.ddSel]; if (!row) return;
    if (row.kind === 'close') { this._closeDryDock(); return; }
    if (row.kind === 'buy') {
      if (this.meta.salvage < row.cost) { this.ddDeny = 0.6; this.audio.gasp(); return; }
      this.meta.salvage -= row.cost; this.meta.unlocked.push(row.id); saveSalvage(this.meta); this.audio.bank();
    } else if (row.kind === 'slot') {
      if (this.meta.salvage < row.cost) { this.ddDeny = 0.6; this.audio.gasp(); return; }
      this.meta.salvage -= row.cost; this.meta.slots += 1; saveSalvage(this.meta); this.audio.bank();
    } else if (row.kind === 'relic') {
      if (row.equipped) {
        this.meta.loadout = this.meta.loadout.filter((id) => id !== row.id);
      } else if (this.meta.loadout.length < this.meta.slots) {
        this.meta.loadout.push(row.id);
      } else {
        this.ddDeny = 0.6; this.audio.gasp(); return;   // loadout full
      }
      saveSalvage(this.meta); this.audio.pickup();
    }
    const n = this._dryDockRows().length;
    if (this.ddSel >= n) this.ddSel = n - 1;
  }

  _dryDockScreen() {
    const ctx = this.ctx;
    this._panel(0.74);
    this._text('🛠 DRY DOCK', W / 2, 108, 34, PAL.gold, 'center', 'middle', true);
    this._text(`⚙ SALVAGE: ${this.meta.salvage}`, W / 2, 144, 16, this.ddDeny > 0 ? PAL.danger : PAL.hudText, 'center', 'middle', true);
    this._text(`SLOTS: ${this.meta.loadout.length}/${this.meta.slots}`, W / 2, 166, 13, '#9fc6e0', 'center', 'middle');
    const rows = this._dryDockRows();
    if (this.ddSel >= rows.length) this.ddSel = rows.length - 1;
    rows.forEach((row, i) => {
      const r = this._ddRow(i), sel = i === this.ddSel;
      const afford = row.kind === 'close' || row.kind === 'relic' || this.meta.salvage >= row.cost;
      ctx.fillStyle = sel ? 'rgba(30,84,124,0.92)' : 'rgba(8,26,44,0.82)';
      ctx.strokeStyle = sel ? PAL.gold : 'rgba(120,200,255,0.22)'; ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
      this._text(row.label, r.x + 16, r.y + r.h / 2, 15, afford ? PAL.hudText : 'rgba(210,130,130,0.85)', 'left', 'middle', sel);
      if (row.kind === 'buy' || row.kind === 'slot') {
        this._text(`⚙${row.cost}`, r.x + r.w - 16, r.y + r.h / 2, 14, afford ? PAL.gold : '#c88', 'right', 'middle', true);
      } else if (row.kind === 'relic') {
        this._text(row.equipped ? '[EQUIPPED]' : '[equip]', r.x + r.w - 16, r.y + r.h / 2, 13, row.equipped ? PAL.gold : '#9fc6e0', 'right', 'middle', true);
      }
    });
    const hint = this.input.isTouch ? 'Tap a row to unlock/equip · tap Close to leave' : '↑ / ↓ select   ·   Space / A buy/equip   ·   R / Esc close';
    this._text(hint, W / 2, this._ddRow(rows.length).y + 8, 13, '#9fc6e0', 'center', 'middle');
  }

  // ---- help / how-to-play ---------------------------------------------
  _helpRects() {
    return {
      prev: { id: 'helpprev', x: 30, y: H / 2 - 34, w: 54, h: 68 },
      next: { id: 'helpnext', x: W - 84, y: H / 2 - 34, w: 54, h: 68 },
      close: { id: 'helpclose', x: W / 2 - 62, y: H - 64, w: 124, h: 40 },
    };
  }
  _openHelp(from) { this.helpReturn = from; this.state = 'help'; this.helpPage = 0; this.audio.select(); }
  _closeHelp() { this.state = this.helpReturn || 'menu'; }
  _helpScreen() {
    const ctx = this.ctx;
    this._panel(0.85);
    const p = HELP_PAGES[this.helpPage];
    this._text('HOW TO PLAY', W / 2, 92, 30, PAL.glow, 'center', 'middle', true);
    this._text(p.title, W / 2, 146, 24, PAL.gold, 'center', 'middle', true);
    // The CONTROLS page is rebuilt for the chosen scheme, with a live selector.
    const lines = p.id === 'controls' ? controlsHelpLines(this.controlScheme) : p.lines;
    if (p.id === 'controls') {
      this._text(`Scheme: ‹ ${SCHEME_LABEL[this.controlScheme]} ›   (${this.input.isTouch ? 'tap' : 'C'} to change)`, W / 2, 176, 14, PAL.gold, 'center', 'middle', true);
    }
    let y = p.id === 'controls' ? 214 : 208;
    for (const line of lines) { this._text(line, W / 2, y, 16, PAL.hudText, 'center', 'middle'); y += 31; }
    // page dots
    for (let i = 0; i < HELP_PAGES.length; i++) {
      ctx.fillStyle = i === this.helpPage ? PAL.gold : 'rgba(200,220,240,0.35)';
      ctx.beginPath(); ctx.arc(W / 2 - (HELP_PAGES.length - 1) * 9 + i * 18, 470, 4, 0, Math.PI * 2); ctx.fill();
    }
    // nav arrows + close (touch-friendly, keyboard too)
    const r = this._helpRects();
    const box = (rc) => { ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.6)'; ctx.strokeStyle = 'rgba(150,200,240,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(rc.x, rc.y, rc.w, rc.h, 8); ctx.fill(); ctx.stroke(); ctx.restore(); };
    box(r.prev); this._text('‹', r.prev.x + r.prev.w / 2, r.prev.y + r.prev.h / 2, 24, PAL.hudText, 'center', 'middle', true);
    box(r.next); this._text('›', r.next.x + r.next.w / 2, r.next.y + r.next.h / 2, 24, PAL.hudText, 'center', 'middle', true);
    box(r.close); this._text('CLOSE  (H)', r.close.x + r.close.w / 2, r.close.y + r.close.h / 2, 14, PAL.hudText, 'center', 'middle', true);
    this._text('← / → to page through', W / 2, 498, 12, '#9fc6e0', 'center', 'middle');
  }

  // Unload carried loot at a station (boat or bell): full score points plus
  // gold (a fraction of the value) to spend on gear, and bank the relic.
  // Bank the carried haul. `rate` is the value multiplier: the boat banks at 1.0
  // (full), a dive bell at its depth-scaled bellBankRate (a cut of both score and
  // gold). The relic still completes the objective at any rate.
  _bankLoot(rate = 1) {
    const value = Math.round(this.carried * rate);
    const g = Math.round(value * GOLD.rate);
    this.reefBanked += value; this.score += value; this.gold += g;
    this.carried = 0; this.bankPulse = 1; this.audio.bank();
    if (this.carryingRelic) { this.relicBanked = true; this.carryingRelic = false; this.relicsBanked = (this.relicsBanked || 0) + 1; }
    // Black Pearls convert to Salvage immediately on banking — a persistent
    // currency gain the moment they're safe, not deferred to the run-end payout.
    if (this.carriedPearls > 0) {
      this.meta.salvage += this.carriedPearls * SALVAGE.perPearl;
      this.blackPearlsBanked += this.carriedPearls;
      saveSalvage(this.meta);
      this.puName = `+${this.carriedPearls * SALVAGE.perPearl} SALVAGE`; this.puCol = PAL.blackPearlSheen; this.puT = 1.6;
      this.carriedPearls = 0;
    }
  }

  _applyPowerUp(type) {
    const d = this.diver;
    switch (type) {
      case 'tank': this.airMax += POWERUP.tankBonus; this.air = this.airMax; this.particles.sparkle(d.x, d.y, PAL.air, 24); this.audio.bank(); break;
      case 'multifire': this.multiFireT += POWERUP.multifireDuration; this.particles.sparkle(d.x, d.y, PAL.harpoonTip, 24); this.audio.pickup(); break;
      case 'shield': this.shieldT += POWERUP.shieldDuration; this.particles.sparkle(d.x, d.y, PAL.gateGlow, 24); this.audio.pickup(); break;
      case 'speed': this.speedT += POWERUP.speedDuration; this.particles.sparkle(d.x, d.y, PAL.air, 24); this.audio.pickup(); break;
      case 'magnet': this.magnetT += POWERUP.magnetDuration; this.particles.sparkle(d.x, d.y, PAL.gold, 24); this.audio.pickup(); break;
      case 'life': this.lives += 1; this.particles.sparkle(d.x, d.y, PAL.diver, 28); this.audio.bank(); break;
      case 'ammo': {
        const got = HARPOON.findMin + Math.floor(Math.random() * (HARPOON.findMax - HARPOON.findMin + 1));
        this.harpoonAmmo = Math.min(this.harpoonMax, this.harpoonAmmo + got);
        this.puName = `+${got} HARPOONS`; this.puCol = PAL.harpoon; this.puT = 1.4;
        this.particles.sparkle(d.x, d.y, PAL.harpoon, 18); this.audio.pickup(); break;
      }
      case 'flare': {
        const got = FLARE.findMin + Math.floor(Math.random() * (FLARE.findMax - FLARE.findMin + 1));
        this.flares += got;
        this.puName = `+${got} FLARES`; this.puCol = '#ff7a3c'; this.puT = 1.4;
        this.particles.sparkle(d.x, d.y, '#ff7a3c', 16); this.audio.pickup(); break;
      }
    }
    // Flash up the cartoon power-up name (its own pop, distinct from the
    // score-milestone 1-UP flourish).
    const info = PU_INFO[type];
    if (info) { this.puName = info.name; this.puCol = info.col; this.puT = 1.7; }
  }

  // The sunken temple — a stone biome with a key-and-door puzzle guarding a
  // vault. Collect the key to open the door; the vault loot unlocks with it.
  _generateTemple() {
    const C = this.cave = new Cave('temple');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.columns = []; this.hasKey = false; this.templeGate = null; this.whaleExit = null; this.abyssEntrance = null; this.whirlEntrance = null; this.powerups = []; this.relic = null; this.bells = []; this.crates = []; this.darkZones = [];
    this.stageEntrances = [];
    const value = (y) => 400 + Math.round((y / WH) * 500);

    // Scattered loot + a couple of air vents + light hazards.
    for (const f of spread(C.floors(), 10, 200)) this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, value(f.y)));
    for (let i = 0; i < 26; i++) { const c = C.randomOpen(); if (c) this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.4 ? 'gem' : 'coin')); }
    for (const w of spread(C.walls(), 5, 380)) this.vents.push(new AirVent(w.x, w.y, w.side));
    for (let i = 0; i < 6; i++) {
      const c = C.randomOpen(OPEN_BAND + 300); if (!c) continue;
      const entry = pickFauna('temple', this.reef); if (!entry) continue;
      const spawned = spawnCreature(entry, c.x, c.y, this.reef);
      if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
    }
    // Columns for temple flavour.
    for (const f of spread(C.floors(), 18, 200)) this.columns.push({ x: f.x, y: f.y });

    // The key, mid-temple.
    const kc = C.randomOpen(OPEN_BAND + 400) || { x: WW / 2, y: WH * 0.4 };
    this.key = { x: kc.x, y: kc.y, r: 20, taken: false };
    // The locked door deep down, with the vault (locked loot) behind/below it.
    const dc = C.randomOpen(WH * 0.6) || { x: WW / 2, y: WH * 0.7 };
    const dFloor = C.surfaceBelow(dc.x, dc.y, 200);
    this.door = { x: dc.x, y: dFloor - 90, w: 74, h: 180, open: 0 };
    // Vault loot sits in the OPEN chamber around the door (above the floor —
    // placing it below dFloor buried it in solid rock, so the vault came up
    // empty). Retry to reliably seat all 8 in open cells the diver can reach
    // once the key opens the door (`t.locked` gates collection, not placement).
    for (let i = 0; i < 8; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const vx = dc.x + (Math.random() - 0.5) * 220, vy = dFloor - 12 - Math.random() * 140;
        if (!C.isSolid(vx, vy)) { const t = new Treasure(vx, vy, Math.random() < 0.6 ? 'gem' : 'chest'); t.locked = true; this.treasures.push(t); break; }
      }
    }
    this.flora = new Flora([]);
    this._makeCurrents(2);
    this._makePowerups(1);
    this.templeExit = { x: WW / 2, y: OPEN_BAND - 6, r: 46 };
    this._orientShells();
    this._clearCreaturesNearPortals();
  }

  // The deep-dive abyss — a dark, loot-rich trench off the reef. No boat/bell
  // here: it's a risky in-and-out dive (air drains 150% on foot, see the drain
  // path). Denser, higher-value treasure than the reef, plus extra Black
  // Pearls — the reward for the risk. An ascent exit near the top returns
  // you to the reef, mirroring _generateTemple.
  _generateAbyss() {
    const C = this.cave = new Cave('abyss');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.columns = []; this.hasKey = false; this.templeGate = null; this.whaleExit = null; this.abyssEntrance = null; this.whirlEntrance = null; this.powerups = []; this.relic = null; this.bells = []; this.crates = []; this.darkZones = [];
    this.stageEntrances = []; this.abyssEntrance = null; this.door = null; this.key = null;
    const value = (y) => 450 + Math.round((y / WH) * 650);   // richer than the reef — the abyss's whole point

    // Dense loot: chests on every ledge, gems & coins thick in open water.
    for (const f of spread(C.floors(), 14, 170)) this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, value(f.y)));
    for (let i = 0; i < 40; i++) { const c = C.randomOpen(); if (c) this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.5 ? 'gem' : 'coin')); }
    for (const w of spread(C.walls(), 6, 360)) this.vents.push(new AirVent(w.x, w.y, w.side));

    // Extra Black Pearls — the abyss is the pearl-hunt hotspot, so it seeds
    // more (2-3) than a normal reef's 1-2 (see the reef's pearlCount above).
    const pearlCount = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < pearlCount; i++) {
      const pc = C.randomOpen();
      if (pc && !C.isSolid(pc.x, pc.y)) this.treasures.push(new Treasure(pc.x, pc.y, 'blackpearl'));
    }

    // Guardians — reuse the reef's deep-band roster (sharks, eels, anglers,
    // morays…), a bit denser than the temple's since this is the riskiest zone.
    for (let i = 0; i < 8; i++) {
      const c = C.randomOpen(OPEN_BAND + 300); if (!c) continue;
      const entry = pickFauna('deep', this.reef); if (!entry) continue;
      const spawned = spawnCreature(entry, c.x, c.y, this.reef);
      if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
    }

    this.flora = new Flora([]);
    this._makeCurrents(3);   // a churning trench
    this._makePowerups(1);
    this.abyssExit = { x: WW / 2, y: OPEN_BAND - 6, r: 46 };
    this._orientShells();
    this._clearCreaturesNearPortals();
  }

  // The whirlpool — a survival sweep, not an explorable cave: no Cave/miner
  // carving here, just a vertical SHAFT (a fixed-width column) the diver is
  // swept down at accelerating speed, seeded with obstacles to dodge (denser
  // deeper), collectibles to grab on the way (Phase 2 — see below), and an
  // ascent exit near the top for an early bail. Reef-only fields are cleared
  // defensively, mirroring _generateAbyss/_generateTemple, even though the
  // whirlpool's own update/draw paths never touch them (see _updateWhirlpool).
  _generateWhirlpool() {
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.columns = []; this.hasKey = false; this.templeGate = null; this.whaleExit = null; this.abyssEntrance = null; this.powerups = []; this.relic = null; this.bells = []; this.crates = []; this.darkZones = [];
    this.stageEntrances = []; this.whirlEntrance = null; this.door = null; this.key = null;

    const cx = WW / 2, halfW = WHIRL.shaftHalfW;
    const top = OPEN_BAND;
    this.whirlShaft = { cx, halfW, top };   // endless: no fixed bottom

    // Endless survival: obstacles + collectibles are STREAMED ahead of the diver
    // and recycled once they scroll above (see _updateWhirlpool). It starts
    // sparse — a clear drop-in stretch, then density ramps over WHIRL.rampSecs —
    // so a moderate player rides ~30s before the vortex (or their air) gets them.
    this.whirlObstacles = []; this.whirlBubbles = []; this.whirlTreasures = [];
    this.whirlT = 0;                                  // seconds swept (drives the density ramp)
    this.whirlNextObstacleY = top + WHIRL.safeDrop;   // obstacles begin below the safe drop-in
    this.whirlNextBubbleY = top + WHIRL.safeDrop + 120;
    this.whirlNextTreasureY = top + WHIRL.safeDrop + 60;
    this.whirlTreasuresSeeded = 0;                    // for the periodic Black Pearl

    // Ascend back out the top (swim up against the current) to bail early — a
    // clean escape that still banks the earned score/loot (see _updateWhirlpool).
    this.whirlExit = { x: cx, y: top - 6, r: 46 };
  }

  // Streaming helpers: spawn a row/collectible at world-y `y` for the endless
  // whirlpool. `ramp` (0→1) tightens rows and adds obstacles as the run wears on.
  _whirlSpawnRow(y, ramp) {
    const s = this.whirlShaft, usable = s.halfW - 12;
    const count = 1 + Math.round(ramp * (WHIRL.rowCountMax - 1));   // 1 → rowCountMax
    const kinds = ['mine', 'jelly', 'star'];
    for (let n = 0; n < count; n++) {
      const r = WHIRL.obstacleR * (0.8 + Math.random() * 0.5);
      const x = s.cx + (Math.random() * 2 - 1) * (usable - r);
      const kind = kinds[(Math.random() * kinds.length) | 0];
      this.whirlObstacles.push({ x, y: y + (Math.random() - 0.5) * 90, r, kind, phase: Math.random() * Math.PI * 2 });
    }
  }
  _whirlRandX(r) { const s = this.whirlShaft; return s.cx + (Math.random() * 2 - 1) * (s.halfW - r - 12); }

  // Draw a whirlpool obstacle (centred at 0,0) by kind: landmine / jellyfish /
  // starfish. Collision is the plain circle radius o.r regardless of kind.
  _drawWhirlObstacle(ctx, o, t) {
    const R = o.r, TAU = Math.PI * 2;
    if (o.kind === 'mine') {
      ctx.strokeStyle = '#0f1319'; ctx.lineWidth = Math.max(2, R * 0.13);
      for (let i = 0; i < 8; i++) { const a = o.phase + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62); ctx.lineTo(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05); ctx.stroke(); }
      const g = ctx.createRadialGradient(-R * 0.28, -R * 0.28, R * 0.1, 0, 0, R * 0.78);
      g.addColorStop(0, '#3d454f'); g.addColorStop(1, '#191e25');
      ctx.fillStyle = g; ctx.strokeStyle = '#0f1319'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, TAU); ctx.fill(); ctx.stroke();
      const blink = Math.sin(t * 6 + o.phase) > 0.2;
      if (blink) { ctx.shadowColor = '#ff5a44'; ctx.shadowBlur = 9; }
      ctx.fillStyle = blink ? '#ff5a44' : '#5c1c14';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    } else if (o.kind === 'jelly') {
      const pulse = 1 + Math.sin(t * 2.5 + o.phase) * 0.09;
      ctx.strokeStyle = 'rgba(214,170,255,0.55)'; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        const bx = i * R * 0.26; ctx.beginPath(); ctx.moveTo(bx, R * 0.05);
        for (let s = 1; s <= 4; s++) { const yy = R * 0.05 + s * R * 0.4; const xx = bx + Math.sin(t * 3 + o.phase + s * 0.9 + i) * R * 0.16; ctx.lineTo(xx, yy); }
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(0, -R * 0.25, R * 0.1, 0, -R * 0.15, R);
      g.addColorStop(0, 'rgba(232,205,255,0.6)'); g.addColorStop(1, 'rgba(168,118,240,0.14)');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(222,182,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -R * 0.12, R * 0.92 * pulse, R * 0.72, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else {   // star (starfish)
      const rot = o.phase + t * 0.4;
      ctx.fillStyle = '#e8863a'; ctx.strokeStyle = '#a5531d'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5; const rr = (i % 2 === 0) ? R : R * 0.44; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,222,150,0.7)';
      for (let i = 0; i < 5; i++) { const a = rot + i * TAU / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.1, 0, TAU); ctx.fill(); }
    }
  }

  // Scatter current zones on open cells, flowing along the cave.
  // Sideways currents can sit anywhere, but a *downdraft* must be anchored in a
  // roomy chamber (a fully-open 3×3 neighbourhood) — never over a narrow neck —
  // and flows slightly off-vertical so there's always a lateral escape lane. A
  // pure down-current in a thin tunnel used to trap the diver: wall friction ate
  // the small net upward velocity while the current kept pushing down.
  _makeCurrents(count) {
    const C = this.cave;
    const roomy = C.chambers(OPEN_BAND + 200);   // clearance spots for downdrafts
    for (let i = 0; i < count; i++) {
      // 30% of currents want to be vertical, but only where there's real room;
      // otherwise fall back to a (safe) horizontal sweep.
      let horizontal = Math.random() < 0.7;
      let c;
      if (!horizontal) {
        if (roomy.length) c = roomy[(Math.random() * roomy.length) | 0];
        else { horizontal = true; c = C.randomOpen(OPEN_BAND + 200); }
      } else {
        c = C.randomOpen(OPEN_BAND + 200);
      }
      if (!c) continue;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const w = horizontal ? 360 + Math.random() * 240 : 200 + Math.random() * 120;
      const h = horizontal ? 170 + Math.random() * 90 : 240 + Math.random() * 140;   // shorter columns reach into fewer necks
      // Downdrafts flow slightly off-vertical (Current normalises the vector), so
      // held-up thrust always nets upward and there's a sideways way out.
      const escape = Math.random() < 0.5 ? -1 : 1;
      const fx = horizontal ? dir : 0.34 * escape, fy = horizontal ? 0 : 1;
      this.currents.push(new Current(c.x - w / 2, c.y - h / 2, w, h, fx, fy));
    }
  }

  // The whale's belly — a fleshy themed cave packed with a rich trove, a few
  // swallowed hazards and a glowing throat exit. No boat: grab and get out.
  _generateBelly() {
    const C = this.cave = new Cave('belly');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.templeGate = null; this.abyssEntrance = null; this.whirlEntrance = null; this.columns = []; this.powerups = []; this.relic = null; this.bells = []; this.crates = []; this.darkZones = [];
    this.stageEntrances = [];
    const value = (y) => 350 + Math.round((y / WH) * 500);   // richer than the reef

    // Rib bones lining the belly.
    for (const f of spread(C.floors(), 40, 130)) this.ribs.push({ x: f.x, y: f.y - 40, dir: Math.random() < 0.5 ? 1 : -1 });
    // A generous trove: chests on ledges, gems & coins everywhere.
    for (const f of spread(C.floors(), 22, 150)) this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, value(f.y)));
    for (let i = 0; i < 60; i++) { const c = C.randomOpen(); if (c) this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.5 ? 'gem' : 'coin')); }
    // A couple of blowhole vents so it's survivable, plus swallowed hazards.
    for (const w of spread(C.walls(), 6, 400)) this.vents.push(new AirVent(w.x, w.y, w.side));
    for (let i = 0; i < 8; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const entry = pickFauna('belly', this.reef); if (!entry) continue;
      const spawned = spawnCreature(entry, c.x, c.y, this.reef);
      if (Array.isArray(spawned)) this.creatures.push(...spawned); else if (spawned) this.creatures.push(spawned);
    }
    this.flora = new Flora([]);
    this._makeCurrents(3);   // churning guts
    this._makePowerups(1);
    // Glowing throat exit up in the entrance band; the diver starts down in the belly.
    this.whaleExit = { x: WW / 2, y: OPEN_BAND - 6, r: 46 };
    this._orientShells();
    this._clearCreaturesNearPortals();
  }

  // ---- input events (from main) ---------------------------------------
  onAction() {
    if (this.state === 'menu' || this.state === 'gameover') { this.audio.ensure(); this.audio.resume(); this.start(this.pendingStartReef); }
    else if (this.state === 'paused') { this.state = 'playing'; this._fireGrace = 0.3; }
    else if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'shop') this._shopBuy();
    else if (this.state === 'drydock') this._dryDockAct();
  }

  get weapon() { return this.weapons[this.weaponIdx]; }

  _cycleWeapon(dir) {
    if (this.weapons.length < 2) return;
    this.weaponIdx = (this.weaponIdx + dir + this.weapons.length) % this.weapons.length;
    this.weaponSwapT = 1.2;   // brief HUD flash of the new weapon name
    this.audio.select();
  }

  // Fire the current weapon (respecting its cooldown). Upgrade level boosts the
  // key stat per weapon and shaves a little off every cooldown.
  fire() {
    if (this.state !== 'playing') return;
    const id = this.weapon, lvl = this.weaponLevel[id], info = WEAPON_INFO[id];
    const armed = this.armedCharge && !this.armedCharge.dead;
    // Detonating a live charge is a *different* action from throwing one, so it
    // must bypass the throw cooldown — otherwise the 2nd click lands inside the
    // ~1.15s throw cd (line below) and is silently dropped, which is the "second
    // click never detonates" bug. `_chargeLock` requires a fresh trigger: it's
    // set when a charge is thrown and cleared once the fire control is released,
    // so a continuous hold can't throw-then-instantly-detonate at the diver.
    if (id === 'charge' && armed) {
      if (this._chargeLock) return;
      this.armedCharge.detonate(); this.armedCharge = null; this.audio.fire();
      return;
    }
    if (this.fireCd > 0) return;
    if (id === 'harpoon' && this.harpoonAmmo <= 0) { this.fireCd = 0.2; this.audio.click(); this._ammoFlash = 0.7; return; }   // out of harpoons
    if (id === 'speargun' && this.speargunAmmo <= 0) { this.fireCd = 0.2; this.audio.click(); this._ammoFlash = 0.7; return; } // out of spears
    if (id === 'charge' && this.chargeAmmo <= 0) { this.fireCd = 0.2; this.audio.click(); this._ammoFlash = 0.7; return; }     // out of charges
    if (id === 'shock' && this.shockBattery < SHOCK.cost) { this.fireCd = 0.2; this.audio.click(); this._ammoFlash = 0.7; return; }   // battery flat
    const fireMult = Math.pow(AIM.fireMultPerLevel, this.aimLevel);   // Targeting System → faster fire
    this.fireCd = Math.max(info.minCd || 0, info.cd * (1 - 0.08 * (lvl - 1)) * fireMult);
    switch (id) {
      case 'harpoon':  this._fireHarpoon(); break;
      case 'net':      this._fireNet(); break;
      case 'speargun': this.burst = Math.min(this.speargunAmmo, SPEARGUN.shots + (lvl - 1)); this.burstT = 0; break;   // +1 shot/level, capped by ammo
      case 'charge':   this._fireCharge(); this.chargeAmmo -= 1; this._chargeLock = true; break;   // throw; 2nd trigger detonates
      case 'shock':    this._fireShock(lvl); break;
    }
  }

  // Auto-aim lock is a PAID perk: it engages only once the Targeting upgrade is
  // owned (aimLevel >= AIM.unlockLevel). Below that, holding fire just rapid-fires
  // in the facing direction (manual aim) — this returns null so no threat is locked.
  _acquireAimTarget(engaged) {
    if (!engaged || this.aimLevel < AIM.unlockLevel) return null;
    return this._nearestThreat();
  }

  // Nearest live, un-snared threat (creature or kraken) within aim range.
  _nearestThreat() {
    const d = this.diver; let best = null, bd = AIM.range * AIM.range;
    for (const cr of this.creatures) {
      if (cr.dead || cr.snareT > 0) continue;
      const dx = cr.x - d.x, dy = cr.y - d.y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = cr; }
    }
    for (const k of this.krakens) {
      if (k.hp <= 0) continue;
      const dx = k.x - d.x, dy = k.y - d.y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  }
  _angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  _angleToward(a, target, maxStep) { const d = this._angleDiff(a, target); return a + Math.max(-maxStep, Math.min(maxStep, d)); }

  // Apply one weapon hit to a creature: mini-bosses (with takeDamage) chip HP,
  // ordinary creatures die outright. Returns true if the creature just died.
  _damageCreature(cr) {
    if (cr.takeDamage) { cr.takeDamage(this._relicBarbs ? 2 : 1); return cr.dead; }
    cr.dead = true; return true;
  }

  _spear(angleOff = 0) {
    const d = this.diver, ca = Math.cos(angleOff), sa = Math.sin(angleOff);
    this.harpoons.push(new Harpoon(d.x, d.y, d.aimX * ca - d.aimY * sa, d.aimX * sa + d.aimY * ca));
    this.audio.fire();
  }
  _fireHarpoon() {
    // Consumes one harpoon per spear (multifire fires up to 3, ammo permitting).
    const angles = this.multiFireT > 0 ? [-POWERUP.spread, 0, POWERUP.spread] : [0];
    const n = Math.min(angles.length, this.harpoonAmmo);
    for (let i = 0; i < n; i++) this._spear(angles[i]);
    this.harpoonAmmo -= n;
  }
  _fireNet() {
    const d = this.diver;
    this.nets.push(new Net(d.x, d.y, d.aimX, d.aimY));
    this.audio.fire();
  }
  _fireCharge() {
    const d = this.diver;
    const ch = new DepthCharge(d.x, d.y, d.aimX, d.aimY);
    this.charges.push(ch);
    this.armedCharge = ch;
    this.audio.fire();
  }
  // Shock rod: strike the nearest creature with lightning, then arc to nearby
  // ones — one extra target per upgrade level. Drains the battery.
  _fireShock(lvl = 1) {
    this.shockBattery -= SHOCK.cost;
    const maxTargets = lvl;                 // level 1 → 1, each upgrade → +1 arc
    const used = new Set();
    const bolts = [];
    let from = { x: this.diver.x, y: this.diver.y };
    for (let n = 0; n < maxTargets; n++) {
      const reach = n === 0 ? SHOCK.primaryRange : SHOCK.chainRange;
      let best = null, bd = reach * reach;
      for (const cr of this.creatures) {
        if (cr.dead || used.has(cr)) continue;
        const dd = (cr.x - from.x) ** 2 + (cr.y - from.y) ** 2;
        if (dd < bd) { bd = dd; best = cr; }
      }
      if (!best) break;
      used.add(best);
      bolts.push({ x1: from.x, y1: from.y, x2: best.x, y2: best.y });
      if (best.takeDamage) {
        // Mini-bosses (e.g. the squid) chip HP per zap instead of the normal
        // 2-cumulative-hit kill — never insta-killed by the shockHits logic.
        best.takeDamage(1);
        if (best.dead) { this.score += best.points || 0; this.particles.sparkle(best.x, best.y, PAL.danger, 18); this.audio.kill(); }
        else { this.particles.sparkle(best.x, best.y, PAL.danger, 10); this.audio.hit(); }
      } else {
        best.shockHits = (best.shockHits || 0) + 1;
        if (best.shockHits >= SHOCK.hitsToKill) {
          // Second zap finishes it — same reward as a harpoon kill.
          best.dead = true; this.score += best.points || 0;
          this.particles.sparkle(best.x, best.y, PAL.danger, 18); this.audio.kill();
        } else {
          // First zap: stun + knock back, leaving it primed for the killing shot.
          best.snareT = Math.max(best.snareT || 0, SHOCK.stun);
          const a = Math.atan2(best.y - from.y, best.x - from.x);
          if (best.vx !== undefined) { best.vx += Math.cos(a) * SHOCK.knock; best.vy += Math.sin(a) * SHOCK.knock; }
          this.particles.sparkle(best.x, best.y, PAL.gateGlow, 10);
        }
      }
      from = best;
    }
    this.shockBolts = bolts; this.shockT = 0.22;
    this.audio.fire();
  }

  // ---- update ----------------------------------------------------------
  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.bankPulse = Math.max(0, this.bankPulse - dt * 2);
    this.zoneFade = Math.max(0, this.zoneFade - dt * 1.2);
    this.oneUpT = Math.max(0, this.oneUpT - dt);
    this.puT = Math.max(0, this.puT - dt);
    this.reentryT = Math.max(0, (this.reentryT || 0) - dt);

    this.input.poll();   // gamepad
    this._autoDetectScheme();   // pad plugged in → pad prompts (until picked manually)
    this._syncTouchButtons();   // on-screen buttons for touch play
    // Gamepad confirm/start advances menus / resumes (fire handles it in-play).
    const startEdge = this.input.consumeStart();
    const cycleControls = this.input.pressed('controls') || this.input.consumeButton('controls');

    // Help screen: page through, cycle the control legend, then close.
    if (this.state === 'help') {
      const n = HELP_PAGES.length;
      if (cycleControls) this._cycleScheme();
      if (this.input.pressed('right') || this.input.pressed('weaponNext') || this.input.consumeButton('helpnext') || this.input.consumeTapFire()) this.helpPage = (this.helpPage + 1) % n;
      if (this.input.pressed('left') || this.input.pressed('weaponPrev') || this.input.consumeButton('helpprev')) this.helpPage = (this.helpPage - 1 + n) % n;
      if (this.input.pressed('help') || this.input.pressed('pause') || startEdge || this.input.consumeButton('helpclose')) this._closeHelp();
      this.input.endFrame(); return;
    }
    // Open help from the menu, pause or game-over screens (H or the ? button).
    if (this.state !== 'playing' && (this.input.pressed('help') || this.input.consumeButton('help'))) { this._openHelp(this.state); this.input.endFrame(); return; }

    // Open the Dry Dock from the menu or game-over screen (R or the 🛠 button).
    if ((this.state === 'menu' || this.state === 'gameover') && (this.input.pressed('drydock') || this.input.consumeButton('drydock'))) { this._openDryDock(this.state); this.input.endFrame(); return; }

    // Change the on-screen control legend (C / a menu tap; ← → on the menus).
    if (cycleControls) this._cycleScheme();
    else if ((this.state === 'menu' || this.state === 'gameover') && (this.input.pressed('right') || this.input.consumeButton('schemeNext'))) this._cycleScheme();
    else if ((this.state === 'menu' || this.state === 'gameover') && this.input.pressed('left')) this._setScheme(prevScheme(this.controlScheme));
    // Reef-skip 'START AT' selector (↑ ↓ on the menus, or its tap target).
    if ((this.state === 'menu' || this.state === 'gameover') &&
        (this.input.pressed('up') || this.input.pressed('down') || this.input.consumeButton('skipNext'))) this._cycleStartReef();

    if (this.input.pressed('pause') || this.input.consumeButton('pause')) { if (this.state === 'shop') this._closeShop(); else if (this.state === 'drydock') this._closeDryDock(); else this.onAction(); }
    if (this.input.pressed('mute') || this.input.consumeButton('mute')) { this.audio.ensure(); this.muted = this.audio.toggleMute(); }

    // Shop: a frozen overlay while docked — navigate, buy, then close.
    if (this.state === 'shop') {
      if (startEdge) this._shopBuy();
      if (this.input.pressed('up')) this._shopMove(-1);
      if (this.input.pressed('down')) this._shopMove(1);
      const items = this._shopItems();
      for (let i = 0; i < items.length; i++) if (this.input.consumeButton('shop' + i)) { this.shopSel = i; this._shopBuy(); break; }
      this.shopDeny = Math.max(0, this.shopDeny - dt);
      this.input.endFrame(); return;
    }
    // Dry Dock: a frozen overlay off the menu/game-over — navigate, buy/equip, close.
    if (this.state === 'drydock') {
      if (startEdge) this._dryDockAct();
      if (this.input.pressed('up')) this._dryDockMove(-1);
      if (this.input.pressed('down')) this._dryDockMove(1);
      const rows = this._dryDockRows();
      for (let i = 0; i < rows.length; i++) if (this.input.consumeButton('dd' + i)) { this.ddSel = i; this._dryDockAct(); break; }
      this.ddDeny = Math.max(0, this.ddDeny - dt);
      this.input.endFrame(); return;
    }
    if (startEdge && this.state !== 'playing') { this.audio.ensure(); this.audio.resume(); this.onAction(); }

    // Sailing to a new reef: brief transition, then a fresh cave.
    if (this.state === 'sailing') {
      this.sailT += dt;
      if (this.sailT > 1.8) this._newReef();
      this.input.endFrame(); return;
    }
    if (this.state !== 'playing') { this.input.endFrame(); return; }
    if (this.zone === 'stage') { this._updateStage(dt); this.input.endFrame(); return; }
    if (this.zone === 'whirlpool') { this._updateWhirlpool(dt); this.input.endFrame(); return; }
    // Switch weapons (keyboard Q/E or [ ], gamepad Y/LB, touch weapon button).
    if (this.input.pressed('weaponNext') || this.input.consumeButton('weapon')) this._cycleWeapon(1);
    if (this.input.pressed('weaponPrev')) this._cycleWeapon(-1);
    this.weaponSwapT = Math.max(0, this.weaponSwapT - dt);
    // Ease the weapon carousel toward the selected slot (the slide animation).
    this._carouselPos = (this._carouselPos ?? this.weaponIdx) + (this.weaponIdx - (this._carouselPos ?? this.weaponIdx)) * Math.min(1, dt * 12);
    // Light a flare (illuminates dark caves).
    if ((this.input.pressed('flare') || this.input.consumeButton('flare')) && this.flares > 0 && this.flareT <= 0.2) {
      this.flares -= 1; this.flareT = FLARE.duration; this.audio.pickup(); this.particles.sparkle(this.diver.x, this.diver.y, '#ff7a3c', 24);
    }
    this.flareT = Math.max(0, this.flareT - dt);
    // Toggle the torch (a sustained, battery-powered dark-cave light). It shares
    // the shock-rod battery, so it's light-now vs. zaps-later.
    if (this.hasTorch && (this.input.pressed('torch') || this.input.consumeButton('torch'))) {
      if (!this.torchOn && this.shockBattery <= 0) { this.audio.gasp(); }   // can't light a dead battery
      else { this.torchOn = !this.torchOn; this.audio.select(); }
    }
    // Brief grace after entering play (from a menu/shop) so the fire button
    // that started the game / closed the shop doesn't waste a shot.
    this._fireGrace = Math.max(0, (this._fireGrace || 0) - dt);
    const graced = this._fireGrace > 0;
    // Touch tap-to-fire (a tap anywhere) shoots once. Keyboard/mouse/gamepad
    // firing is resolved from the held state below (tap = release; hold = aim).
    // A charge detonates only on a *fresh* trigger: drop the lock the moment the
    // fire control is no longer held (covers both touch taps and key/mouse holds).
    if (!this.input.fireHeld()) this._chargeLock = false;
    // The steering finger is now steer-only: a brief steer touch used to read as
    // a "tap fire" and loose off accidental harpoons. Consume the tap so it
    // can't leak into another state, but DON'T fire — firing on touch is the
    // 🎯/FIRE button (tap = shot, hold = aim) and the second finger. (No effect
    // on keyboard/mouse/gamepad, which never set the tap-fire flag.)
    this.input.consumeTapFire();
    this.fireCd = Math.max(0, this.fireCd - dt);
    // Speargun burst: fire the queued shots out over a few frames.
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        const j = (SPEARGUN.shots - this.burst) - (SPEARGUN.shots - 1) / 2;
        this._spear(j * SPEARGUN.spread);
        this.speargunAmmo = Math.max(0, this.speargunAmmo - 1);   // one spear per shot
        this.burst -= 1; this.burstT = SPEARGUN.interval;
      }
    }
    this.multiFireT = Math.max(0, this.multiFireT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.speedT = Math.max(0, this.speedT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.shockT = Math.max(0, this.shockT - dt);
    this._ammoFlash = Math.max(0, (this._ammoFlash || 0) - dt);   // out-of-ammo indicator blink
    // Ominous heartbeat when air runs low (< 25%): the interval tightens the
    // lower it gets, so the pulse quickens as you approach suffocation.
    const airFrac = this.air / this.airMax;
    if (airFrac < 0.25 && airFrac > 0) {
      this._heartT = (this._heartT || 0) - dt;
      if (this._heartT <= 0) { this.audio.heartbeat(); this._heartT = 0.55 + airFrac * 3.0; }   // ~1.3s at 25% → ~0.55s near empty
    } else {
      this._heartT = 0;
    }
    if (this.torchOn) {
      // Torch burns the shared battery; it cuts out (and stays off) when flat.
      this.shockBattery = Math.max(0, this.shockBattery - TORCH.drain * dt);
      if (this.shockBattery <= 0) { this.torchOn = false; this.audio.gasp(); }
    } else {
      this.shockBattery = Math.min(SHOCK.batteryMax, this.shockBattery + SHOCK.recharge * dt);   // slow recharge
    }
    if (this.shieldT > 0) this.diver.invuln = Math.max(this.diver.invuln, 0.1);   // shield = invulnerable

    // Hold to AIM, RELEASE to fire: while held (past a brief pre-hold) the diver
    // roots and the reticle swings toward the nearest threat at the aim rate
    // (slow at L1, faster with Targeting upgrades). Letting go fires ONE shot
    // along the current reticle — a locked shot if you held long enough for the
    // swing to land, a miss if you released early. Aim speed and fire rate are
    // independent (see AIM in config).
    const holding = graced ? false : this.input.fireHeld();
    const released = !holding && this._prevHolding;
    if (holding) this.fireHeldT += dt; else this.fireHeldT = 0;
    let intent = this.input.vector();
    const engaged = holding && this.fireHeldT >= AIM.threshold;   // past the brief pre-hold
    const threat = this._acquireAimTarget(engaged);
    this.aiming = !!threat; this.aimTarget = threat;
    if (this.aiming) { intent = { x: 0, y: 0 }; this.diver.vx *= 0.55; this.diver.vy *= 0.55; }   // hold position while aiming

    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y), (this.speedT > 0 ? POWERUP.speedMult : 1) * this._relicSwimMult);

    if (this.aiming) {
      // Swing the reticle onto the target — but do NOT fire here; release fires.
      const ta = Math.atan2(threat.y - this.diver.y, threat.x - this.diver.x);
      const rate = AIM.aimRateBase + AIM.aimRatePerLevel * (this.aimLevel - AIM.unlockLevel);
      this.aimAngle = this._angleToward(this.aimAngle, ta, rate * dt);
      this.diver.aimX = Math.cos(this.aimAngle); this.diver.aimY = Math.sin(this.aimAngle);
    } else if (!(released && this._prevAiming)) {
      // Sync the reticle to facing — EXCEPT on the frame we release out of an
      // aim, so the aimed angle survives to fire at the target below.
      this.aimAngle = Math.atan2(this.diver.aimY, this.diver.aimX);
    }
    // Release fires one shot ALONG THE RETICLE. diver.update() re-points the
    // diver's aim at its travel each frame, so we overwrite aimX/aimY from
    // aimAngle right before firing — otherwise a released aim shot flies straight
    // instead of at the target. `!graced` swallows the zone/game-entry press.
    if (released && !graced) {
      this.diver.aimX = Math.cos(this.aimAngle); this.diver.aimY = Math.sin(this.aimAngle);
      this.fire();
    }
    this._prevAiming = this.aiming;
    this._prevHolding = holding;
    for (const cur of this.currents) cur.apply(this.diver, dt);   // swept by the flow
    this.cave.collide(this.diver);
    this.cave.reveal(this.diver.x, this.diver.y, 5);              // lift the fog of war

    // 2D camera follows the diver, clamped to the world.
    const tx = Math.max(0, Math.min(WW - W, this.diver.x - W / 2));
    const ty = Math.max(0, Math.min(WH - H, this.diver.y - H / 2));
    this.camX += (tx - this.camX) * Math.min(1, dt * 6);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    this.depthReached = Math.max(this.depthReached, this.diver.y - WORLD.SURFACE);
    this.audio.setDepth(Math.min(1, this.camY / WH));

    // Air economy: bank + refill at the boat or a dive bell (reef only); vents
    // in the deep. Bells are mid-depth safe havens — bank & refuel, but you
    // still surface to the boat to sail on.
    const atBoat = this.zone === 'reef' && this.boat.contains(this.diver);
    let atBell = null;
    for (const b of this.bells) { b.update(dt); if (!atBell && b.contains(this.diver)) atBell = b; }
    this.atBell = atBell;
    const atStation = atBoat || atBell;
    let inVent = false;
    for (const v of this.vents) { v.update(dt, this.t, (x, y, r) => this.particles.bubble(x, y, { r })); if (!inVent && v.collects(this.diver, this.t)) inVent = true; }

    if (atStation) {
      const rate = atBell ? BELL.refillPerSec : AIR.refillPerSec;
      if (this.air < this.airMax) { this.air = Math.min(this.airMax, this.air + rate * dt); if (Math.random() < 0.3) this.audio.refill(); }
      // The boat is home — it auto-banks the haul at full value. A dive bell only
      // banks on demand (below), at a depth-scaled discount, so you can top up air
      // there and still carry a rich haul up to the boat for full value.
      if (atBoat && (this.carried > 0 || this.carriedPearls > 0)) this._bankLoot();
      // Pressure Plating recharges once you're back home at the boat.
      if (atBoat && this._relicPlating) this._platingReady = true;
      // Hold ↑ into the boat to sail on — once you've banked the relic or the goal.
      if (atBoat && this.carried === 0 && this.canSail && intent.y < -0.3) { this.dockHold += dt; if (this.dockHold > 1.0) this._setSail(); }
      else this.dockHold = 0;
      // Touch players tap the on-screen SAIL ON button instead of holding ↑.
      if (atBoat && this.input.consumeButton('sail') && this.carried === 0 && this.canSail) this._setSail();
    } else {
      this.dockHold = 0;
      // deeper reefs = less air; the abyss adds its own 150% on-foot penalty
      // (negated while piloting the mini-sub).
      const oxyMult = oxygenMultiplier(this.reef, this.zone, this.inSub);
      this.air -= (AIR.drainPerSec + this.diver.y * AIR.drainDepthFactor) * oxyMult * dt;
      if (inVent) { this.air = Math.min(this.airMax, this.air + AIR.ventRefillPerSec * dt); if (Math.random() < 0.2) this.audio.refill(); }
      if (this.air <= 0) { this.air = 0; this._loseLife(); }
      else if (this.air < 20 && Math.random() < 0.02) this.audio.gasp();
    }
    // Open the shop while docked. The boat auto-banked, so it opens empty-handed;
    // a dive bell opens with loot too — banking there (at its depth discount) is a
    // choice offered inside the shop, so you can bank deep or carry up to the boat.
    if (atStation && (this.input.pressed('shop') || this.input.consumeButton('shop'))) {
      if (atBell) this._openShop('bell');
      else if (atBoat && this.carried === 0) this._openShop('boat');
    }

    // Entities.
    const emitBig = (x, y) => this.bigBubbles.push(new BigBubble(x, y));
    for (const s of this.shells) s.update(dt, this.t, emitBig);
    for (const b of this.bigBubbles) b.update(dt, this.cave);
    for (const tr of this.treasures) tr.update(dt, this.t);
    const lit = this.flareT > 0 || (this.torchOn && this.shockBattery > 0);
    for (const cr of this.creatures) {
      if (cr.snareT > 0) { cr.snareT -= dt; if (cr.vx !== undefined) { cr.x += cr.vx * dt; cr.y += cr.vy * dt; cr.vx *= 0.9; cr.vy *= 0.9; } this.cave.collide(cr); continue; }  // netted/stunned: held in place
      cr.update(dt, this.t, this.diver, lit);
      if (this.cave.collide(cr) && cr.dir !== undefined) cr.dir = cr._nx > 0 ? -1 : 1; // turn off walls
    }
    for (const h of this.harpoons) h.update(dt, this.cave);
    for (const n of this.nets) n.update(dt, this.cave);
    for (const ch of this.charges) { ch.update(dt, this.cave); if (ch.exploded) this._explode(ch); }
    if (this.armedCharge && this.armedCharge.dead) this.armedCharge = null;
    for (const ex of this.explosions) { ex.t += dt; ex.r += (ex.maxR - ex.r) * Math.min(1, dt * 12); }
    this.explosions = this.explosions.filter((e) => e.t < 0.4);
    for (const k of this.krakens) { k.update(dt, this.t, this.diver); if (this.diver.invuln <= 0 && k.hits(this.diver)) this._hit(); }
    for (const pu of this.powerups) { pu.update(dt, this.t); if (!pu.taken && pu.reached(this.diver)) { pu.taken = true; this._applyPowerUp(pu.type); } }
    for (const cr of this.crates) { cr.update(dt, this.t); if (this.zone === 'reef' && cr.reached(this.diver)) { cr.taken = true; this._openCrate(); } }
    // Relic objective — pick it up, carry it back to the boat to bank it.
    if (this.relic && !this.relic.taken) {
      this.relic.update(dt, this.t);
      if (this.zone === 'reef' && this.relic.reached(this.diver)) {
        this.relic.taken = true; this.carryingRelic = true; this.carried += RELIC.value;
        // Bank a one-use reef-skip token the instant it's found (persist now, so
        // it's kept even if the run ends before sailing on).
        bankReefRelic(this.meta, this.reef); saveSalvage(this.meta);
        this.particles.sparkle(this.relic.x, this.relic.y, PAL.key, 30); this.audio.gem();
      }
    }
    // Treasure magnet: pull nearby loot toward the diver. The powerup is a
    // strong timed burst; the Magnet Core relic is a permanent, gentler pull
    // that stays on even with no powerup active.
    if (this.magnetT > 0 || this._relicMagnet) {
      const dv = this.diver, powered = this.magnetT > 0;
      const R = powered ? POWERUP.magnetRadius : POWERUP.magnetRadius * 0.5;
      const maxPull = powered ? POWERUP.magnetPull : POWERUP.magnetPull * 0.5;
      for (const tr of this.treasures) {
        if (tr.locked && !this.hasKey) continue;
        const dx = dv.x - tr.x, dy = dv.y - tr.baseY, dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < R) {
          const speed = 130 + (maxPull - 130) * (1 - dist / R);
          const step = Math.min(dist, speed * dt);
          tr.x += (dx / dist) * step; tr.baseY += (dy / dist) * step;
        }
      }
      // The magnet also reaches into OPEN CHESTS within range and pulls their
      // loot to you — but NOT clams: their pearls you still earn by swimming in.
      for (const s of this.shells) {
        if (s instanceof Clam) continue;
        if (!s.hasLoot || s.open <= SHELL.openGrab) continue;
        if (Math.hypot(dv.x - s.x, dv.y - s.y) < R) {
          this.carried += s.takeLoot();
          this.particles.sparkle(s.x, s.y, s.lootColor, 20);
          this.audio.pearl();
        }
      }
    }

    // Zone transitions & puzzles.
    const d = this.diver;
    if (this.zone === 'reef') {
      // reentryT: brief grace after returning so we don't instantly re-enter the
      // special zone we just left (the diver is dropped back near its entrance).
      for (const w of this.whales) { w.update(dt, this.t); if (this.reentryT <= 0 && w.swallowReady(d)) { this._enterWhale(w); this.input.endFrame(); return; } }
      if (this.reentryT <= 0 && this.templeGate && Math.hypot(d.x - this.templeGate.x, d.y - this.templeGate.y) < this.templeGate.r + d.radius) { this._enterTemple(this.templeGate); this.input.endFrame(); return; }
      for (const e of this.stageEntrances) { if (this.reentryT <= 0 && e.contains(d)) { this._enterStage(e); this.input.endFrame(); return; } }
      if (this.reentryT <= 0 && this.abyssEntrance) {
        const distMaw = Math.hypot(d.x - this.abyssEntrance.x, d.y - this.abyssEntrance.y);
        const buyRing = distMaw < this.abyssEntrance.r + d.radius + 90;   // wider ring: buy here without diving
        const atMaw = distMaw < this.abyssEntrance.r + d.radius;          // inner zone: swim in to dive
        // Buy the mini-sub anywhere in the outer ring (once per reef), so you can
        // purchase before you reach the dive-in zone. The SHOP control here doesn't
        // conflict with the boat/bell shop, which only opens `atStation`.
        if (buyRing && !this.hasSub && (this.input.pressed('shop') || this.input.consumeButton('shop'))) {
          if (this.gold >= ABYSS.subCost) {
            this.gold -= ABYSS.subCost; this.hasSub = true;
            this.puName = 'MINI-SUB READY'; this.puCol = PAL.gateGlow; this.puT = 1.8; this.audio.bank();
          } else { this.puName = `NEED ⚙${ABYSS.subCost}`; this.puCol = PAL.danger; this.puT = 1.0; this.audio.gasp(); }
          this.input.endFrame(); return;   // consume the press so we don't also dive this frame
        }
        if (atMaw) { this._enterAbyss(this.abyssEntrance); this.input.endFrame(); return; }
      }
      if (this.reentryT <= 0 && this.whirlEntrance && Math.hypot(d.x - this.whirlEntrance.x, d.y - this.whirlEntrance.y) < this.whirlEntrance.r + d.radius) {
        this._enterWhirlpool(this.whirlEntrance); this.input.endFrame(); return;
      }
    } else if (this.zone === 'belly' && this.whaleExit) {
      const e = this.whaleExit;
      if (Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) { this._exitWhale(); this.input.endFrame(); return; }
    } else if (this.zone === 'abyss' && this.abyssExit) {
      const e = this.abyssExit;
      if (Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) { this._exitAbyss(); this.input.endFrame(); return; }
    } else if (this.zone === 'temple') {
      // Key: grab it to unlock the door and the vault.
      if (this.key && !this.key.taken && Math.hypot(d.x - this.key.x, d.y - this.key.y) < this.key.r + d.radius) {
        this.key.taken = true; this.hasKey = true;
        // Wake the temple's stone guardians — Sentinels start passive, only
        // guarding within their territory, until the key is disturbed.
        for (const cr of this.creatures) if (cr.awake === false) cr.awake = true;
        this.particles.sparkle(this.key.x, this.key.y, PAL.key, 22); this.audio.pearl();
      }
      // Door: opens once you have the key; blocks the passage until then.
      if (this.door) {
        if (this.hasKey) this.door.open = Math.min(1, this.door.open + dt * 1.4);
        if (this.door.open < 0.5) this._blockDoor(d);
      }
      const e = this.templeExit;
      if (e && Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) { this._exitTemple(); this.input.endFrame(); return; }
    }

    this._collisions();

    this.treasures = this.treasures.filter((tr) => !tr.taken);
    this.creatures = this.creatures.filter((cr) => !cr.dead);
    this.harpoons = this.harpoons.filter((h) => !h.dead);
    this.nets = this.nets.filter((n) => !n.dead);
    this.charges = this.charges.filter((c) => !c.dead);
    this.bigBubbles = this.bigBubbles.filter((b) => !b.dead);
    this.krakens = this.krakens.filter((k) => !k.dead);
    this.powerups = this.powerups.filter((p) => !p.taken);
    this.crates = this.crates.filter((c) => !c.taken);

    // Extra lives at escalating score thresholds, capped so they can't snowball.
    while (this.lives < GAME.maxLives && this.score >= this.nextLifeScore) { this.lives += 1; this.nextLifeScore += GAME.lifeScoreStep; this.oneUpT = 2.2; this.audio.bank(); }

    if (this.zone === 'reef' && this.shells.every((s) => !s.hasLoot) && this.treasures.length === 0 && this.carried === 0 && this.carriedPearls === 0 && this.diver.atSurface) this._win();

    this.input.endFrame();
  }

  _collisions() {
    const d = this.diver;
    for (const tr of this.treasures) {
      if (tr.locked && !this.hasKey) continue;   // vault loot needs the key
      if (!tr.taken && tr.reached(d)) {
        tr.taken = true;
        if (tr.pearl) {
          // Black Pearl: carried at risk like loot, but tracked separately —
          // it converts to Salvage on banking, not to in-run `carried` value.
          this.carriedPearls = (this.carriedPearls || 0) + 1;
          this.particles.sparkle(tr.x, tr.y, PAL.blackPearlSheen, 22);
          this.audio.blackpearl();
        } else {
          this.carried += tr.value;
          this.particles.sparkle(tr.x, tr.y, tr.kind === 'gem' ? PAL.gem : PAL.gold, tr.kind === 'coin' ? 12 : 18);
          tr.kind === 'gem' ? this.audio.gem() : this.audio.pickup();
        }
      }
    }
    // Shells (clams & chests): grab loot while open, get bitten when they shut.
    for (const s of this.shells) {
      if (s.canTakeLoot(d)) {
        this.carried += s.takeLoot();
        this.particles.sparkle(s.x, s.y, s.lootColor, 24);
        this.audio.pearl();
      } else if (s.bites(d) && d.invuln <= 0) {
        this._hit();
      }
    }
    // Big air bubbles from opening shells — collect to refill air.
    for (const b of this.bigBubbles) {
      if (!b.dead && b.collected(d)) {
        b.dead = true;
        this.air = Math.min(this.airMax, this.air + BUBBLE.air);
        this.particles.sparkle(b.x, b.y, PAL.air, 12);
        this.audio.refill();
      }
    }
    for (const h of this.harpoons) {
      if (h.dead) continue;
      for (const cr of this.creatures) {
        if (!cr.dead && h.hits(cr)) {
          h.dead = true;
          const died = this._damageCreature(cr);
          if (died) {
            this.score += cr.points;
            this.particles.sparkle(cr.x, cr.y, PAL.danger, 20);
            this.audio.kill();
          } else {
            // Mini-boss chipped, not killed — a lighter hurt effect instead.
            this.particles.sparkle(cr.x, cr.y, PAL.danger, 10);
            this.audio.hit();
          }
          break;
        }
      }
      // Harpoon vs kraken — chip its health; big reward on defeat.
      if (!h.dead) for (const k of this.krakens) {
        if (k.hp > 0 && k.harpoonHit(h)) {
          h.dead = true; k.takeDamage(1);
          this.score += KRAKEN.hitPoints;
          const tip = h.tip(); this.particles.sparkle(tip.x, tip.y, PAL.krakenEye, 16); this.audio.kill();
          if (k.hp === 0) {
            this.score += KRAKEN.killBonus; this.shake = 16; this.flash = 0.6;
            this.particles.sparkle(k.x, k.y, PAL.gold, 40); this.audio.bank();
            this.bossesFelled = (this.bossesFelled || 0) + 1;
            for (let n = 0; n < 6; n++) this.treasures.push(new Treasure(k.x + (Math.random() - 0.5) * 120, k.y + (Math.random() - 0.5) * 120, 'gem'));
          }
          break;
        }
      }
    }
    // Nets snare the first creature they touch (crowd control, not a kill).
    for (const n of this.nets) {
      if (n.dead) continue;
      for (const cr of this.creatures) {
        if (!cr.dead && cr.snareT <= 0 && !cr.netImmune && n.hits(cr)) {
          cr.snareT = NET.snare + (this.weaponLevel.net - 1) * 1.5; n.dead = true;
          if (cr.vx !== undefined) { cr.vx = 0; cr.vy = 0; }
          this.particles.sparkle(cr.x, cr.y, '#dbe9f2', 12); this.audio.pickup();
          break;
        }
      }
    }
    // Contact damage — but a snared (netted/stunned) creature is harmless to swim past.
    if (d.invuln <= 0) {
      for (const cr of this.creatures) { if (cr.snareT <= 0 && cr.hits(d)) { this._hit(); break; } }
    }
  }

  // Depth-charge blast: kill every creature in range and chip any kraken.
  _explode(ch) {
    if (this.armedCharge === ch) this.armedCharge = null;
    this.shake = Math.max(this.shake, 14); this.flash = Math.max(this.flash, 0.4);
    this.particles.sparkle(ch.x, ch.y, PAL.puffer, 40);
    this.particles.sparkle(ch.x, ch.y, PAL.gold, 20);
    this.explosions.push({ x: ch.x, y: ch.y, r: ch.size, maxR: ch.blast, t: 0 });   // expanding shockwave
    this.audio.kill();
    const R = ch.blast;
    // Caught in your own blast? Lose half your air.
    const d = this.diver;
    if (Math.hypot(d.x - ch.x, d.y - ch.y) < R + d.radius) {
      this.air = Math.max(0, this.air * (1 - CHARGE.diverAirLoss));
      this.flash = 1; this.shake = Math.max(this.shake, 16); this.diver.hurtT = 0.4;
      this.particles.sparkle(d.x, d.y, PAL.airLow, 20);
    }
    for (const cr of this.creatures) {
      if (!cr.dead && Math.hypot(cr.x - ch.x, cr.y - ch.y) < R + (cr.radius || 14)) {
        if (this._damageCreature(cr)) this.score += cr.points;
        this.particles.sparkle(cr.x, cr.y, PAL.danger, 14);
      }
    }
    for (const k of this.krakens) {
      if (k.hp > 0 && Math.hypot(k.x - ch.x, k.y - ch.y) < R + k.radius) {
        k.takeDamage(2); this.score += KRAKEN.hitPoints * 2;
        if (k.hp === 0) { this.score += KRAKEN.killBonus; this.particles.sparkle(k.x, k.y, PAL.gold, 40); this.audio.bank(); this.bossesFelled = (this.bossesFelled || 0) + 1; for (let n = 0; n < 6; n++) this.treasures.push(new Treasure(k.x + (Math.random() - 0.5) * 120, k.y + (Math.random() - 0.5) * 120, 'gem')); }
      }
    }
  }

  _hit() {
    // Pressure Plating negates the first hit each dive (no life lost, no loot
    // spill), then must recharge at the boat before it protects again.
    if (this._platingReady) {
      this._platingReady = false;
      this.puName = 'PLATING HELD!'; this.puCol = PAL.air; this.puT = 1.2;
      this.audio.select && this.audio.select();
      return;
    }
    // The mini-sub's hull absorbs the first contact hit each abyss dive (no
    // life/loot lost), then must be re-boarded (a fresh _enterAbyss) to reset.
    if (this.inSub && this._subHull) {
      this._subHull = false;
      this.puName = 'HULL HIT!'; this.puCol = PAL.air; this.puT = 1.0;
      return;
    }
    this.diver.hit(); this.flash = 1; this.shake = 12;
    this.audio.hit();
    // A hit spills some of your un-banked haul — deep, loaded runs are now risky.
    if (this.carried > 0 && GAME.hitLootPenalty > 0) {
      const lost = Math.round(this.carried * GAME.hitLootPenalty);
      if (lost > 0) { this.carried -= lost; this.puName = `−${lost} LOOT!`; this.puCol = PAL.danger; this.puT = 1.6; }
    }
    this._loseLife('killed');
  }

  _loseLife(cause = 'air') {
    this.lives -= GAME.hitCost;
    if (this.lives <= 0) { this.deathCause = cause; this._gameOver(); return; }
    this.air = Math.max(this.air, this._relicSecondWind ? 60 : 35);
    this.diver.invuln = GAME.invulnAfterHit;
    this.diver.y = Math.max(WORLD.SURFACE + 40, this.diver.y - 70);
  }

  _gameOver() {
    if (this.state === 'gameover') return;   // re-entrancy guard: a same-frame
    // second death (e.g. air runs out AND a creature touches you) must not award
    // the Salvage payout twice — the payout is a non-idempotent side effect.
    this.state = 'gameover';
    this.audio.gasp();
    if (this.score > this.hi) {
      this.hi = this.score; this.hiReef = this.reef; this.newHi = true;
      localStorage.setItem(HI_KEY, String(this.hi));
      localStorage.setItem(HI_REEF_KEY, String(this.hiReef));
    } else this.newHi = false;
    this.lastPayout = runPayout({ deepestReef: this.reef, bosses: this.bossesFelled, relicsBanked: this.relicsBanked });
    this.meta.salvage += this.lastPayout;
    saveSalvage(this.meta);
  }

  _win() {
    this.score += Math.round(this.air) * 5 + this.lives * 500;
    this.won = true;
    this._gameOver();
  }

  // Board the boat and set sail for a fresh reef (score & lives carry over).
  _setSail() {
    this.state = 'sailing'; this.sailT = 0; this.reef += 1; this.dockHold = 0;
    this.hasSub = false; this.inSub = false;   // the mini-sub is bought per-reef
    this._newReefName();   // name the destination so the sail screen can show it
    this.audio.select();
  }
  _newReef() {
    this._generateWorld();
    this.hasSub = false; this.inSub = false;   // per-reef: buy it again on the new reef
    this.diver.reset();
    if (this._relicChart) this.cave.reveal(this.diver.x, this.diver.y, 14);
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.air = this.airMax;
    this.state = 'playing';
    this.audio.bank();
  }

  // ---- special zones (whale belly, temple) ---------------------------
  // Snapshot the whole reef and where to drop the diver when they come back.
  get canSail() { return this.relicBanked || this.reefBanked >= this.reefGoal; }

  _snapshotReef(returnX, returnY) {
    const keys = ['cave', 'shells', 'treasures', 'creatures', 'vents', 'wrecks', 'flora', 'skeletons', 'bigBubbles', 'whales', 'ribs', 'currents', 'krakens', 'templeGate', 'powerups', 'relic', 'bells', 'crates', 'darkZones', 'stageEntrances', 'abyssEntrance', 'whirlEntrance'];
    const snap = { returnX, returnY };
    for (const k of keys) snap[k] = this[k];
    this.savedReef = snap;
  }
  _restoreReef() {
    const s = this.savedReef; if (!s) return;
    const keys = ['cave', 'shells', 'treasures', 'creatures', 'vents', 'wrecks', 'flora', 'skeletons', 'bigBubbles', 'whales', 'ribs', 'currents', 'krakens', 'templeGate', 'powerups', 'relic', 'bells', 'crates', 'darkZones', 'stageEntrances', 'abyssEntrance', 'whirlEntrance'];
    for (const k of keys) this[k] = s[k];
    this.zone = 'reef';
    this.whaleExit = null; this.templeExit = null; this.abyssExit = null; this.door = null; this.key = null; this.hasKey = false; this.columns = [];
    this.whirlExit = null; this.whirlShaft = null; this.whirlObstacles = []; this.whirlSpeed = 0; this.whirlScore = 0;
    this.whirlTier = 0; this.whirlSalvageEarned = 0; this.whirlBubbles = []; this.whirlTreasures = [];
    this._placeDiver(s.returnX, s.returnY, 0);
    this.savedReef = null; this.zoneFade = 1;
    this.reentryT = 1.5;   // grace so we don't immediately re-enter what we just left
    this.audio.bank();
  }

  // Swallowed! Snapshot the reef, generate the belly, drop the diver inside.
  _enterWhale(whale) {
    const m = whale.mouthZone();
    this._enteredWhale = whale;
    this._snapshotReef(m.x + whale.facing * 34, m.y);
    this.zone = 'belly';
    this._generateBelly();
    // Spawn at the throat exit (top of the main shaft), like the temple/abyss:
    // full air with the exit right there, then descend into the belly for loot
    // and climb back to leave. The old deep-random spawn could strand the diver
    // in a pocket with no reachable air vent — a suffocation soft-lock.
    const c = this.cave.nearestOpen(this.whaleExit.x, this.whaleExit.y + 90) || { x: WW / 2, y: OPEN_BAND + 60 };
    this._placeDiver(c.x, c.y, 0);
    this.shake = 10; this.zoneFade = 1;
    this.audio.gasp();
  }
  // Leaving the whale consumes it — like the temple, a plundered special zone's
  // entrance is spent, so the whale that swallowed you is gone when you return.
  _exitWhale() {
    this._restoreReef();
    this.whales = this.whales.filter((w) => w !== this._enteredWhale);
    this._enteredWhale = null;
  }

  // Enter the sunken temple through its gate.
  _enterTemple(gate) {
    this._snapshotReef(gate.x, gate.y + 50);
    this.zone = 'temple';
    this._generateTemple();
    // Drop in at the top of the temple's central shaft, just inside the entrance
    // gate — the exit is then right above you, so you descend to loot and climb
    // back to leave, rather than spawning deep and having to find the way up.
    this._placeDiver(this.templeExit.x, this.templeExit.y + 90, 0);
    this.shake = 8; this.zoneFade = 1;
    this.audio.select();
  }
  // Leaving the temple consumes its gate — you've plundered it, so it won't
  // re-trigger (and won't sit there re-swallowing you at the return point).
  _exitTemple() { this._restoreReef(); this.templeGate = null; }

  // Dive the abyss entrance — a deep, dark trench off the reef. Mirrors
  // _enterTemple: snapshot the reef, generate the abyss, drop the diver in
  // just inside the exit so the way back up is right there.
  _enterAbyss(entrance) {
    this._snapshotReef(entrance.x, entrance.y + 50);
    this.zone = 'abyss';
    this._generateAbyss();
    this._placeDiver(this.abyssExit.x, this.abyssExit.y + 90, 0);
    // Board the sub if owned — negates the air penalty (oxygenMultiplier) and
    // absorbs one hit (_hit) this dive; otherwise you're diving on foot.
    this.inSub = this.hasSub;
    this._subHull = this.inSub;
    this.shake = 8; this.zoneFade = 1;
    this.audio.select();
  }
  // Leaving the abyss consumes its entrance — like the temple, a plundered
  // special zone's portal is spent, so it won't re-trigger at the return spot.
  // Disembarking the sub happens here too — ascending out is how you get off.
  _exitAbyss() { this._restoreReef(); this.abyssEntrance = null; this.inSub = false; }

  // Dive the whirlpool maw — a survival sweep down an accelerating shaft.
  // Mirrors _enterAbyss: snapshot the reef, generate the shaft, drop the
  // diver in just below the ascent (bail-out) exit at the top. No sub, no
  // extra air penalty — the ramping sweep speed is the whole danger. The run
  // NEVER costs a life on the way out; see _updateWhirlpool/_exitWhirlpool.
  _enterWhirlpool(entrance) {
    this._snapshotReef(entrance.x, entrance.y + 50);
    this.zone = 'whirlpool';
    this._generateWhirlpool();
    this._placeDiver(this.whirlExit.x, this.whirlExit.y + 90, 0);
    this.whirlSpeed = WHIRL.baseSpeed;
    this.whirlScore = 0; this.whirlTier = 0; this.whirlSalvageEarned = 0;
    this.shake = 10; this.zoneFade = 1;
    this.audio.gasp();
  }
  // Leaving the whirlpool (hit an obstacle, ran out of air, or bailed at the
  // top exit) consumes its entrance — like the abyss, a plundered portal is
  // spent. NEVER call this in a way that also calls _loseLife: the whirlpool
  // never costs a life. The caller banks whirlScore/loot into this.score
  // first (see _updateWhirlpool's `bank()` closure).
  _exitWhirlpool() {
    this._restoreReef();
    this.whirlEntrance = null;
    this.whirlSpeed = 0; this.whirlScore = 0; this.whirlObstacles = []; this.whirlShaft = null;
    this.whirlTier = 0; this.whirlSalvageEarned = 0; this.whirlBubbles = []; this.whirlTreasures = [];
  }

  // Enter a themed platformer stage through a reef entrance. Snapshots the reef,
  // builds the stage, seals the air. Mirrors _enterWhale/_enterTemple.
  _enterStage(entrance) {
    this._snapshotReef(entrance.x, entrance.y + STAGE.entranceR + 10);
    this._enteredEntrance = entrance;
    this.zone = 'stage';
    const seed = (Math.random() * 0x100000000) >>> 0;
    const rooms = makeStageRooms(entrance.theme, this.reef, mulberry32(seed));
    // generated rooms carry no hand-authored decor (its coords are tied to the
    // old room layouts); render reads theme.decor?.[i] || [] so an absent
    // decor is safe.
    this.stage = new Stage({ ...entrance.theme, rooms, decor: undefined });
    this.camX = 0; this.camY = 0;   // fixed single-screen camera in-stage
    this.shake = 8; this.zoneFade = 1;
    this.audio.select();
  }

  // Drive the stage: translate Input → command, apply loot/death/exit events.
  _updateStage(dt) {
    const inp = this.input;
    const v = inp.vector();
    const up = v.y < -0.4, down = v.y > 0.4;
    const moveX = Math.abs(v.x) > 0.3 ? (v.x > 0 ? 1 : -1) : 0;
    const climbY = up ? -1 : down ? 1 : 0;
    // Jump edge: fresh up-press (rising edge), fire press (Space/F/A), tap, or JUMP button.
    const jump = (up && !this._stageUpPrev) || inp.firePress || inp.consumeTapFire() || inp.consumeButton('jump');
    this._stageUpPrev = up;

    const ev = this.stage.update(dt, { moveX, jump, climbY });
    if (ev.loot) {
      this.carried += ev.loot;
      this.particles.sparkle(this.stage.body.x, this.stage.body.y, PAL.gold, 16);
      this.audio.pearl();
    }
    if (ev.died) {
      this.flash = 1; this.shake = 12; this.audio.hit();
      this._loseLife('killed');
      if (this.state === 'playing') this.stage.respawn();   // still alive → back to room start
    }
    // No backing out: only reaching the forward exit completes the stage and
    // returns you to the reef. (The engine never emits 'retreat' now — the rooms
    // have no retreat door — but gate on 'complete' explicitly so a stage is
    // strictly commit-and-finish: complete it, or keep trying until your lives
    // run out.)
    if (ev.exited === 'complete') this._exitStage();
  }

  // Leave the stage on completion. Restores the reef and consumes the
  // entrance (one-shot), mirroring _exitWhale filtering the entered whale.
  _exitStage() {
    this._restoreReef();
    this.stageEntrances = this.stageEntrances.filter((e) => e !== this._enteredEntrance);
    this._enteredEntrance = null;
    this.stage = null;
    this._fireGrace = 0.3;   // the exit/jump press shouldn't fire a harpoon back in the reef
  }

  // Drive the whirlpool sweep: an accelerating forced downward current owns
  // vertical motion outright; the player only steers laterally to dodge the
  // shaft's obstacles. Three ways out — an obstacle hit, air hitting zero, or
  // swimming back up to the top exit — all bank whirlScore into this.score
  // and call _exitWhirlpool(). NONE of them call _loseLife: the whirlpool
  // never costs a life, win or lose, by design.
  _updateWhirlpool(dt) {
    const d = this.diver, shaft = this.whirlShaft;
    // The sweep ramps forever (capped at maxSpeed) — it never gets easier.
    this.whirlSpeed = Math.min(WHIRL.maxSpeed, this.whirlSpeed + WHIRL.accel * dt);
    this.whirlT += dt;

    // Endless streaming: spawn obstacles + collectibles ahead of the diver, at a
    // density that ramps from LOW to peak over WHIRL.rampSecs, and recycle
    // anything that has scrolled above. Row gap tightens as the ramp climbs.
    const ramp = Math.min(1, this.whirlT / WHIRL.rampSecs);
    const rowGap = WHIRL.rowGapStart + (WHIRL.rowGapEnd - WHIRL.rowGapStart) * ramp;
    const ahead = d.y + H * 1.4;
    while (this.whirlNextObstacleY < ahead) { this._whirlSpawnRow(this.whirlNextObstacleY, ramp); this.whirlNextObstacleY += rowGap; }
    while (this.whirlNextBubbleY < ahead) {
      this.whirlBubbles.push({ x: this._whirlRandX(BUBBLE.r), y: this.whirlNextBubbleY, r: BUBBLE.r, taken: false, phase: Math.random() * Math.PI * 2 });
      this.whirlNextBubbleY += WHIRL.bubbleGap * (0.7 + Math.random() * 0.6);
    }
    while (this.whirlNextTreasureY < ahead) {
      const n = ++this.whirlTreasuresSeeded;
      const kind = (n % WHIRL.pearlEvery === 0) ? 'blackpearl' : (Math.random() < 0.5 ? 'gem' : 'coin');
      this.whirlTreasures.push(new Treasure(this._whirlRandX(14), this.whirlNextTreasureY, kind));
      this.whirlNextTreasureY += WHIRL.treasureGap * (0.7 + Math.random() * 0.6);
    }
    const above = d.y - H;   // recycle everything that has scrolled off the top
    this.whirlObstacles = this.whirlObstacles.filter((o) => o.y > above);
    this.whirlBubbles = this.whirlBubbles.filter((b) => !b.taken && b.y > above);
    this.whirlTreasures = this.whirlTreasures.filter((t) => !t.taken && t.y > above);

    // Lateral steering only — vertical speed is the current's, not physics'.
    const v = this.input.vector();
    d.vx += v.x * DIVER.accel * dt;
    d.vx *= Math.max(0, 1 - DIVER.drag * dt);
    if (d.vx > DIVER.maxSpeed) d.vx = DIVER.maxSpeed; else if (d.vx < -DIVER.maxSpeed) d.vx = -DIVER.maxSpeed;
    d.vy = this.whirlSpeed;

    d.x += d.vx * dt;
    d.y += d.vy * dt;

    // Clamp to the shaft walls — a soft bump (kills lateral speed), not a
    // bounce, so scraping the rock reads as a real cost, not a pinball.
    if (shaft) {
      const left = shaft.cx - shaft.halfW + d.radius, right = shaft.cx + shaft.halfW - d.radius;
      if (d.x < left) { d.x = left; d.vx = 0; } else if (d.x > right) { d.x = right; d.vx = 0; }
      // no bottom — the shaft is endless (the run ends on a hit, air-out, or bail)
    }

    if (Math.abs(d.vx) > 8) d.facing = d.vx > 0 ? 1 : -1;
    d.kick += (Math.abs(d.vx) * 0.03 + 3) * dt;
    if (d.invuln > 0) d.invuln -= dt;
    if (d.hurtT > 0) d.hurtT -= dt;

    // Camera follows straight down — NOT clamped to WH (the shaft is endless);
    // the diver rides above centre so onrushing obstacles are visible in time.
    const tx = Math.max(0, Math.min(WW - W, d.x - W / 2));
    const ty = d.y - H * 0.42;
    this.camX += (tx - this.camX) * Math.min(1, dt * 6);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    this.depthReached = Math.max(this.depthReached, d.y - WORLD.SURFACE);

    // Air drains at a fixed whirlpool rate (depth is unbounded now, so the old
    // depth-scaled drain can't apply). Bubbles refill; the ramping vortex + your
    // air together give a moderate player ~30s. No zone penalty (not 'abyss').
    this.air -= WHIRL.airDrain * dt;

    // Survival score: speed × time, so riding it faster/longer is worth more.
    this.whirlScore += this.whirlSpeed * dt * 0.12;

    // Collect while dodging: bubbles refill air, loot/pearls go to the same
    // carried/carriedPearls piles the reef uses — cashed on exit by bank()
    // below (via _bankLoot), same as banking at the boat.
    for (const b of this.whirlBubbles) {
      if (!b.taken && Math.hypot(d.x - b.x, d.y - b.y) < b.r + d.radius) {
        b.taken = true;
        this.air = Math.min(this.airMax, this.air + BUBBLE.air);
        this.particles.sparkle(b.x, b.y, PAL.air, 12);
        this.audio.refill();
      }
    }
    for (const tr of this.whirlTreasures) {
      if (tr.taken) continue;
      tr.update(dt, this.t);
      if (!tr.reached(d)) continue;
      tr.taken = true;
      if (tr.pearl) {
        this.carriedPearls = (this.carriedPearls || 0) + 1;
        this.particles.sparkle(tr.x, tr.y, PAL.blackPearlSheen, 22);
        this.audio.blackpearl();
      } else {
        this.carried += tr.value;
        this.particles.sparkle(tr.x, tr.y, tr.kind === 'gem' ? PAL.gem : PAL.gold, tr.kind === 'coin' ? 12 : 18);
        tr.kind === 'gem' ? this.audio.gem() : this.audio.pickup();
      }
    }

    // Speed-break tiers: crossing a whirlSpeed threshold awards Salvage +
    // score, once per tier — the `while` loop (rather than a single `if`)
    // means a rare multi-tier jump in one frame (a dt spike) still awards
    // each tier crossed exactly once, never doubled, never skipped.
    // Tiers count speed gained ABOVE the base sweep, so tier 1 requires actually
    // accelerating into the vortex (not a freebie on the first frame).
    const tier = this.whirlSpeed <= WHIRL.baseSpeed ? 0 : Math.floor((this.whirlSpeed - WHIRL.baseSpeed) / WHIRL.tierStep) + 1;
    while (tier > this.whirlTier) {
      this.whirlTier += 1;
      const r = whirlpoolReward(this.whirlTier) - whirlpoolReward(this.whirlTier - 1);   // marginal award for THIS tier
      this.meta.salvage += r; saveSalvage(this.meta);
      this.whirlSalvageEarned += r;
      this.score += WHIRL.tierScore;
      this.puName = `SPEED ${this.whirlTier} · +${r}⚙`; this.puCol = PAL.gateGlow; this.puT = 1.4;
      this.audio.bank();
    }

    // Every exit banks whirlScore + collected loot and hands back a small air
    // floor before restoring the reef — "no life lost" has to hold in
    // practice, not just here: the shared reef drain path (in the general
    // update() flow) would otherwise see air<=0 the very next frame and cost
    // a life there instead, quietly reintroducing the very thing this zone
    // promises not to do. 20 is enough to swim for safety, nothing more.
    const bank = () => {
      this.score += Math.round(this.whirlScore);
      this.air = Math.max(this.air, 20);
      const tierReached = this.whirlTier, earned = this.whirlSalvageEarned;
      this._bankLoot(1);   // cash collected loot + pearls -> score/gold/Salvage, at full rate
      this.puName = `SURVIVED · SPEED ${tierReached} · +${earned}⚙`; this.puCol = PAL.gateGlow; this.puT = 2.2;
    };

    // Obstacle contact ends the run — no life lost, whirlScore banked.
    for (const o of this.whirlObstacles) {
      if (Math.hypot(d.x - o.x, d.y - o.y) < o.r + d.radius) {
        this.shake = 10; this.flash = 0.5; this.audio.hit();
        bank(); this._exitWhirlpool(); return;
      }
    }
    // Air-out ends the run the same way — never a life.
    if (this.air <= 0) {
      this.air = 0;
      bank(); this._exitWhirlpool(); return;
    }
    // Bail at the top exit (swim back up against the current) — a clean
    // escape, banking whirlScore just like the other two exits.
    const e = this.whirlExit;
    if (e && Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) {
      bank(); this._exitWhirlpool(); return;
    }
  }

  _placeDiver(x, y, vx) {
    const d = this.diver;
    d.x = x; d.y = y; d.vx = vx; d.vy = 0; d.invuln = 1.6;
    this.camX = Math.max(0, Math.min(WW - W, x - W / 2));
    this.camY = Math.max(0, Math.min(WH - H, y - H / 2));
  }

  // Push the diver out of the closed temple door (circle vs AABB, min-axis).
  _blockDoor(d) {
    const door = this.door, r = d.radius;
    const left = door.x - r, right = door.x + door.w + r, top = door.y - r, bottom = door.y + door.h + r;
    if (d.x <= left || d.x >= right || d.y <= top || d.y >= bottom) return;
    const pL = d.x - left, pR = right - d.x, pT = d.y - top, pB = bottom - d.y;
    const m = Math.min(pL, pR, pT, pB);
    if (m === pL) { d.x = left; if (d.vx > 0) d.vx = 0; }
    else if (m === pR) { d.x = right; if (d.vx < 0) d.vx = 0; }
    else if (m === pT) { d.y = top; if (d.vy > 0) d.vy = 0; }
    else { d.y = bottom; if (d.vy < 0) d.vy = 0; }
  }

  // ---- render ----------------------------------------------------------
  draw() {
    if (this.state === 'sailing') { this._sailScreen(); return; }
    if (this.zone === 'stage' && this.stage) {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      drawStageScene(ctx, this.stage, this.t);
      ctx.restore();
      if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`; ctx.fillRect(0, 0, W, H); }
      if (this.zoneFade > 0.01) { ctx.fillStyle = `rgba(120,180,220,${0.7 * this.zoneFade})`; ctx.fillRect(0, 0, W, H); }
      drawStageHud(ctx, this.stage, { air: this.air, airMax: this.airMax, lives: this.lives, score: this.score, carried: this.carried, hint: stageHintStrip(this.controlScheme) });
      if (this._touchBtns) for (const b of this._touchBtns) this._touchBtn(b);
      if (this.state === 'paused') this._overlay('PAUSED', (this.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume'));
      if (this.state === 'gameover') this._gameOverScreen();
      return;
    }
    if (this.zone === 'whirlpool') { this._drawWhirlpool(); return; }
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const cx = this.camX, cy = this.camY;
    const depthT = Math.min(1, cy / WH);
    // Distant shoals + sunken-wreck silhouettes only in the open-ocean reef;
    // enclosed zones (belly/temple/abyss) draw their own backdrops over this.
    this.bg.draw(ctx, cx, cy, this.t, depthT, { reef: this.zone === 'reef' });
    // Faint theme tint so each reef has its own mood.
    if (this.zone === 'reef' && this.state !== 'menu' && this.reefTheme) {
      const [tr, tg, tb] = this.reefTheme.tint;
      ctx.fillStyle = `rgba(${tr},${tg},${tb},0.06)`; ctx.fillRect(0, 0, W, H);
    }
    this.boat.draw(ctx, cx, cy, this.t);

    if (this.state !== 'menu' && this.cave) {
      for (const cur of this.currents) cur.draw(ctx, cx, cy, this.t);
      if (this.flora) this.flora.draw(ctx, cx, cy, this.t);
      for (const col of this.columns) { ctx.save(); ctx.translate(col.x - cx, col.y - cy); drawColumn(ctx, this.t); ctx.restore(); }
      for (const r of this.ribs) { ctx.save(); ctx.translate(r.x - cx, r.y - cy); drawRib(ctx, this.t, r.dir); ctx.restore(); }
      for (const s of this.skeletons) { ctx.save(); ctx.translate(s.x - cx, s.y - cy); drawWhaleSkeleton(ctx, this.t); ctx.restore(); }
      for (const w of this.wrecks) w.draw(ctx, cx, cy, this.t);
      for (const tr of this.treasures) tr.draw(ctx, cx, cy, this.t);
      for (const pu of this.powerups) pu.draw(ctx, cx, cy, this.t);
      for (const cr of this.crates) if (!cr.taken) cr.draw(ctx, cx, cy, this.t);
      for (const s of this.shells) s.draw(ctx, cx, cy, this.t);
      for (const cr of this.creatures) cr.draw(ctx, cx, cy, this.t);
      // Snared (netted/stunned) creatures wear a shimmering mesh so you can tell
      // they're safe to pass.
      for (const cr of this.creatures) {
        if (cr.snareT > 0) {
          const scx = cr.x - cx, scy = cr.y - cy, rr = (cr.radius || 16) + 4;
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.t * 10);
          ctx.strokeStyle = '#dbe9f2'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(scx, scy, rr, 0, Math.PI * 2); ctx.stroke();
          for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + this.t; ctx.beginPath(); ctx.moveTo(scx + Math.cos(a) * rr, scy + Math.sin(a) * rr); ctx.lineTo(scx - Math.cos(a) * rr, scy - Math.sin(a) * rr); ctx.stroke(); }
          ctx.restore();
        }
      }
      if (this.cave) this.cave.draw(ctx, cx, cy);   // rock occludes actors inside walls
      for (const w of this.whales) w.draw(ctx, cx, cy, this.t);
      for (const k of this.krakens) k.draw(ctx, cx, cy, this.t);
      for (const b of this.bells) b.draw(ctx, cx, cy, this.t);
      for (const v of this.vents) v.draw(ctx, cx, cy, this.t);
      if (this.whaleExit) { ctx.save(); ctx.translate(this.whaleExit.x - cx, this.whaleExit.y - cy); drawThroat(ctx, this.t, this.whaleExit.r); ctx.restore(); }
      // Temple gate (reef) / door, key & exit (temple).
      if (this.templeGate) { ctx.save(); ctx.translate(this.templeGate.x - cx, this.templeGate.y - cy); drawTempleGate(ctx, this.t, this.templeGate.r); ctx.restore(); }
      for (const e of this.stageEntrances) e.draw(ctx, cx, cy, this.t);
      if (this.abyssEntrance) {
        ctx.save(); ctx.translate(this.abyssEntrance.x - cx, this.abyssEntrance.y - cy); drawAbyssMaw(ctx, this.t, this.abyssEntrance.r); ctx.restore();
        // A visible mini-sub parked beside the maw — BUY it (press shop) before
        // diving, or you plunge on foot at 150% air. Bobs gently; dimmed and
        // priced when you can't yet afford it. Hidden once bought (it's yours).
        if (!this.hasSub) {
          const afford = this.gold >= ABYSS.subCost;
          const sx = this.abyssEntrance.x - cx - (this.abyssEntrance.r + 48);
          const sy = this.abyssEntrance.y - cy - 8 + Math.sin(this.t * 2) * 3;
          ctx.save(); ctx.translate(sx, sy); ctx.scale(2, 2);
          ctx.globalAlpha = afford ? 1 : 0.5; drawSub(ctx, 0, 0, 1); ctx.restore();
          this._text(`⚙${ABYSS.subCost}`, sx, sy - 26, 13, afford ? PAL.gold : PAL.danger, 'center', 'middle', true);
        }
      }
      if (this.whirlEntrance) { ctx.save(); ctx.translate(this.whirlEntrance.x - cx, this.whirlEntrance.y - cy); drawWhirlMaw(ctx, this.t, this.whirlEntrance.r); ctx.restore(); }
      if (this.door) { ctx.save(); ctx.translate(this.door.x + this.door.w / 2 - cx, this.door.y + this.door.h / 2 - cy); drawDoor(ctx, this.door.open, this.door.w, this.door.h); ctx.restore(); }
      if (this.key && !this.key.taken) { ctx.save(); ctx.translate(this.key.x - cx, this.key.y - cy); drawKey(ctx, this.t); ctx.restore(); }
      if (this.templeExit) { ctx.save(); ctx.translate(this.templeExit.x - cx, this.templeExit.y - cy); drawTempleGate(ctx, this.t, this.templeExit.r); ctx.restore(); }
      if (this.abyssExit) { ctx.save(); ctx.translate(this.abyssExit.x - cx, this.abyssExit.y - cy); drawAbyssMaw(ctx, this.t, this.abyssExit.r); ctx.restore(); }
      if (this.relic && !this.relic.taken) this.relic.draw(ctx, cx, cy, this.t);
      for (const b of this.bigBubbles) b.draw(ctx, cx, cy);
      for (const h of this.harpoons) h.draw(ctx, cx, cy);
      for (const n of this.nets) n.draw(ctx, cx, cy);
      for (const ch of this.charges) ch.draw(ctx, cx, cy);
      for (const ex of this.explosions) {
        const a = Math.max(0, 1 - ex.t / 0.4);
        ctx.save();
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = PAL.puffer;
        ctx.beginPath(); ctx.arc(ex.x - cx, ex.y - cy, ex.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a; ctx.strokeStyle = '#ffe9a6'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(ex.x - cx, ex.y - cy, ex.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Depth darkening — the deep swallows the light (drawn under the diver).
      if (this.zone === 'belly') {
        const beat = 0.30 + 0.10 * Math.sin(this.t * 2.2) + 0.04 * Math.sin(this.t * 4.4);
        ctx.fillStyle = `rgba(60,10,18,${beat})`; ctx.fillRect(0, 0, W, H);       // warm, pulsing "inside a body"
      } else if (depthT > 0.02) {
        ctx.fillStyle = `rgba(2,7,15,${0.5 * depthT})`; ctx.fillRect(0, 0, W, H);
      }
    }

    this.particles.draw(ctx, cx, cy);
    // The mini-sub hull, drawn behind the diver so it reads as piloting it.
    if (this.state !== 'menu' && this.inSub) drawSub(ctx, this.diver.x - cx, this.diver.y - cy, this.diver.facing);
    if (this.state !== 'menu') this.diver.draw(ctx, cx, cy, this.aiming, this.aimAngle);
    // Shield bubble (blinks as it runs out).
    if (this.shieldT > 0 && this.state !== 'menu') {
      const a = this.shieldT < 1.5 && Math.floor(this.shieldT * 8) % 2 ? 0.15 : 0.42;
      const sx = this.diver.x - cx, sy = this.diver.y - cy;
      ctx.save();
      ctx.strokeStyle = `rgba(143,230,255,${a})`; ctx.lineWidth = 3;
      ctx.fillStyle = `rgba(143,230,255,${a * 0.22})`;
      ctx.beginPath(); ctx.arc(sx, sy, this.diver.radius + 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // Shock rod: jagged lightning bolts arcing diver → target → target.
    if (this.shockT > 0 && this.shockBolts && this.shockBolts.length && this.state !== 'menu') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.shockT / 0.22);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const b of this.shockBolts) {
        const x1 = b.x1 - cx, y1 = b.y1 - cy, x2 = b.x2 - cx, y2 = b.y2 - cy;
        const segs = 6, nx = -(y2 - y1), ny = (x2 - x1), nl = Math.hypot(nx, ny) || 1;
        const path = (jitter, w, col) => {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1);
          for (let i = 1; i < segs; i++) {
            const tt = i / segs;
            const off = (Math.sin(i * 12.9 + this.t * 60) * jitter);
            ctx.lineTo(x1 + (x2 - x1) * tt + (nx / nl) * off, y1 + (y2 - y1) * tt + (ny / nl) * off);
          }
          ctx.lineTo(x2, y2); ctx.stroke();
        };
        path(9, 5, 'rgba(143,230,255,0.35)');   // glow
        path(9, 2, '#eaffff');                  // core
      }
      ctx.restore();
    }
    // Hold-to-aim: guide line + a reticle locking onto the target.
    if (this.aiming && this.aimTarget && this.state === 'playing') {
      const dx = this.diver.x - cx, dy = this.diver.y - cy;
      const tx = this.aimTarget.x - cx, ty = this.aimTarget.y - cy;
      const ta = Math.atan2(this.aimTarget.y - this.diver.y, this.aimTarget.x - this.diver.x);
      const locked = Math.abs(this._angleDiff(this.aimAngle, ta)) < AIM.lockTol;
      ctx.save();
      ctx.strokeStyle = locked ? PAL.danger : 'rgba(230,245,255,0.55)'; ctx.lineWidth = locked ? 2 : 1.4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(this.aimAngle) * 300, dy + Math.sin(this.aimAngle) * 300); ctx.stroke();
      ctx.setLineDash([]);
      const rr = (this.aimTarget.radius || 20) + 8;
      ctx.strokeStyle = locked ? PAL.danger : PAL.gateGlow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, ty, rr, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr); ctx.lineTo(tx + Math.cos(a) * (rr + 6), ty + Math.sin(a) * (rr + 6)); ctx.stroke(); }
      ctx.restore();
    }

    // Dark caves: black out the scene except a small radius around the diver;
    // a lit flare widens and warms that pool of light.
    if (this.state !== 'menu' && this.darkZones && this.darkZones.length) {
      let darkness = 0;
      for (const z of this.darkZones) {
        const dist = Math.hypot(this.diver.x - z.x, this.diver.y - z.y);
        if (dist < z.r) darkness = Math.max(darkness, Math.min(1, (z.r - dist) / 150));
      }
      if (darkness > 0.01) {
        const dsx = this.diver.x - cx, dsy = this.diver.y - cy;
        const lit = this.flareT > 0;
        const torchLit = this.torchOn && this.shockBattery > 0;   // flare wins if both are up
        const vr = lit ? FLARE.litRadius : (torchLit ? TORCH.litRadius : FLARE.diverRadius);
        if (lit) {   // warm flare glow
          const wf = Math.min(1, this.flareT) * 0.3;
          const g2 = ctx.createRadialGradient(dsx, dsy, 8, dsx, dsy, vr);
          g2.addColorStop(0, `rgba(255,180,90,${wf})`); g2.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
        } else if (torchLit) {   // cool, steady torch beam
          const g2 = ctx.createRadialGradient(dsx, dsy, 8, dsx, dsy, vr);
          g2.addColorStop(0, 'rgba(190,225,255,0.20)'); g2.addColorStop(1, 'rgba(120,180,255,0)');
          ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
        }
        const darkA = darkness * ((lit || torchLit) ? DARKZONE.litAlpha : DARKZONE.unlitAlpha);
        const grd = ctx.createRadialGradient(dsx, dsy, vr, dsx, dsy, vr + DARKZONE.falloff);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(2,4,8,${darkA})`);
        ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      }
    }

    // Vignette — subtle at the surface, closing in with depth.
    if (this.state !== 'menu') {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.22 + 0.34 * depthT})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Zone-change wash (swallowed / escaped).
    if (this.zoneFade > 0.01) {
      ctx.fillStyle = this.zone === 'belly' ? `rgba(40,6,12,${this.zoneFade})` : `rgba(120,180,220,${0.7 * this.zoneFade})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused') this._hud();
    if ((this.state === 'playing' || this.state === 'paused') && this.weaponSwapT > 0) this._weaponCarousel();
    if (this.state === 'menu') this._menu();
    if (this.state === 'paused') this._overlay('PAUSED', (this.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume') + '   ·   H for help');
    if (this.state === 'shop') this._shopScreen();
    if (this.state === 'drydock') this._dryDockScreen();
    if (this.state === 'help') this._helpScreen();
    if (this.state === 'gameover') this._gameOverScreen();
  }

  // The whirlpool's own scene — a companion to draw(), mirroring how the
  // stage gets its own block. No Cave/creatures/treasure here (Phase 1):
  // just the shaft walls, its obstacles, a churning backdrop, the bail-out
  // maw at the top, and the diver being swept through it.
  _drawWhirlpool() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    const cx = this.camX, cy = this.camY;
    const depthT = Math.min(1, cy / WH);
    this.bg.draw(ctx, cx, cy, this.t, depthT);
    ctx.fillStyle = `rgba(20,70,80,${0.16 + 0.14 * depthT})`; ctx.fillRect(0, 0, W, H);

    // Shaft walls.
    const shaft = this.whirlShaft;
    if (shaft) {
      const leftX = shaft.cx - shaft.halfW - cx, rightX = shaft.cx + shaft.halfW - cx;
      ctx.fillStyle = PAL.whirlRock;
      ctx.fillRect(leftX - 60, 0, 60, H);
      ctx.fillRect(rightX, 0, 60, H);
      ctx.strokeStyle = 'rgba(46,230,200,0.4)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(leftX, 0); ctx.lineTo(leftX, H); ctx.moveTo(rightX, 0); ctx.lineTo(rightX, H); ctx.stroke();
    }
    // Swirl streaks — a simple churning-current backdrop; scrolls faster the
    // higher the sweep speed, so it reads as accelerating.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = PAL.whirlRim; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const yy = ((this.t * (140 + this.whirlSpeed * 0.6) + i * 160) % (H + 160)) - 80;
      ctx.beginPath(); ctx.ellipse(W / 2, yy, shaft ? shaft.halfW * 0.7 : 150, 22, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // Collectibles — bubbles for air, loot/pearls for the Salvage payoff.
    for (const b of this.whirlBubbles) {
      if (b.taken) continue;
      const bx = b.x - cx, by = b.y - cy;
      if (bx < -60 || bx > W + 60 || by < -60 || by > H + 60) continue;
      const wob = Math.sin(this.t * 2.5 + b.phase) * 1.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(190,235,255,0.8)'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(150,220,255,0.18)';
      ctx.beginPath(); ctx.ellipse(bx, by, b.r + wob, b.r - wob, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx - b.r * 0.32, by - b.r * 0.32, b.r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      ctx.restore();
    }
    for (const tr of this.whirlTreasures) {
      if (tr.taken) continue;
      const tx = tr.x - cx, ty = tr.y - cy;
      if (tx < -60 || tx > W + 60 || ty < -60 || ty > H + 60) continue;
      tr.draw(ctx, cx, cy, this.t);
    }
    // Obstacles — landmines, jellyfish, starfish (random per obstacle).
    for (const o of this.whirlObstacles) {
      const ox = o.x - cx, oy = o.y - cy;
      if (ox < -60 || ox > W + 60 || oy < -60 || oy > H + 60) continue;
      ctx.save(); ctx.translate(ox, oy);
      this._drawWhirlObstacle(ctx, o, this.t);
      ctx.restore();
    }
    // Bail-out exit near the top.
    if (this.whirlExit) { ctx.save(); ctx.translate(this.whirlExit.x - cx, this.whirlExit.y - cy); drawWhirlMaw(ctx, this.t, this.whirlExit.r); ctx.restore(); }

    this.particles.draw(ctx, cx, cy);
    if (this.state !== 'menu') this.diver.draw(ctx, cx, cy, false, 0);
    if (depthT > 0.02) { ctx.fillStyle = `rgba(2,7,15,${0.5 * depthT})`; ctx.fillRect(0, 0, W, H); }
    if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,40,40,${0.35 * this.flash})`; ctx.fillRect(0, 0, W, H); }
    if (this.zoneFade > 0.01) { ctx.fillStyle = `rgba(120,180,220,${0.7 * this.zoneFade})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused') this._whirlpoolHud();
    if (this.puT > 0) this._puFlourish();   // speed-break / survival-summary flourish
    if (this.state === 'paused') this._overlay('PAUSED', (this.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume') + '   ·   H for help');
    if (this.state === 'gameover') this._gameOverScreen();
    if (this._touchBtns) for (const b of this._touchBtns) this._touchBtn(b);
  }

  // Minimal HUD for the whirlpool sweep — air + score + the survival banner.
  // Deliberately simpler than the shared _hud() (no weapons/gold/etc — none
  // of that applies while being swept down the shaft).
  _whirlpoolHud() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(4,14,20,0.55)'); g.addColorStop(1, 'rgba(4,14,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);

    const bx = 20, by = 20, bw = 240, bh = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
    const frac = this.air / this.airMax;
    const low = frac < 0.25;
    ctx.fillStyle = low && Math.floor(this.t * 6) % 2 === 0 ? PAL.airLow : (low ? '#ff9a6b' : PAL.air);
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * frac), bh, 9); ctx.fill();
    this._text('AIR', bx, by - 6, 12, PAL.hudText, 'left', 'bottom');
    this._text(`${Math.round(this.air)}`, bx + bw + 8, by + bh / 2, 13, PAL.hudText, 'left', 'middle');

    this._text(`SCORE ${this.score}`, W - 20, 22, 18, PAL.hudText, 'right', 'top');
    this._text(`+${Math.round(this.whirlScore)} this ride`, W - 20, 46, 14, PAL.whirlRim, 'right', 'top');
    this._text(`HI ${this.hi}`, W / 2, 22, 14, '#bfe6ff', 'center', 'top');

    // The payoff building: speed tier reached, Salvage earned at breaks this
    // ride, and whatever loot/pearls are currently carried (cashed on exit).
    this._text(`TIER ${this.whirlTier}`, W - 20, 68, 14, PAL.gateGlow, 'right', 'top');
    this._text(`⚙ +${this.whirlSalvageEarned} this ride`, W - 20, 88, 13, PAL.whirlRim, 'right', 'top');
    if (this.carried > 0 || this.carriedPearls > 0) {
      const pearlBit = this.carriedPearls > 0 ? `  ◦${this.carriedPearls}` : '';
      this._text(`LOOT +${this.carried}${pearlBit}`, W - 20, 108, 13, PAL.gold, 'right', 'top');
    }

    this._text(`🌀 WHIRLPOOL — SPEED ${Math.round(this.whirlSpeed)} — survive! (no life lost)`, W / 2, H - 30, 15, PAL.whirlRim, 'center', 'middle', true);
    this._text('◀ ▶ steer — dodge the rocks, or ride back up to the maw to bail out', W / 2, H - 8, 12, 'rgba(200,240,235,0.75)', 'center', 'middle');
  }

  // Transition screen while the boat carries the diver to a new reef.
  _sailScreen() {
    const ctx = this.ctx, p = Math.min(1, this.sailT / 1.8), sy = H * 0.42;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.surfaceLight); g.addColorStop(0.42, PAL.waterTop); g.addColorStop(1, PAL.waterDeep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // surface line
    ctx.strokeStyle = 'rgba(220,250,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= W; x += 12) { const yy = sy + Math.sin(x * 0.04 + this.t * 2) * 3; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.stroke();
    // boat sailing across, with a wake
    const bx = W * 0.12 + p * W * 0.72;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 7; i++) { const wx = bx - 34 - i * 16 - ((this.t * 40) % 16); ctx.beginPath(); ctx.arc(wx, sy + 7, 3.2 - i * 0.3, 0, Math.PI * 2); ctx.fill(); }
    this.boat.draw(ctx, this.boat.x - bx, WORLD.SURFACE - sy, this.t);
    // caption — the wacky destination name
    const t3 = this.reefTheme.tint;
    this._text('SAILING TO…', W / 2, H * 0.68, 15, '#bfe6ff', 'center', 'middle');
    this._text(`${this.reefTheme.tag} ${this.reefName}`, W / 2, H * 0.72 + 4, 26, `rgb(${t3[0]},${t3[1]},${t3[2]})`, 'center', 'middle', true);
    this._text(`Reef ${this.reef}   ·   SCORE ${this.score}   ·   LIVES ${this.lives}`, W / 2, H * 0.72 + 40, 15, '#bfe6ff', 'center', 'middle');
  }

  // ---- touch buttons ---------------------------------------------------
  // Compute the on-screen buttons for the current state and hand their logical
  // rects to Input for hit-testing. Only ever populated on touch devices, so
  // desktop/gamepad play is untouched. Rects are fixed; visibility is by state.
  _syncTouchButtons() {
    const btns = [];
    if (this.input.isTouch) {
      if (this.state === 'playing' || this.state === 'paused') {
        btns.push({ id: 'pause', x: 300, y: 8, w: 46, h: 34 });
        btns.push({ id: 'mute', x: 352, y: 8, w: 46, h: 34 });
      }
      if (this.state === 'playing' && this.zone === 'reef' &&
          this.boat.contains(this.diver) && this.canSail && this.carried === 0) {
        btns.push({ id: 'sail', x: W / 2 - 90, y: H - 80, w: 180, h: 40 });
      }
      if (this.state === 'playing') {
        // Primary FIRE button — enlarged for thumb reach at the bottom-right,
        // left of the weapon/flare/torch column. Tap = shot, hold = aim.
        btns.push({ id: 'aim', x: W - 142, y: H - 96, w: 72, h: 64 });
        if (this.weapons.length > 1) btns.push({ id: 'weapon', x: W - 66, y: H - 74, w: 52, h: 44 });
        if (this.flares > 0) btns.push({ id: 'flare', x: W - 66, y: H - 124, w: 52, h: 44 });
        if (this.hasTorch) btns.push({ id: 'torch', x: W - 66, y: H - 174, w: 52, h: 44 });
      }
      if (this.state === 'playing' && this.zone === 'stage') {
        btns.push({ id: 'jump', x: W - 96, y: H - 84, w: 72, h: 56 });
      }
      // A SHOP button: at the boat once the hold is empty (auto-banked), or at a
      // dive bell any time (the shop offers banking there).
      const onReef = this.state === 'playing' && this.zone === 'reef';
      const atBoatEmpty = onReef && this.carried === 0 && this.boat.contains(this.diver);
      const atAnyBell = onReef && this.bells.some((b) => b.contains(this.diver));
      if (atBoatEmpty || atAnyBell) btns.push({ id: 'shop', x: W / 2 - 60, y: H - 128, w: 120, h: 38 });
      // In the shop: one tappable button per item row.
      if (this.state === 'shop') {
        const items = this._shopItems();
        items.forEach((it, i) => { const r = this._shopRow(i); btns.push({ id: 'shop' + i, x: r.x, y: r.y, w: r.w, h: r.h }); });
      }
      // In the Dry Dock: one tappable button per row.
      if (this.state === 'drydock') {
        const rows = this._dryDockRows();
        rows.forEach((row, i) => { const r = this._ddRow(i); btns.push({ id: 'dd' + i, x: r.x, y: r.y, w: r.w, h: r.h }); });
      }
      // Help: a "?" on the menus, and nav/close inside the help screen. On the
      // menu/game-over screens it sits beside the Dry Dock button.
      if (this.state === 'menu' || this.state === 'gameover') btns.push({ id: 'help', x: W / 2 - 140, y: 516, w: 132, h: 34 });
      else if (this.state === 'paused') btns.push({ id: 'help', x: W / 2 - 66, y: 516, w: 132, h: 34 });
      // Dry Dock: a "🛠" on the menu/game-over screens.
      if (this.state === 'menu' || this.state === 'gameover') btns.push({ id: 'drydock', x: W / 2 + 8, y: 516, w: 132, h: 34 });
      // Control-scheme selector: a tap target over the menu/gameover selector row.
      if (this.state === 'menu' || this.state === 'gameover') btns.push({ id: 'schemeNext', x: W / 2 - 150, y: 434, w: 320, h: 32 });
      if ((this.state === 'menu' || this.state === 'gameover') && availableSkips(this.meta).length) btns.push({ id: 'skipNext', x: W / 2 - 152, y: 358, w: 344, h: 28 });
      if (this.state === 'help') {
        const r = this._helpRects(); btns.push(r.prev, r.next, r.close);
        if (HELP_PAGES[this.helpPage].id === 'controls') btns.push({ id: 'controls', x: W / 2 - 150, y: 162, w: 300, h: 30 });
      }
    }
    this._touchBtns = btns;
    this.input.touchButtons = btns;
  }

  // Draw one on-screen touch button with its icon/label.
  _touchBtn(b) {
    // The scheme selectors are invisible tap targets over their own menu/help
    // text — no button chrome, just a hit region.
    if (b.id === 'schemeNext' || b.id === 'controls' || b.id === 'skipNext') return;
    const ctx = this.ctx;
    const active = (b.id === 'pause' && this.state === 'paused') || (b.id === 'mute' && this.muted) || b.id === 'sail' || (b.id === 'aim' && this.input._aimBtnActive) || (b.id === 'torch' && this.torchOn);
    ctx.save();
    ctx.fillStyle = active ? 'rgba(18,58,88,0.85)' : 'rgba(6,22,38,0.72)';
    ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill(); ctx.stroke();
    ctx.restore();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (b.id === 'pause') {
      ctx.fillStyle = PAL.hudText;
      if (this.state === 'paused') { ctx.beginPath(); ctx.moveTo(cx - 5, cy - 7); ctx.lineTo(cx - 5, cy + 7); ctx.lineTo(cx + 8, cy); ctx.closePath(); ctx.fill(); }
      else { ctx.fillRect(cx - 6, cy - 7, 4, 14); ctx.fillRect(cx + 2, cy - 7, 4, 14); }
    } else if (b.id === 'mute') {
      this._text(this.muted ? '🔇' : '🔊', cx, cy + 1, 16, PAL.hudText, 'center', 'middle');
    } else if (b.id === 'sail') {
      this._text('⛵ SAIL ON', cx, cy + 1, 15, PAL.gold, 'center', 'middle', true);
    } else if (b.id === 'weapon') {
      this._text(WEAPON_INFO[this.weapon].glyph, cx, cy - 4, 17, PAL.harpoonTip, 'center', 'middle');
      this._text('SWAP', cx, cy + 12, 8, 'rgba(180,215,240,0.8)', 'center', 'middle', true);
    } else if (b.id === 'shop') {
      this._text('⚙ SHOP', cx, cy + 1, 15, PAL.gold, 'center', 'middle', true);
    } else if (b.id === 'help') {
      this._text('❔ HELP', cx, cy + 1, 14, PAL.hudText, 'center', 'middle', true);
    } else if (b.id === 'drydock') {
      this._text('🛠 DRY DOCK', cx, cy + 1, 13, PAL.gold, 'center', 'middle', true);
    } else if (b.id === 'aim') {
      this._text('🎯', cx, cy - 10, 22, PAL.hudText, 'center', 'middle');
      this._text('FIRE', cx, cy + 12, 12, PAL.harpoonTip, 'center', 'middle', true);
      this._text('hold = aim', cx, cy + 25, 8, 'rgba(180,215,240,0.7)', 'center', 'middle');
    } else if (b.id === 'flare') {
      this._text('🔥', cx, cy - 4, 17, PAL.hudText, 'center', 'middle');
      this._text('FLARE', cx, cy + 12, 8, 'rgba(255,190,140,0.9)', 'center', 'middle', true);
    } else if (b.id === 'torch') {
      this._text('🔦', cx, cy - 4, 17, PAL.hudText, 'center', 'middle');
      this._text('TORCH', cx, cy + 12, 8, this.torchOn ? 'rgba(150,210,255,0.95)' : 'rgba(180,215,240,0.7)', 'center', 'middle', true);
    } else if (b.id === 'jump') {
      this._text('⤴', cx, cy - 4, 20, PAL.hudText, 'center', 'middle');
      this._text('JUMP', cx, cy + 13, 9, 'rgba(180,215,240,0.85)', 'center', 'middle', true);
    }
  }

  // ---- HUD -------------------------------------------------------------
  _hud() {
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(0,10,20,0.55)'); g.addColorStop(1, 'rgba(0,10,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);

    const bx = 20, by = 20, bw = 240, bh = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
    const frac = this.air / this.airMax;
    const low = frac < 0.25;
    ctx.fillStyle = low && Math.floor(this.t * 6) % 2 === 0 ? PAL.airLow : (low ? '#ff9a6b' : PAL.air);
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * frac), bh, 9); ctx.fill();
    this._text('AIR', bx, by - 6, 12, PAL.hudText, 'left', 'bottom');
    const airLabel = this.airMax > AIR.max ? `${Math.round(this.air)}/${this.airMax}` : `${Math.round(this.air)}`;
    this._text(airLabel, bx + bw + 8, by + bh / 2, 13, this.airMax > AIR.max ? PAL.air : PAL.hudText, 'left', 'middle');

    const shownLives = Math.min(this.lives, 6);
    for (let i = 0; i < shownLives; i++) {
      ctx.save(); ctx.translate(bx + 8 + i * 22, by + bh + 22); ctx.scale(0.7, 0.7);
      ctx.fillStyle = PAL.diver; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.diverGlass; ctx.beginPath(); ctx.arc(2, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    let harpIconX = bx + 8 + shownLives * 22;
    if (this.lives > 6) { this._text(`+${this.lives - 6}`, harpIconX, by + bh + 22, 12, PAL.diver, 'left', 'middle', true); harpIconX += 24; }
    // Current weapon chip (glyph + name), dimmed while on cooldown; the name
    // flashes cyan briefly after a swap.
    const wInfo = WEAPON_INFO[this.weapon];
    const wy2 = by + bh + 22;
    ctx.save(); ctx.globalAlpha = this.fireCd > 0 ? 0.5 : 1;
    this._text(wInfo.glyph, harpIconX + 12, wy2, 16, PAL.harpoonTip, 'center', 'middle');
    this._text(wInfo.name, harpIconX + 24, wy2, 12, this.weaponSwapT > 0 ? PAL.air : '#bcd3e6', 'left', 'middle', true);
    const nameW = this.ctx.measureText(wInfo.name).width;
    ctx.restore();
    // Weapon-swap key hint — clear keycaps so players see they can switch.
    let swapW = 0;
    if (this.weapons.length > 1) {
      const kx = harpIconX + 32 + nameW;
      this._keycap('Q', kx, wy2); this._keycap('E', kx + 19, wy2);
      this._text('SWAP', kx + 39, wy2, 10, 'rgba(165,200,230,0.8)', 'left', 'middle', true);
      swapW = 39 + this.ctx.measureText('SWAP').width + 8;
    }
    // Active buff timers.
    let buffX = harpIconX + 32 + nameW + swapW + 10;
    const buff = (label, secs, col) => { this._text(`${label} ${Math.ceil(secs)}s`, buffX, by + bh + 22, 12, col, 'left', 'middle', true); buffX += this.ctx.measureText(`${label} ${Math.ceil(secs)}s`).width + 14; };
    if (this.multiFireT > 0) buff('✸×3', this.multiFireT, PAL.harpoonTip);
    if (this.shieldT > 0) buff('🛡', this.shieldT, PAL.gateGlow);
    if (this.speedT > 0) buff('»»', this.speedT, PAL.air);
    if (this.magnetT > 0) buff('🧲', this.magnetT, PAL.gold);

    // Gold purse + harpoon ammo (a resource — the net gun is your unlimited fallback).
    this._text(`💰 ${this.gold}`, bx + 8, by + bh + 46, 15, PAL.gold, 'left', 'middle', true);
    // Out-of-ammo alarm: a fast bright blink on the empty weapon's counter when
    // the player just tried to fire it dry (paired with the audio.click).
    const deadFlash = this._ammoFlash > 0 && Math.floor(this.t * 12) % 2 === 0;
    const lowAmmo = this.harpoonAmmo <= 3;
    this._text(`➤ ${this.harpoonAmmo}/${this.harpoonMax}`, bx + 104, by + bh + 46, 14,
      this.harpoonAmmo <= 0 && deadFlash ? '#ff3b30' : (lowAmmo && Math.floor(this.t * 5) % 2 === 0 ? PAL.danger : (lowAmmo ? '#ff9a6b' : '#cfe0ee')), 'left', 'middle', true);
    if (this.owned.has('charge'))
      this._text(`💣 ${this.chargeAmmo}/${this.chargeMax}`, bx + 184, by + bh + 46, 14, this.chargeAmmo <= 0 && deadFlash ? '#ff3b30' : (this.chargeAmmo <= 0 ? '#ff9a6b' : '#cfe0ee'), 'left', 'middle', true);
    this._text(`🔥 ${this.flares}`, bx + 264, by + bh + 46, 14, this.flares <= 0 ? '#ff9a6b' : '#ffb27a', 'left', 'middle', true);
    if (this.owned.has('speargun'))
      this._text(`⋙ ${this.speargunAmmo}/${SPEARGUN.ammoMax}`, bx + 344, by + bh + 46, 14, this.speargunAmmo <= 0 && deadFlash ? '#ff3b30' : (this.speargunAmmo <= 0 ? '#ff9a6b' : '#cfe0ee'), 'left', 'middle', true);

    // Shared battery gauge (shown when you own the shock rod or the torch) —
    // drains on zaps / torchlight, recharges slowly while idle.
    if (this.owned.has('shock') || this.hasTorch) {
      const byb = by + bh + 66, bwb = 92, bhb = 7, bxb = bx + 24;
      this._text('⚡', bx + 10, byb + bhb / 2, 12, PAL.gateGlow, 'left', 'middle');
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.roundRect(bxb, byb, bwb, bhb, 3); ctx.fill();
      const bf = this.shockBattery / SHOCK.batteryMax;
      ctx.fillStyle = bf < 0.3 ? '#ff9a6b' : PAL.gateGlow; ctx.beginPath(); ctx.roundRect(bxb, byb, Math.max(2, bwb * bf), bhb, 3); ctx.fill();
      if (this.hasTorch)
        this._text(this.torchOn ? '🔦 ON' : '🔦', bxb + bwb + 8, byb + bhb / 2, 12, this.torchOn ? PAL.air : 'rgba(160,195,225,0.7)', 'left', 'middle', true);
    }

    this._text(`SCORE ${this.score}`, W - 20, 22, 18, PAL.hudText, 'right', 'top');
    const cp = this.bankPulse > 0 ? PAL.gold : PAL.hudText;
    const pearlSuffix = this.carriedPearls > 0 ? `   ◦ ${this.carriedPearls}` : '';
    this._text(`CARRYING ${this.carried}${pearlSuffix}`, W - 20, 46, 14, cp, 'right', 'top');
    this._text(`DEPTH ${Math.round(this.depthReached / 10)} m`, W - 20, 66, 13, '#bfe6ff', 'right', 'top');
    const t3 = this.reefTheme.tint;
    const zoneTag = this.zone === 'belly' ? '🐋 THE BELLY' : this.zone === 'temple' ? '🏛 THE TEMPLE' : `${this.reefTheme.tag} ${this.reefName}`;
    const zoneCol = this.zone === 'belly' ? PAL.membrane : this.zone === 'temple' ? PAL.templeRim : `rgb(${t3[0]},${t3[1]},${t3[2]})`;
    this._text(zoneTag, W - 20, 84, 12, zoneCol, 'right', 'top');
    if (this.zone === 'temple' && this.hasKey) this._text('🔑 KEY', W - 20, 102, 12, PAL.key, 'right', 'top');
    if (this.zone === 'reef') {
      const rel = this.relicBanked ? '⚓ RELIC ✓' : this.carryingRelic ? '⚓ RELIC — bank it!' : `⚓ ${this.reefBanked}/${this.reefGoal}`;
      this._text(this.canSail ? '⚓ SAIL READY' : rel, W - 20, 102, 12, this.canSail ? PAL.air : PAL.key, 'right', 'top');
    } else if (this.zone === 'abyss') {
      this._text(this.inSub ? '🛥 IN SUB' : '⚠ 150% AIR', W - 20, 102, 12, this.inSub ? PAL.air : PAL.danger, 'right', 'top');
    }
    this._text(`HI ${this.hi}`, W / 2, 22, 14, '#bfe6ff', 'center', 'top');
    if (this.muted) this._text('MUTED', W / 2, 42, 11, '#ff9a6b', 'center', 'top');

    // Contextual prompts.
    if (this.zone === 'belly') {
      this._text('🐋 Swallowed! Grab the trove — reach the glowing throat to escape.', W / 2, H - 30, 15, PAL.throat, 'center', 'middle');
    } else if (this.zone === 'temple') {
      const msg = this.hasKey ? '🔑 Vault unlocked! Grab the loot, then follow ▲ EXIT up to the gate to leave'
        : '🏛 Find the KEY for the vault — or follow ▲ EXIT up to the gate to leave now';
      this._text(msg, W / 2, H - 30, 15, this.hasKey ? PAL.key : PAL.gateGlow, 'center', 'middle');
    } else if (this.zone === 'abyss') {
      this._text('🌀 THE ABYSS — air draining fast on foot! Grab loot & pearls, then follow ▲ EXIT up to leave', W / 2, H - 30, 15, PAL.abyssRim, 'center', 'middle');
    } else if (this.boat.contains(this.diver)) {
      if (this.carried > 0) {
        this._text('◆ DOCKED — refilling air & banking treasure', W / 2, H - 30, 15, PAL.air, 'center', 'middle');
      } else if (this.canSail) {
        const sailHint = this.input.isTouch ? '◆ DOCKED — objective met. Tap ⛵ SAIL ON to reach a new reef' : '◆ DOCKED — objective met. Hold ↑ to set sail to a new reef';
        this._text(sailHint, W / 2, H - 30, 15, PAL.gold, 'center', 'middle');
        if (this.dockHold > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.roundRect(W / 2 - 80, H - 16, 160, 6, 3); ctx.fill();
          ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.roundRect(W / 2 - 80, H - 16, 160 * Math.min(1, this.dockHold / 1.0), 6, 3); ctx.fill();
        }
      } else {
        this._text(`◆ DOCKED — find the ⚓ relic (or bank ${this.reefGoal - this.reefBanked} more pts) to sail on`, W / 2, H - 30, 14, PAL.key, 'center', 'middle');
      }
    } else if (this.atBell) {
      if (this.carried > 0) {
        const pct = Math.round(bellBankRate(this.atBell.y) * 100);
        const how = this.input.isTouch ? 'Tap ⚙ SHOP' : `Press ${this._key('shop')}`;
        this._text(`🔔 DIVE BELL — air topped up.  ${how} to bank here (${pct}%) or spend gold  ·  or carry up to the boat for full value`, W / 2, H - 30, 13, PAL.bellLight, 'center', 'middle');
      } else {
        this._text('🔔 DIVE BELL — air topped up. A safe haven in the deep', W / 2, H - 30, 15, PAL.bellLight, 'center', 'middle');
      }
    } else {
      // Near an open whale mouth or the temple gate?
      let hinted = false;
      for (const w of this.whales) {
        if (w.mouthOpen > 0.4 && Math.hypot(this.diver.x - w.x, this.diver.y - w.y) < 320) {
          this._text('🐋 Its mouth is open — swim in to enter the whale', W / 2, H - 30, 14, PAL.whaleBelly, 'center', 'middle');
          hinted = true; break;
        }
      }
      if (!hinted && this.templeGate && Math.hypot(this.diver.x - this.templeGate.x, this.diver.y - this.templeGate.y) < 320) {
        this._text('🏛 An ancient gate — swim in to enter the sunken temple', W / 2, H - 30, 14, PAL.gateGlow, 'center', 'middle');
        hinted = true;
      }
      if (!hinted) for (const e of this.stageEntrances) {
        if (Math.hypot(this.diver.x - e.x, this.diver.y - e.y) < 260) {
          const msg = e.theme.entrance === 'wreck' ? '🚢 A great shipwreck — swim in to explore the decks' : '🕳 A dark cave mouth — swim in to enter the lair';
          this._text(msg, W / 2, H - 30, 14, PAL.gateGlow, 'center', 'middle');
          hinted = true; break;
        }
      }
      if (!hinted && this.abyssEntrance && Math.hypot(this.diver.x - this.abyssEntrance.x, this.diver.y - this.abyssEntrance.y) < 320) {
        const msg = this.hasSub
          ? '🛥 Sub ready — dive the maw to descend safely.'
          : `🛥 Buy the MINI-SUB (⚙${ABYSS.subCost}g) — press ${this._key('shop')} — or dive on foot (air burns fast!)`;
        this._text(msg, W / 2, H - 30, 14, PAL.abyssRim, 'center', 'middle');
        hinted = true;
      }
      if (!hinted && this.whirlEntrance && Math.hypot(this.diver.x - this.whirlEntrance.x, this.diver.y - this.whirlEntrance.y) < 320) {
        this._text('🌀 A whirlpool — dive in to ride it as long as you can (no life lost)', W / 2, H - 30, 14, PAL.whirlRim, 'center', 'middle');
      }
    }
    // Shop hint at any station once loot is banked.
    if (this.zone === 'reef' && this.carried === 0 && (this.boat.contains(this.diver) || this.bells.some((b) => b.contains(this.diver)))) {
      this._text(this.input.isTouch ? 'Tap ⚙ SHOP to spend gold on gear' : `Press ${this._key('shop')} to open the ⚙ SHOP`, W / 2, H - 52, 13, PAL.gold, 'center', 'middle');
    }

    // Dark cave — remind the player how to light it (suppressed once the torch
    // is actually burning, and torch-aware when they own one).
    const torchLit = this.torchOn && this.shockBattery > 0;
    if (this.flareT <= 0 && !torchLit && this.darkZones && this.darkZones.some((z) => Math.hypot(this.diver.x - z.x, this.diver.y - z.y) < z.r) && this.zone === 'reef') {
      let msg;
      if (this.hasTorch) msg = this.input.isTouch ? '🔦 DARK CAVE — tap 🔦 torch or 🔥 flare' : `🔦 DARK CAVE — ${this._key('torch')} for torch, ${this._key('flare')} for a flare`;
      else msg = this.flares > 0 ? (this.input.isTouch ? '🔦 DARK CAVE — tap 🔥 to light a flare' : `🔦 DARK CAVE — press ${this._key('flare')} to light a flare`) : '🔦 DARK CAVE — out of flares! Buy some at the shop';
      this._text(msg, W / 2, H - 96, 14, PAL.puffer, 'center', 'middle', true);
    }

    // Armed depth charge — remind the player they detonate with a second shot.
    if (this.armedCharge && !this.armedCharge.dead) {
      const blink = Math.floor(this.t * 4) % 2 === 0;
      this._text('💣 FIRE AGAIN TO DETONATE', W / 2, H - 74, 14, blink ? PAL.danger : PAL.puffer, 'center', 'middle', true);
    }

    // Point the way to the exit in the special zones (they're easy to lose).
    if (this.zone === 'temple' && this.templeExit) this._exitLocator(this.templeExit.x, this.templeExit.y, 'EXIT');
    else if (this.zone === 'belly' && this.whaleExit) this._exitLocator(this.whaleExit.x, this.whaleExit.y, 'ESCAPE');
    else if (this.zone === 'abyss' && this.abyssExit) this._exitLocator(this.abyssExit.x, this.abyssExit.y, 'EXIT');

    // 1-UP flourish.
    if (this.oneUpT > 0) {
      const a = Math.min(1, this.oneUpT);
      ctx.globalAlpha = a;
      this._text('★ EXTRA LIFE ★', W / 2, 150 - (2.2 - this.oneUpT) * 20, 26, PAL.diver, 'center', 'middle', true);
      ctx.globalAlpha = 1;
    }
    // Power-up name pop-up.
    if (this.puT > 0) this._puFlourish();

    // Boss health bar when a kraken is on-screen.
    const boss = this.krakens.find((k) => k.hp > 0 && k.x > this.camX - 140 && k.x < this.camX + W + 140 && k.y > this.camY - 140 && k.y < this.camY + H + 140);
    if (boss) {
      const bw2 = 300, bx2 = W / 2 - bw2 / 2, by2 = 56;
      this._text('⚔ KRAKEN', W / 2, by2 - 4, 12, PAL.krakenEye, 'center', 'bottom', true);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(bx2, by2, bw2, 10, 5); ctx.fill();
      ctx.fillStyle = PAL.danger; ctx.beginPath(); ctx.roundRect(bx2, by2, Math.max(2, bw2 * (boss.hp / boss.maxHp)), 10, 5); ctx.fill();
    }

    this._minimap();
    if (this._touchBtns) for (const b of this._touchBtns) this._touchBtn(b);
    ctx.restore();
  }

  // Weapon carousel: on a swap, a row of weapon chips (glyph graphics) slides in
  // at the bottom and animates so the selected weapon centres and enlarges. Only
  // shown briefly (weaponSwapT); the slide is eased via _carouselPos in update().
  _weaponCarousel() {
    const n = this.weapons.length;
    if (n <= 1) return;
    const ctx = this.ctx;
    const alpha = Math.min(1, this.weaponSwapT * 2.2);   // ease out as the timer runs down
    const spacing = 74, chipW = 58, chipH = 58;
    const cx = W / 2, cy = H - 124;   // sit above the bottom hint strip
    const pos = this._carouselPos ?? this.weaponIdx;
    ctx.save();
    // soft backdrop strip
    const panelW = Math.min(W * 0.92, spacing * n + 80);
    ctx.globalAlpha = alpha * 0.5; ctx.fillStyle = 'rgba(4,12,22,0.7)';
    ctx.beginPath(); ctx.roundRect(cx - panelW / 2, cy - chipH * 0.78, panelW, chipH * 1.5, 16); ctx.fill();
    for (let i = 0; i < n; i++) {
      const dx = (i - pos) * spacing, x = cx + dx;
      if (Math.abs(dx) > W / 2 + chipW) continue;
      const sel = i === this.weaponIdx;
      const s = sel ? 1.15 : 0.84;
      const near = 1 - Math.min(1, Math.abs(dx) / (spacing * 2.4)) * 0.55;
      ctx.globalAlpha = alpha * near;
      const hw = chipW * s / 2, hh = chipH * s / 2;
      ctx.fillStyle = sel ? 'rgba(28,76,116,0.95)' : 'rgba(10,26,40,0.8)';
      ctx.strokeStyle = sel ? PAL.air : 'rgba(120,180,240,0.4)'; ctx.lineWidth = sel ? 2.6 : 1.2;
      ctx.beginPath(); ctx.roundRect(x - hw, cy - hh, hw * 2, hh * 2, 12); ctx.fill(); ctx.stroke();
      this._text(WEAPON_INFO[this.weapons[i]].glyph, x, cy - 2, sel ? 30 : 22, sel ? PAL.harpoonTip : '#cfe0ee', 'center', 'middle');
    }
    ctx.globalAlpha = alpha;
    this._text(WEAPON_INFO[this.weapon].name, cx, cy + chipH * 0.74, 13, PAL.air, 'center', 'middle', true);
    ctx.restore();
  }

  // A big cartoon power-up name that pops into the middle of the screen and
  // pulses while it holds, then fades — set by _applyPowerUp, ticked by puT.
  _puFlourish() {
    const ctx = this.ctx;
    const total = 1.7, age = total - this.puT;          // 0 → 1.7 as it plays
    const popIn = Math.min(1, age / 0.16);              // quick pop to full size
    const pulse = 1 + 0.12 * Math.sin(age * 9);         // continuous breathing pulse
    const scale = popIn * pulse;
    const alpha = this.puT < 0.45 ? this.puT / 0.45 : 1;   // fade over the last 0.45s
    const TAU = Math.PI * 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    // Comic starburst behind the words.
    ctx.beginPath();
    const pts = 16, ro = 220, ri = 176;
    for (let i = 0; i < pts * 2; i++) {
      const ang = (i / (pts * 2)) * TAU - Math.PI / 2;
      const rr = i % 2 ? ri : ro;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * 0.42;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(3,14,26,0.5)'; ctx.fill();
    ctx.strokeStyle = this.puCol; ctx.globalAlpha = alpha * 0.55; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = alpha;
    // The name — big, dark outline + bright fill for a sticker/cartoon look.
    ctx.font = '900 58px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 13; ctx.strokeStyle = 'rgba(4,14,26,0.92)'; ctx.strokeText(this.puName, 0, 0);
    ctx.fillStyle = this.puCol; ctx.fillText(this.puName, 0, 0);
    ctx.restore();
  }

  // On-screen exit finder for the special zones: a pulsing marker over the exit
  // when it's on screen, or an arrow pinned to the screen edge pointing toward
  // it when it's off screen — so players never get lost looking for the way out.
  _exitLocator(ex, ey, label) {
    const ctx = this.ctx;
    const sx = ex - this.camX, sy = ey - this.camY;
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 5);
    const onScreen = sx > 24 && sx < W - 24 && sy > 24 && sy < H - 24;
    ctx.save();
    ctx.globalAlpha = pulse;
    if (onScreen) {
      this._text('▲ ' + label, sx, sy - 52, 15, PAL.gateGlow, 'center', 'bottom', true);
    } else {
      // Clamp toward the screen edge and point an arrow along the bearing.
      const m = 40;
      const px = Math.max(m, Math.min(W - m, sx));
      const py = Math.max(m, Math.min(H - m, sy));
      const ang = Math.atan2(sy - H / 2, sx - W / 2);
      ctx.translate(px, py); ctx.rotate(ang);
      ctx.fillStyle = PAL.gateGlow;
      ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(-11, -12); ctx.lineTo(-11, 12); ctx.closePath(); ctx.fill();
      ctx.rotate(-ang);
      this._text(label, 0, py < H / 2 ? 30 : -26, 12, PAL.gateGlow, 'center', 'middle', true);
    }
    ctx.restore();
  }

  // Fog-of-war minimap in the top-right corner.
  _minimap() {
    const ctx = this.ctx, C = this.cave; if (!C) return;
    const mw = 116, mh = Math.round(mw * WH / WW), mx = W - mw - 16, my = 128;
    // The map is translucent, and fades further when the diver swims behind it
    // so it never hides the action. Eased for a smooth transition.
    const dsx = this.diver.x - this.camX, dsy = this.diver.y - this.camY;
    const under = dsx > mx - 10 && dsx < mx + mw + 10 && dsy > my - 10 && dsy < my + mh + 10;
    const target = under ? 0.26 : 0.82;
    this._mapAlpha = this._mapAlpha === undefined ? target : this._mapAlpha + (target - this._mapAlpha) * 0.2;

    ctx.save();
    ctx.globalAlpha = this._mapAlpha;
    ctx.fillStyle = 'rgba(3,12,22,0.72)';
    ctx.beginPath(); ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    this._text('MAP', mx + mw - 2, my - 6, 9, 'rgba(150,200,230,0.7)', 'right', 'bottom');
    ctx.save();
    ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(C.mini, mx, my, mw, mh);
    const wx = (x) => mx + (x / WW) * mw, wy = (y) => my + (y / WH) * mh;
    // boat + relic markers (reef only, relic once seen)
    if (this.zone === 'reef') {
      ctx.fillStyle = '#e07a4a'; ctx.fillRect(wx(this.boat.x) - 2, wy(WORLD.SURFACE) - 1, 4, 3);
      // dive bells (fixed, known checkpoints)
      for (const b of this.bells) { ctx.fillStyle = PAL.bell; ctx.beginPath(); ctx.arc(wx(b.x), wy(b.y), 2.2, 0, Math.PI * 2); ctx.fill(); }
      if (this.relic && !this.relic.taken) {
        const rgx = Math.floor(this.relic.x / CELL), rgy = Math.floor(this.relic.y / CELL);
        if (C.seen[rgy * C.GW + rgx]) { ctx.fillStyle = PAL.key; ctx.beginPath(); ctx.arc(wx(this.relic.x), wy(this.relic.y), 2.6, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // exit marker in the special zones (fixed, known location — always shown)
    const exit = this.zone === 'temple' ? this.templeExit : this.zone === 'belly' ? this.whaleExit : this.zone === 'abyss' ? this.abyssExit : null;
    if (exit) {
      ctx.fillStyle = PAL.gateGlow;
      ctx.beginPath(); ctx.arc(wx(exit.x), wy(exit.y), 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // Sonar / Salvager's Eye: blip loot & Black Pearls (bounded by treasure count).
    if (this._relicSonar || this._relicEye) {
      for (const tr of this.treasures) {
        if (tr.taken) continue;
        if (tr.pearl) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(wx(tr.x), wy(tr.baseY), 1.6, 0, Math.PI * 2); ctx.fill();
        } else if (this._relicSonar) {
          ctx.fillStyle = PAL.gold;
          ctx.beginPath(); ctx.arc(wx(tr.x), wy(tr.baseY), 1.1, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // diver (blinking)
    ctx.fillStyle = Math.floor(this.t * 4) % 2 ? '#eaffff' : '#7ff3ff';
    ctx.beginPath(); ctx.arc(wx(this.diver.x), wy(this.diver.y), 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#04121f'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();   // end clip
    ctx.restore();   // end alpha
  }

  // ---- control-scheme legend ------------------------------------------
  // Reflect the chosen scheme in the always-visible HTML hint strip below canvas.
  _applyHintStrip() {
    const el = (typeof document !== 'undefined') && document.getElementById('hint');
    if (el) el.textContent = hintStrip(this.controlScheme);
  }
  _setScheme(s) {
    this.controlScheme = s; this._schemeManual = true;
    try { localStorage.setItem(CONTROLS_KEY, s); } catch (e) { /* private mode */ }
    this._applyHintStrip(); this.audio.select();
  }
  _cycleScheme() { this._setScheme(nextScheme(this.controlScheme)); }

  // Cycle the menu 'START AT' selector through fresh-reef-1 plus every reef a
  // held relic unlocks. No-op when you hold no reef relics.
  _cycleStartReef() {
    const opts = [1, ...availableSkips(this.meta)];
    if (opts.length <= 1) { this.pendingStartReef = 1; return; }
    const i = Math.max(0, opts.indexOf(this.pendingStartReef));
    this.pendingStartReef = opts[(i + 1) % opts.length];
    this.audio.select();
  }
  // Auto-switch to pad prompts when a gamepad appears — until the player picks.
  _autoDetectScheme() {
    if (this._schemeManual) return;
    const want = this.input.padConnected ? 'steamdeck' : 'keyboard';
    if (want !== this.controlScheme) { this.controlScheme = want; this._applyHintStrip(); }
  }
  // A single action's prompt label for the current scheme (non-touch surfaces).
  _key(action) { return ctrlPrompt(this.controlScheme, action); }

  _menu() {
    const cx = W / 2;
    this._panel();
    this._text('DEEP DESCENT', cx, 170, 58, PAL.glow, 'center', 'middle', true);
    this._text('a modern homage to Durell’s SCUBA DIVE (1983)', cx, 216, 16, '#bfe6ff', 'center', 'middle');
    this._text('Explore 2D caves — tunnels, drop-offs & chambers.', cx, 288, 17, PAL.hudText, 'center', 'middle');
    this._text('Grab pearls, gems & sunken wrecks. Harpoon the hunters.', cx, 314, 17, PAL.hudText, 'center', 'middle');
    this._text('Refill air at bubble vents; surface at the boat to bank.', cx, 340, 17, PAL.hudText, 'center', 'middle');
    // Reef-skip 'START AT' selector — only shown when you hold reef relics.
    const skips = availableSkips(this.meta);
    if (skips.length) {
      const opts = [1, ...skips];
      if (!opts.includes(this.pendingStartReef)) this.pendingStartReef = 1;
      const r = this.pendingStartReef;
      const label = r > 1
        ? `‹ Reef ${r}  ·  cash a Reef-${r - 1} relic  ·  +${skipStartGold(r)}g ›`
        : '‹ Reef 1 — fresh dive ›';
      this._text('⚓ START AT:', cx - 152, 372, 13, '#9fc6e0', 'right', 'middle');
      this._text(label, cx + 4, 372, 14, r > 1 ? PAL.key : PAL.hudText, 'center', 'middle', true);
      this._text(this.input.isTouch ? 'tap' : '↑ ↓', cx + 176, 372, 11, '#7fb0d0', 'left', 'middle');
    }
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE', cx, 404, 22, PAL.gold, 'center', 'middle', true);
    // Control-scheme selector (‹ Keyboard / Steam Deck / ROG Ally ›). Tap it on
    // touch, or press C / ← → to cycle; the legend below updates to match.
    this._text('🎮 Controls:', cx - 128, 450, 14, '#9fc6e0', 'right', 'middle');
    this._text(`‹ ${SCHEME_LABEL[this.controlScheme]} ›`, cx - 6, 450, 16, PAL.gold, 'center', 'middle', true);
    this._text(this.input.isTouch ? 'tap to change' : 'C / ← →', cx + 120, 450, 12, '#7fb0d0', 'left', 'middle');
    this._text(`Swim ${this._key('swim')}   ·   Fire ${this._key('fire')} (hold to aim)   ·   Swap ${this._key('swap')}   ·   Shop ${this._key('shop')}`, cx, 474, 12, '#7fb0d0', 'center', 'middle');
    if (this.hi > 0) this._text(`BEST ${this.hi} · REEF ${this.hiReef}`, cx, 494, 14, '#bfe6ff', 'center', 'middle');
    // Help / Dry Dock buttons + prompt.
    const ctx = this.ctx;
    ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.7)'; ctx.strokeStyle = 'rgba(150,200,240,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx - 140, 516, 132, 34, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(cx + 8, 516, 132, 34, 8); ctx.fill(); ctx.stroke(); ctx.restore();
    this._text('❔ HOW TO PLAY  (H)', cx - 74, 533, 14, PAL.hudText, 'center', 'middle', true);
    this._text('🛠 DRY DOCK  (R)', cx + 74, 533, 14, PAL.gold, 'center', 'middle', true);
    this._text(this.input.isTouch ? 'Tap 🛠 for the DRY DOCK — spend Salvage on relics' : 'Press R / tap 🛠 for the DRY DOCK', cx, 505, 11, '#9fc6e0', 'center', 'middle');
  }

  _gameOverScreen() {
    const cx = W / 2;
    this._panel();
    const title = this.won ? 'HAUL SECURED!' : this.deathCause === 'killed' ? 'YOU DIED' : 'OUT OF AIR';
    this._text(title, cx, 220, 48, this.won ? PAL.gold : PAL.danger, 'center', 'middle', true);
    if (!this.won) {
      const sub = this.deathCause === 'killed' ? 'The wildlife got you' : 'You ran out of air';
      this._text(sub, cx, 256, 15, '#ff9a6b', 'center', 'middle');
    }
    this._text(`SCORE ${this.score}`, cx, 290, 30, PAL.hudText, 'center', 'middle');
    this._text(`DEEPEST ${Math.round(this.depthReached / 10)} m`, cx, 326, 16, '#bfe6ff', 'center', 'middle');
    if (this.newHi) this._text(`★ NEW BEST · REEF ${this.reef} ★`, cx, 360, 20, PAL.glow, 'center', 'middle', true);
    else this._text(`BEST ${this.hi} · REEF ${this.hiReef}`, cx, 360, 16, '#bfe6ff', 'center', 'middle');
    if (this.lastPayout != null) {
      const pearlNote = this.blackPearlsBanked > 0 ? `  ·  ${this.blackPearlsBanked} pearl${this.blackPearlsBanked === 1 ? '' : 's'}` : '';
      this._text(`⚙ SALVAGE +${this.lastPayout}  ·  ${this.meta.salvage} banked${pearlNote}`, cx, 394, 15, PAL.gold, 'center', 'middle');
    }
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE AGAIN', cx, 430, 20, PAL.gold, 'center', 'middle', true);
    this._text(this.input.isTouch ? 'Tap 🛠 for the DRY DOCK — spend Salvage on relics' : 'Press R / tap 🛠 for the DRY DOCK', cx, 466, 12, '#9fc6e0', 'center', 'middle');
    const ctx = this.ctx;
    ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.7)'; ctx.strokeStyle = 'rgba(150,200,240,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx - 140, 516, 132, 34, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(cx + 8, 516, 132, 34, 8); ctx.fill(); ctx.stroke(); ctx.restore();
    this._text('❔ HOW TO PLAY  (H)', cx - 74, 533, 14, PAL.hudText, 'center', 'middle', true);
    this._text('🛠 DRY DOCK  (R)', cx + 74, 533, 14, PAL.gold, 'center', 'middle', true);
  }

  _overlay(title, sub) {
    const cx = W / 2;
    this._panel(0.4);
    this._text(title, cx, H / 2 - 10, 44, PAL.hudText, 'center', 'middle', true);
    this._text(sub, cx, H / 2 + 34, 16, '#bfe6ff', 'center', 'middle');
  }

  _panel(alpha = 0.55) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(3,15,30,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Small keycap box with a letter, for control hints.
  _keycap(label, x, y) {
    const ctx = this.ctx, w = 15, h = 15;
    ctx.save();
    ctx.fillStyle = 'rgba(20,44,66,0.9)'; ctx.strokeStyle = 'rgba(150,200,240,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, 3); ctx.fill(); ctx.stroke();
    ctx.restore();
    this._text(label, x + w / 2, y + 0.5, 9, PAL.hudText, 'center', 'middle', true);
  }

  _text(str, x, y, size, color, align = 'left', base = 'alphabetic', bold = false) {
    const ctx = this.ctx;
    ctx.font = `${bold ? '800' : '600'} ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = base;
    if (bold) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }
}

// Pick up to `count` items from `list` that are at least `minDist` apart.
function spread(list, count, minDist) {
  const shuffled = list.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const out = [];
  for (const c of shuffled) {
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > minDist)) { out.push(c); if (out.length >= count) break; }
  }
  return out;
}
