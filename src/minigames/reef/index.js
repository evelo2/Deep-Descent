// @ts-check
// The Reef — the core dive loop extracted as the main MiniGame (Phase 6; see
// docs/platform/migration-plan.md + the P6 design spec). This is the payoff of
// the strangler-fig migration: the reef dive loop, its three cave-reusing zones
// (abyss + mini-sub, temple, whale belly), and the extraction timer move out of
// the monolithic `game.js` god-object, leaving `game.js` as the Core shell
// (menu/router/screens/services). The reef also builds and owns the nested
// whirlpool (P4) and stage (P5) MiniGames.
//
// SHAPE: a nested reef-driven MiniGame (id/enter/update/render/exit) — the shell
// delegates update/draw/onAction to it. It is NOT Core.boot-ed this phase.
//
// STATE OWNERSHIP: the reef OWNS the ephemeral run-state (score/gold/lives/carried,
// loadout, entity arrays, zone/sub state, extraction). Its methods use natural
// `this.x`. It runs the whole state machine and calls back to the shell for the
// meta screens (menu/help/Trophy Wall/dry-dock) + a few shell-owned things
// (state/controlScheme/hi) via the `shell` facade (this._shell).
//
// LIVE VIEWPORT: W/H are re-synced from WORLD (the shared, setViewport-mutated
// source of truth) at the top of update()/render() each frame.

import { WORLD, AIR, GAME, CAVE, HARPOON, SHARK, SHELL, BUBBLE, PAL } from '../../config.js';
import { Diver } from '../../entities/diver.js';
import { Boat } from '../../entities/boat.js';
import { Clam, Chest, GiantClam } from '../../entities/shell.js';
import { BigBubble } from '../../entities/bigbubble.js';
import { Treasure } from '../../entities/treasure.js';
import { spawnCreature, pickFauna, faunaInfo, newFaunaAtReef, faunaKindsUpTo } from '../../entities/spawn.js';
import { Cave } from '../../systems/cave.js';
import { Flora } from '../../render/flora.js';
import { Harpoon } from '../../entities/harpoon.js';
import { AirVent } from '../../entities/airvent.js';
import { Wreck } from '../../entities/wreck.js';
import { Whale } from '../../entities/whale.js';
import { Kraken } from '../../entities/kraken.js';
import { Guardian } from '../../entities/guardian.js';
import { Current } from '../../entities/current.js';
import { PowerUp } from '../../entities/powerup.js';
import { Relic } from '../../entities/relic.js';
import { DiveBell } from '../../entities/divebell.js';
import { Net, DepthCharge, SupplyCrate } from '../../entities/weapons.js';
import { prevScheme, prompt as ctrlPrompt } from '../../controls.js';
import { KRAKEN, POWERUP, RELIC, GOLD, BELL, bellBankRate, WEAPON_ORDER, WEAPON_INFO, NET, CHARGE, SHOCK, SPEARGUN, SHOP, AIM, DARKZONE, FLARE, TORCH, SALVAGE, ABYSS, SUB, WHIRL, DIVER, COLLECT_BONUS, CONSUMABLE, CONSUMABLE_BY_ID, CRATE, pickWeighted, RELIC_INFO, SPECIAL_CHEST, specialChestChance, GUARDIAN } from '../../config.js';
import { drawWhaleSkeleton, drawRib, drawThroat, drawTempleGate, drawAbyssMaw, drawWhirlMaw, drawSub, drawKey, drawDoor, drawColumn } from '../../render/props.js';
import { StageEntrance } from '../../entities/stageentrance.js';
import { THEMES } from '../../stage/themes.js';
import { makeWhirlpool } from '../whirlpool/index.js';
import { makeStage } from '../stage/index.js';
import { makeHost } from '../../core/host.js';
import { STAGE } from '../../config.js';
import { saveSalvage, runPayout, bankReefRelic, consumeReefRelic, skipStartGold } from '../../meta/salvage.js';
import { awardBadges, saveBadges, rankFor } from '../../meta/badges.js';
import { addRun, saveStats } from '../../meta/stats.js';
import { awardProgress, saveProgress, trackProgress, tierNameById } from '../../meta/progressive.js';
import { unlockAchievement } from '../../platform/steam.js';
import { applyLoadout, getRelic, tickEquippedRentals } from '../../meta/relics.js';
import { text, panel, overlay, keycap, mmss } from '../../render/chrome.js';

// Live logical viewport (see LIVE VIEWPORT note). WW/WH/etc. are fixed.
let { W, H } = WORLD;
const { WW, WH, OPEN_BAND, CELL } = WORLD;

// Reef flavour: each reef gets a wacky procedural name + a light theme.
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

// Cartoon pop-up name + colour flashed up when a power-up is collected.
const PU_INFO = {
  tank:      { name: '+30 AIR!',         col: PAL.air },
  multifire: { name: 'TRIPLE SHOT!',     col: PAL.harpoonTip },
  shield:    { name: 'SHIELD UP!',       col: PAL.gateGlow },
  speed:     { name: 'SPEED FINS!',      col: PAL.air },
  magnet:    { name: 'TREASURE MAGNET!', col: PAL.gold },
  life:      { name: 'EXTRA LIFE!',      col: PAL.diver },
};

// Pure: the effective air-drain multiplier for a given reef number + zone — the
// reef's own depth penalty, times an extra 150% while on foot in the abyss.
// Piloting the mini-sub negates the abyss factor. Shared by update() + unit tests.
export function oxygenMultiplier(reef, zone, inSub = false) {
  let m = 1 + GAME.oxygenPenaltyPerReef * Math.min(reef - 1, GAME.oxygenPenaltyCap);
  if (zone === 'abyss' && !inSub) m *= ABYSS.airMult;
  return m;
}

// Pure: the chance a reef offers a bonus-zone portal (temple/stage/abyss/whirl),
// reef-gated so early reefs are mostly plain and deep reefs usually offer a detour.
// Linear ramp from GAME.bonusZone.base at reef 1, +perReef each reef, capped.
// Shared by _generateWorld's spawn roll + unit tests.
export function bonusZoneChance(reef) {
  const { base, perReef, cap } = GAME.bonusZone;
  return Math.min(cap, base + perReef * Math.max(0, reef - 1));
}

// Poisson-ish thinning: shuffle `list`, keep points at least `minDist` apart, up
// to `count`. Used across world generation to scatter entities without clumping.
function spread(list, count, minDist) {
  const shuffled = list.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const out = [];
  for (const c of shuffled) {
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > minDist)) { out.push(c); if (out.length >= count) break; }
  }
  return out;
}

export function makeReef({ host, shell, ctx, bg }) {
  return new Reef({ host, shell, ctx, bg });
}

export class Reef {
  constructor({ host, shell, ctx, bg }) {
    this.id = 'reef';
    this.host = host;
    this._shell = shell;
    this.ctx = ctx;
    this.bg = bg;
    this.audio = host.audio; this.input = host.input; this.particles = host.particles;
    // DiverWorld engine seam (P3): diver/camera/air are engine-owned — install
    // instance accessors so every this.diver/this.camX/this.air below is
    // byte-identical yet reads/writes host.world.
    this._world = host.world;
    for (const key of ['diver', 'camX', 'camY', 'air', 'airMax']) {
      Object.defineProperty(this, key, {
        get() { return this._world[key]; },
        set(v) { this._world[key] = v; },
        configurable: true, enumerable: true,
      });
    }
    // Meta spine refs (the SAME objects the Core services own — a salvage/badge
    // written here is the one every minigame sees).
    this.meta = host.economy.state;
    this.badgeState = host.progression.badges;
    this.statState = host.progression.stats;
    this.progressState = host.progression.progress;
    // Run-state (mirrors the legacy Game ctor).
    this.t = 0; this.shake = 0;
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.diver = new Diver();
    this.boat = new Boat();
    this.flash = 0; this.bankPulse = 0;
    this.harpoons = []; this.nets = []; this.charges = []; this.explosions = []; this.vents = []; this.wrecks = []; this.cave = null; this.flora = null;
    this.shells = []; this.bigBubbles = []; this.skeletons = []; this.whales = []; this.currents = []; this.krakens = [];
    this.zone = 'reef'; this.ribs = []; this.whaleExit = null; this.savedReef = null;
    this.templeGate = null; this.templeExit = null; this.door = null; this.key = null; this.hasKey = false; this.columns = [];
    this.stageEntrances = [];
    this.abyssEntrance = null; this.abyssExits = [];
    this.whirlEntrance = null;
    this.hasSub = false; this.inSub = false; this.subArmor = 0;
    this.powerups = []; this.airMax = AIR.max; this.multiFireT = 0; this.bells = []; this.crates = []; this.darkZones = [];
    this.relic = null; this.relicBanked = false; this.carryingRelic = false; this.reefBanked = 0; this.reefGoal = RELIC.goalBase;
    this.reef = 1; this.dockHold = 0; this.sailT = 0; this.zoneFade = 0;
    this.reefName = ''; this.reefTheme = REEF_THEMES[0];
    this.puT = 0; this.puName = ''; this.puCol = '#fff';
    this.diver.reset();
    // Per-run relic flags (Salvage Log). The authority is applyLoadout() →
    // resetRelicFlags() in meta/relics.js, which re-sets these every run BEFORE any
    // read; declared here (mirroring those defaults) so the Reef's shape is explicit
    // to the type-checker, which can't see the external resetRelicFlags(this) writes.
    this._relicAirBonus = 0; this._relicSwimMult = 1;
    this._relicPlating = false; this._relicBellFull = false;
    this._relicSonar = false; this._relicBarbs = false; this._relicSecondWind = false;
    this._relicEye = false; this._relicChart = false; this._relicMagnet = false;
    // Nested zone MiniGames (P4 whirlpool, P5 stage) — now built + owned here.
    // Built through makeHost so the nested modules receive a COMPLETE Host facade
    // (the same rng/progression/achievements the reef itself got), not an ad-hoc
    // subset — the boundary the nested modules type against. Viewport is the live
    // module-level WORLD; the rest are shared by reference.
    const mgHost = makeHost({
      world: this._world, economy: host.economy,
      audio: this.audio, input: this.input, particles: this.particles,
      viewport: WORLD, rng: host.rng,
      progression: host.progression, achievements: host.achievements,
    });
    this._mgHost = mgHost;
    this._whirl = makeWhirlpool({ host: mgHost, reef: this._whirlReef() });
    this._stage = makeStage({ host: mgHost, reef: this._stageReef() });
  }

  // MiniGame lifecycle: the shell hands off with enter(); a fresh run resets via
  // start(). exit() reports the run result (the shell reads finalStats() for the
  // game-over screen; crediting is done inline at game-over, legacy-style).
  enter(_host) {}
  exit() { return { outcome: this.won ? 'win' : 'gameover', score: this.score, reef: this.reef, credited: true }; }

  // Run summary the shell's game-over screen reads.
  finalStats() {
    return {
      score: this.score, reef: this.reef, deathCause: this.deathCause,
      won: this.won, newHi: this.newHi, lastPayout: this.lastPayout,
      newBadges: this.newBadges, newTiers: this.newTiers, gold: this.gold,
      depthReached: this.depthReached, blackPearlsBanked: this.blackPearlsBanked,
      t: this.t, lapsedRentals: this.lapsedRentals || [],
    };
  }

  _stageReef() {
    const g = this;
    return {
      get carried() { return g.carried; }, set carried(v) { g.carried = v; },
      get score() { return g.score; },
      get lives() { return g.lives; },
      get shake() { return g.shake; }, set shake(v) { g.shake = v; },
      get flash() { return g.flash; }, set flash(v) { g.flash = v; },
      get zoneFade() { return g.zoneFade; }, set zoneFade(v) { g.zoneFade = v; },
      get zone() { return g.zone; }, set zone(v) { g.zone = v; },
      get state() { return g._shell.state; },
      get t() { return g.t; },
      get reefNum() { return g.reef; },
      get controlScheme() { return g._shell.controlScheme; },
      set fireGrace(v) { g._fireGrace = v; },
      snapshotReef: (x, y) => g._snapshotReef(x, y),
      restoreReef: () => g._restoreReef(),
      loseLife: (cause) => g._loseLife(cause),
      consumeStageEntrance: (e) => { g.stageEntrances = g.stageEntrances.filter((x) => x !== e); },
      // The generic end-of-frame chrome the stage scene shares with the reef.
      drawChrome: () => {
        if (g._shell._touchBtns) for (const b of g._shell._touchBtns) g._shell._touchBtn(b);
        if (g._shell.state === 'paused') g._overlay('PAUSED', (g.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume'));
        if (g._shell.state === 'gameover') g._shell._gameOverScreen();
      },
    };
  }

  _whirlReef() {
    const g = this;
    return {
      get carried() { return g.carried; }, set carried(v) { g.carried = v; },
      get carriedPearls() { return g.carriedPearls; }, set carriedPearls(v) { g.carriedPearls = v; },
      get score() { return g.score; }, set score(v) { g.score = v; },
      get depthReached() { return g.depthReached; }, set depthReached(v) { g.depthReached = v; },
      get shake() { return g.shake; }, set shake(v) { g.shake = v; },
      get flash() { return g.flash; }, set flash(v) { g.flash = v; },
      get zoneFade() { return g.zoneFade; }, set zoneFade(v) { g.zoneFade = v; },
      get zone() { return g.zone; }, set zone(v) { g.zone = v; },
      get whirlEntrance() { return g.whirlEntrance; }, set whirlEntrance(v) { g.whirlEntrance = v; },
      get hi() { return g._shell.hi; },
      get state() { return g._shell.state; },
      get t() { return g.t; },
      get bg() { return g.bg; },
      get ctx() { return g.ctx; },
      snapshotReef: (x, y) => g._snapshotReef(x, y),
      restoreReef: () => g._restoreReef(),
      bankLoot: (rate) => g._bankLoot(rate),
      toast: (name, col, dur) => { g.puName = name; g.puCol = col; g.puT = dur; },
      text: (...a) => g._text(...a),
      // The generic end-of-frame chrome the whirlpool scene shares with the reef.
      drawChrome: () => {
        if (g.puT > 0) g._puFlourish();
        if (g._shell.state === 'paused') g._overlay('PAUSED', (g.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume') + '   ·   H for help');
        if (g._shell.state === 'gameover') g._shell._gameOverScreen();
        if (g._shell._touchBtns) for (const b of g._shell._touchBtns) g._shell._touchBtn(b);
      },
    };
  }

  start(startReef = 1) {
    this._shell.state = 'playing';
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
    // Timed consumable buffs (shop-bought): a run-long timer per id, spent on
    // death (this reset zeroes them). See CONSUMABLE + _shopBuy + the tick below.
    this.buffT = {}; for (const c of CONSUMABLE) this.buffT[c.id] = 0;
    // The Deep's extraction kicker (see _tripExtraction / _updateExtraction).
    this.extractActive = false; this.extractT = 0; this.extractLapsed = false;
    this.nextLifeScore = GAME.firstLifeScore; this.oneUpT = 0;
    this.depthReached = 0; this.fireCd = 0;
    // Per-run Salvage milestone counters (Salvage Log payout at run end).
    this.bossesFelled = 0; this.relicsBanked = 0; this.blackPearlsBanked = 0;
    this.runChestsOpened = 0; this.runGuardiansFelled = 0;
    // Per-run badge stats (see _runStats / awardBadges at game-over).
    this.kills = 0; this.creaturesSpawned = 0; this.tookDamage = false; this.didCleanSweep = false;
    // Per-run lifetime-stat deltas (folded into statState at game-over → progressive badges).
    this.runSharkKills = 0; this.runNetted = 0; this.runSubLoot = 0; this.runTime = 0;
    this.newBadges = []; this.newTiers = []; this.lapsedRentals = [];
    this.metFauna = new Set();   // creature kinds already announced this run (reef-intro flash)
    this.toastQueue = [];        // queued flourishes played one-at-a-time through puName
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
    this._shell.pendingStartReef = 1;   // reset the menu selection for next time
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
    this.specialChest = null; this.chestGuardian = null;
    this.columns = []; this.door = null; this.key = null; this.templeExit = null; this.hasKey = false; this.powerups = []; this.bells = []; this.crates = []; this.darkZones = [];
    this.stageEntrances = []; this.abyssEntrance = null; this.abyssExits = [];
    this.whirlEntrance = null;   // reef portal (reef-owned); whirl gameplay state lives in the whirlpool MiniGame
    const chestValue = (y) => 200 + Math.round((y / WH) * 400);   // 200..600 by depth

    // Clams and chests rest on cave-floor ledges, opening and closing. Pearls
    // (clams) only appear below a minimum depth — the shallows hold chests.
    const pearlMinDepth = WH * GAME.pearlMinDepthFrac;
    for (const f of spread(C.floors(), 34, 150)) {
      if (f.y > pearlMinDepth && Math.random() < 0.62) this.shells.push(new Clam(f.x, f.y - SHELL.clamRadius * 0.35));
      else this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, chestValue(f.y)));
    }
    // A rare deep GIANT clam with a golden pearl — a trophy worth score+gold and
    // a chunk of Salvage. At most one, only in the deep, well clear of others.
    if (Math.random() < SHELL.giantChance) {
      const deep = C.floors(WH * SHELL.giantMinDepthFrac);
      if (deep.length) { const g = deep[(Math.random() * deep.length) | 0]; this.shells.push(new GiantClam(g.x, g.y - SHELL.giantRadius * 0.35)); }
    }
    // Scattered coins & gems drift in open water.
    for (let i = 0; i < 40; i++) {
      const c = C.randomOpen(); if (!c) continue;
      this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.14 + (c.y / WH) * 0.18 ? 'gem' : 'coin'));
    }
    // Treasure-sweep bonus baseline: total loose treasure this reef, and which
    // completion tiers (80/90/100%) have paid out (see the check in update()).
    this._reefTreasureTotal = this.treasures.length; this._collectTier = 0;

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
      if (Array.isArray(spawned)) { this.creatures.push(...spawned); this.creaturesSpawned += spawned.length; }
      else if (spawned) { this.creatures.push(spawned); this.creaturesSpawned++; }
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

    const pickOne = (arr) => arr[(Math.random() * arr.length) | 0];

    // Ambient combat encounter (a whale OR a kraken) — a flat, modest roll so
    // even early reefs feel alive. Separate from the bonus-zone portals below.
    {
      const roomy = C.chambers(OPEN_BAND + 500);
      const deep = C.chambers(WH * 0.5);
      const options = [];
      if (roomy.length) options.push('whale');
      if (deep.length) options.push('kraken');
      if (options.length && Math.random() < GAME.ambientEncounterChance) {
        const pick = pickOne(options);
        if (pick === 'whale') {
          const s = pickOne(roomy); this.whales.push(new Whale(s.x, s.y - 10));
        } else {
          const den = pickOne(deep); this.krakens.push(new Kraken(den.x, den.y));
          for (let k = 0; k < 6; k++) {
            const gx = den.x + (Math.random() - 0.5) * 260, gy = den.y + (Math.random() - 0.5) * 200;
            if (!C.isSolid(gx, gy)) this.treasures.push(new Treasure(gx, gy, Math.random() < 0.6 ? 'gem' : 'coin'));
          }
        }
      }
    }

    // Bonus-zone portal (temple / stage / abyss / whirlpool) — reef-GATED so
    // early reefs are mostly plain and deep reefs usually offer a detour, and AT
    // MOST ONE per reef (previously three independent, non-gated rolls stacked ~1.7
    // portals/reef from reef 1). Chance ramps with depth; see bonusZoneChance().
    this.templeGate = null; this.abyssEntrance = null; this.whirlEntrance = null;
    if (Math.random() < bonusZoneChance(this.reef)) {
      const gateFloors = C.floors().filter((f) => f.y > WH * 0.3 && f.y < WH * 0.7);
      const stageFloors = C.floors().filter((f) => f.y > OPEN_BAND + 300 && f.y < WH * 0.72);
      const abyssDeep = C.floors(WH * ABYSS.entranceMinDepthFrac);
      const whirlSpots = C.floors().filter((f) => f.y > WH * 0.55);
      const options = [];
      if (gateFloors.length) options.push('temple');
      if (stageFloors.length) options.push('stage');
      if (abyssDeep.length) options.push('abyss');
      if (whirlSpots.length) options.push('whirl');
      const pick = options.length ? pickOne(options) : null;
      if (pick === 'temple') {
        const gf = pickOne(gateFloors); this.templeGate = { x: gf.x, y: gf.y - 50, r: 46 };
      } else if (pick === 'stage') {
        const sf = pickOne(stageFloors);
        const theme = THEMES[(Math.random() * THEMES.length) | 0];
        this.stageEntrances.push(new StageEntrance(sf.x, sf.y - STAGE.entranceR, theme));
      } else if (pick === 'abyss') {
        // A submarine on a DEEP floor is the entrance to The Deep — placed in a
        // guaranteed-OPEN spot clear of clams/chests so it's never buried.
        for (let tries = 0; tries < 40; tries++) {
          const f = abyssDeep[(Math.random() * abyssDeep.length) | 0];
          const spot = C.nearestOpen(f.x, f.y - 40) || { x: f.x, y: f.y - 40 };
          if (!C.isSolid(spot.x, spot.y) && this.shells.every((s) => Math.hypot(s.x - spot.x, s.y - spot.y) > s.radius + 74)) {
            this.abyssEntrance = { x: spot.x, y: spot.y, r: 46 };
            break;
          }
        }
      } else if (pick === 'whirl') {
        const wf = pickOne(whirlSpots); this.whirlEntrance = { x: wf.x, y: wf.y - 50, r: 46 };
      }
    }

    // Rare guarded chest → Treasure Chest Madness. Deep third only, at most one
    // per dive; Siren's Lure boosts the odds. See specialChestChance().
    if (Math.random() < specialChestChance(this.reef, this._hasChestRelic())) {
      const cands = C.floors().filter((f) => f.y > WH * SPECIAL_CHEST.minDepthFrac);
      if (cands.length) {
        const f = pickOne(cands);
        this.specialChest = { x: f.x, y: f.y - 20, r: 26, opened: false };
        this.chestGuardian = new Guardian(f.x, f.y - 60);
        this._enqueueToast('✨ SOMETHING SPECIAL LURKS BELOW…', PAL.key, 2.4);
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

    // Reef intro flashes (reef 2+): announce this reef's featured new enemy,
    // then its relic — sequential flourishes reusing the power-up toast.
    if (this.reef >= 2) {
      const fresh = newFaunaAtReef(this.reef).filter((k) => !this.metFauna.has(k));
      const pool = fresh.length ? fresh
        : faunaKindsUpTo(this.reef).filter((k) => k !== 'shark' && !this.metFauna.has(k));
      if (pool.length) {
        const featured = pool[(Math.random() * pool.length) | 0];
        this.metFauna.add(featured);
        const fc = C.randomOpen(OPEN_BAND + 200);   // guarantee at least one of it spawns
        if (fc) {
          const sp = spawnCreature({ k: featured }, fc.x, fc.y, this.reef);
          if (Array.isArray(sp)) { this.creatures.push(...sp); this.creaturesSpawned += sp.length; }
          else if (sp) { this.creatures.push(sp); this.creaturesSpawned++; }
        }
        const fi = faunaInfo(featured);
        if (fi) this._enqueueToast(`${fi.glyph} NEW THREAT: ${fi.name}`, PAL.danger, 2.2);
      }
      if (this.relic) {
        const ri = RELIC_INFO[this.relic.type];
        if (ri) this._enqueueToast(`${ri.glyph} RELIC: ${ri.name}`, PAL.key, 2.2);
      }
    }

    this._orientShells();
    this._clearCreaturesNearPortals();
  }

  _enqueueToast(name, col, dur = 2.2) { this.toastQueue.push({ name, col, dur }); }

  // Siren's Lure (Dry Dock relic) boosts the guarded-chest spawn chance.
  _hasChestRelic() { return (this.meta.loadout || []).includes('siren'); }

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
    } else if (this.zone === 'abyss') {
      for (const e of this.abyssExits) portals.push({ x: e.x, y: e.y, r: e.r });
    }
    if (!portals.length) return;
    const clear = 90;   // gap kept beyond the portal's own interaction radius
    this.creatures = this.creatures.filter((cr) =>
      !portals.some((p) => Math.hypot(cr.x - p.x, cr.y - p.y) < p.r + clear + (cr.radius || 14)));
  }

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

  _openCrate() {
    const d = this.diver;
    const lockable = WEAPON_ORDER.filter((w) => WEAPON_INFO[w].cost > 0 && !this.owned.has(w) && this.reef >= WEAPON_INFO[w].minReef);
    const upgradable = WEAPON_ORDER.filter((w) => w !== 'charge' && this.owned.has(w) && this.weaponLevel[w] < SHOP.maxWeaponLevel);
    const buyableConsumables = CONSUMABLE.filter((c) => this.reef >= c.minReef);
    // Which outcomes are possible right now; impossible ones drop out and their
    // weight redistributes (e.g. a crate can't grant a weapon when all are maxed).
    const allowed = {
      harpoons: this.harpoonAmmo < this.harpoonMax,
      air: this.air < this.airMax,
      flares: true, gold: true,
      consumable: buyableConsumables.length > 0,
      weapon: lockable.length > 0 || upgradable.length > 0,
    };
    // If the two staples are both full, gold is the guaranteed fallback.
    let pick = pickWeighted(CRATE.weights, allowed, Math.random()) || 'gold';
    if (pick === 'weapon') {
      if (lockable.length) {
        const w = lockable[(Math.random() * lockable.length) | 0];
        this.owned.add(w); if (w === 'speargun') this.speargunAmmo = SPEARGUN.startAmmo;
        this._rebuildWeapons(); this.weaponIdx = this.weapons.indexOf(w);
        this.puName = `${WEAPON_INFO[w].name}!`; this.puCol = PAL.gold; this.puT = 1.7;
      } else {
        const w = upgradable[(Math.random() * upgradable.length) | 0]; this.weaponLevel[w] += 1;
        this.puName = `${WEAPON_INFO[w].name} Lv${this.weaponLevel[w]}`; this.puCol = PAL.air; this.puT = 1.7;
      }
    } else if (pick === 'consumable') {
      const c = buyableConsumables[(Math.random() * buyableConsumables.length) | 0];
      this.buffT[c.id] = c.dur;
      this.puName = `${c.glyph} ${c.name.toUpperCase()}!`; this.puCol = PAL.air; this.puT = 1.7;
    } else if (pick === 'harpoons') {
      this.harpoonAmmo = this.harpoonMax;   // full harpoons
      this.puName = 'HARPOONS FULL!'; this.puCol = PAL.harpoon; this.puT = 1.7;
    } else if (pick === 'air') {
      this.air = this.airMax;   // full tank
      this.puName = 'AIR FULL!'; this.puCol = PAL.air; this.puT = 1.7;
    } else if (pick === 'flares') {
      this.flares += FLARE.pack;
      this.puName = `+${FLARE.pack} FLARES!`; this.puCol = PAL.puffer; this.puT = 1.7;
    } else {
      this.gold += CRATE.goldFind;
      this.puName = `+${CRATE.goldFind} GOLD!`; this.puCol = PAL.gold; this.puT = 1.7;
    }
    this.particles.sparkle(d.x, d.y, PAL.gold, 26); this.audio.bank();
  }

  _rebuildWeapons() {
    const cur = this.weapons[this.weaponIdx];
    this.weapons = WEAPON_ORDER.filter((w) => this.owned.has(w));
    this.weaponIdx = Math.max(0, this.weapons.indexOf(cur));
  }

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
    // Timed consumable buffs — gameplay-tied, run-long or until death. Buying one
    // while it's active refreshes its timer (label shows the live remaining).
    for (const c of CONSUMABLE) {
      if (this.reef < c.minReef) continue;
      const active = (this.buffT[c.id] || 0) > 0;
      const tag = active ? `  (active ${this._mmss(this.buffT[c.id])})` : '';
      items.push({ kind: 'consumable', id: c.id, label: `${c.glyph} ${c.name} — ${c.desc}${tag}`, cost: c.cost });
    }
    items.push({ kind: 'close', id: 'close', label: 'Close', cost: 0 });
    return items;
  }

  _dblCost(base, level) { return Math.round(base * Math.pow(2, level)); }

  _shopRow(i) {
    const n = this._shopItems().length;
    const top = 176, bottom = 556, w = 470, x = (W - w) / 2;
    const step = Math.min(46, (bottom - top) / Math.max(1, n));
    return { x, y: top + i * step, w, h: Math.min(40, step - 6) };
  }

  _openShop(where) { this._shell.state = 'shop'; this.shopWhere = where; this.shopSel = 0; this.shopDeny = 0; this.audio.select(); }

  _closeShop() { this._shell.state = 'playing'; this._fireGrace = 0.3; }   // don't fire on the closing press

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
    } else if (it.kind === 'consumable') {
      const c = CONSUMABLE_BY_ID[it.id];
      this.buffT[it.id] = c.dur;   // set (refresh) — runs until it lapses or you die
      this.puName = `${c.glyph} ${c.name.toUpperCase()}!`; this.puCol = PAL.air; this.puT = 1.6;
      this.particles.sparkle(this.diver.x, this.diver.y, PAL.air, 22);
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

  _generateTemple() {
    const C = this.cave = new Cave('temple');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.specialChest = null; this.chestGuardian = null;
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

  _generateAbyss() {
    const C = this.cave = new Cave('abyss');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.specialChest = null; this.chestGuardian = null;
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
    // No currents in the trench: the heavy sub + narrow channels made swept
    // currents almost impossible to fight, so The Deep stays still water.
    this.currents = [];
    this._makePowerups(1);
    // Several exit hatches scattered through the trench — deeper ones pay a
    // bigger Salvage bonus on the way out (see the exit check in update()).
    this.abyssExits = [];
    for (const spot of spread(C.chambers(OPEN_BAND + 200), ABYSS.exits, 700)) {
      const depthFrac = spot.y / WH;
      this.abyssExits.push({ x: spot.x, y: spot.y, r: 40, bonus: Math.round(ABYSS.exitBonusBase * (0.6 + depthFrac)) });
    }
    if (!this.abyssExits.length) { const c = C.randomOpen(WH * 0.5) || { x: WW / 2, y: WH * 0.5 }; this.abyssExits.push({ x: c.x, y: c.y, r: 40, bonus: ABYSS.exitBonusBase }); }
    this._orientShells();
    this._clearCreaturesNearPortals();
  }

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

  _generateBelly() {
    const C = this.cave = new Cave('belly');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = [];
    this.skeletons = []; this.whales = []; this.ribs = []; this.currents = []; this.krakens = [];
    this.specialChest = null; this.chestGuardian = null;
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

  onAction() {
    if (this._shell.state === 'menu' || this._shell.state === 'gameover') { this.audio.ensure(); this.audio.resume(); this.start(this._shell.pendingStartReef); }
    else if (this._shell.state === 'paused') { this._shell.state = 'playing'; this._fireGrace = 0.3; }
    else if (this._shell.state === 'playing') this._shell.state = 'paused';
    else if (this._shell.state === 'shop') this._shopBuy();
    else if (this._shell.state === 'drydock') this._shell._dryDockAct();
  }

  get weapon() { return this.inSub ? 'net' : this.weapons[this.weaponIdx]; }

  _cycleWeapon(dir) {
    if (this.inSub) return;   // the sub carries only the net — no switching
    if (this.weapons.length < 2) return;
    this.weaponIdx = (this.weaponIdx + dir + this.weapons.length) % this.weapons.length;
    this.weaponSwapT = 1.2;   // brief HUD flash of the new weapon name
    this.audio.select();
  }

  fire() {
    if (this._shell.state !== 'playing') return;
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

  _acquireAimTarget(engaged) {
    if (!engaged || this.aimLevel < AIM.unlockLevel) return null;
    return this._nearestThreat();
  }

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

  update(dt) {
    W = WORLD.W; H = WORLD.H;   // live viewport (setViewport mutates WORLD)
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.bankPulse = Math.max(0, this.bankPulse - dt * 2);
    this.zoneFade = Math.max(0, this.zoneFade - dt * 1.2);
    this.oneUpT = Math.max(0, this.oneUpT - dt);
    this.puT = Math.max(0, this.puT - dt);
    // Drain the flourish queue: load the next toast once the current one clears.
    if (this.puT <= 0 && this.toastQueue && this.toastQueue.length) {
      const t = this.toastQueue.shift(); this.puName = t.name; this.puCol = t.col; this.puT = t.dur;
    }
    this.reentryT = Math.max(0, (this.reentryT || 0) - dt);

    this.input.poll();   // gamepad
    this._shell._autoDetectScheme();   // pad plugged in → pad prompts (until picked manually)
    this._shell._syncTouchButtons();   // on-screen buttons for touch play
    // Gamepad confirm/start advances menus / resumes (fire handles it in-play).
    const startEdge = this.input.consumeStart();
    const cycleControls = this.input.pressed('controls') || this.input.consumeButton('controls');

    // Help screen: page through, cycle the control legend, then close.
    // Meta screens (help/Trophy Wall/dry-dock) are shell-owned: the shell holds
    // their screen-state (helpPage/bdPage/ddSel) + HELP_PAGES, so the reef routes
    // their per-frame input to the shell and just brackets the frame.
    if (this._shell.state === 'help') { this._shell._updateHelp(startEdge, cycleControls); this.input.endFrame(); return; }
    // Open help from the menu, pause or game-over screens (H or the ? button).
    if (this._shell.state !== 'playing' && (this.input.pressed('help') || this.input.consumeButton('help'))) { this._shell._openHelp(this._shell.state); this.input.endFrame(); return; }

    // Trophy Wall: a read-only overlay off the menu/game-over — any key closes it.
    if (this._shell.state === 'badges') { this._shell._updateBadges(startEdge); this.input.endFrame(); return; }
    if ((this._shell.state === 'menu' || this._shell.state === 'gameover') && (this.input.pressed('badges') || this.input.consumeButton('badges'))) { this._shell._openBadges(this._shell.state); this.input.endFrame(); return; }

    // About / versions overlay: read-only, opened by the menu's corner link.
    if (this._shell.state === 'about') { this._shell._updateAbout(startEdge); this.input.endFrame(); return; }
    if (this._shell.state === 'menu' && this.input.consumeButton('about')) { this._shell._openAbout('menu'); this.input.endFrame(); return; }

    // Open the Dry Dock from the menu or game-over screen (R or the 🛠 button).
    if ((this._shell.state === 'menu' || this._shell.state === 'gameover') && (this.input.pressed('drydock') || this.input.consumeButton('drydock'))) { this._shell._openDryDock(this._shell.state); this.input.endFrame(); return; }

    // Launch Salvage Match (the first NEW minigame) from the menu/game-over via
    // the Core stack (N or the ⚓ button). host.open pushes it over this reef.
    if ((this._shell.state === 'menu' || this._shell.state === 'gameover') && (this.input.pressed('match3') || this.input.consumeButton('match3'))) { this.host.open('match3'); this.input.endFrame(); return; }

    // Change the on-screen control legend (C / a menu tap; ← → on the menus).
    if (cycleControls) this._shell._cycleScheme();
    else if ((this._shell.state === 'menu' || this._shell.state === 'gameover') && (this.input.pressed('right') || this.input.consumeButton('schemeNext'))) this._shell._cycleScheme();
    else if ((this._shell.state === 'menu' || this._shell.state === 'gameover') && this.input.pressed('left')) this._shell._setScheme(prevScheme(this._shell.controlScheme));
    // Reef-skip 'START AT' selector (↑ ↓ on the menus, or its tap target).
    if ((this._shell.state === 'menu' || this._shell.state === 'gameover') &&
        (this.input.pressed('up') || this.input.pressed('down') || this.input.consumeButton('skipNext'))) this._shell._cycleStartReef();

    if (this.input.pressed('pause') || this.input.consumeButton('pause')) { if (this._shell.state === 'shop') this._closeShop(); else if (this._shell.state === 'drydock') this._shell._closeDryDock(); else this.onAction(); }
    if (this.input.pressed('mute') || this.input.consumeButton('mute')) { this.audio.ensure(); this.muted = this.audio.toggleMute(); }

    // Shop: a frozen overlay while docked — navigate, buy, then close.
    if (this._shell.state === 'shop') {
      if (startEdge) this._shopBuy();
      if (this.input.pressed('up')) this._shopMove(-1);
      if (this.input.pressed('down')) this._shopMove(1);
      const items = this._shopItems();
      for (let i = 0; i < items.length; i++) if (this.input.consumeButton('shop' + i)) { this.shopSel = i; this._shopBuy(); break; }
      this.shopDeny = Math.max(0, this.shopDeny - dt);
      this.input.endFrame(); return;
    }
    // Dry Dock: a frozen overlay off the menu/game-over — navigate, buy/equip, close.
    if (this._shell.state === 'drydock') { this._shell._updateDryDock(dt, startEdge); this.input.endFrame(); return; }
    if (startEdge && this._shell.state !== 'playing') { this.audio.ensure(); this.audio.resume(); this.onAction(); }

    // Sailing to a new reef: brief transition, then a fresh cave.
    if (this._shell.state === 'sailing') {
      this.sailT += dt;
      if (this.sailT > 1.8) this._newReef();
      this.input.endFrame(); return;
    }
    if (this._shell.state !== 'playing') { this.input.endFrame(); return; }
    this.runTime += dt;   // lifetime dive-time accrues only while actually diving
    if (this.zone === 'stage') { this._stage.update(dt); this.input.endFrame(); return; }
    if (this.zone === 'whirlpool') { this._whirl.update(dt); this.input.endFrame(); return; }
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
    for (const id in this.buffT) this.buffT[id] = Math.max(0, this.buffT[id] - dt);   // consumable buffs count down (spent on death via start())
    if (this.zone === 'abyss') this._updateExtraction(dt);   // The Deep's escape countdown
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

    const finsMult = this.buffT.fins > 0 ? CONSUMABLE_BY_ID.fins.swimMult : 1;   // Turbo Fins consumable
    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y), (this.speedT > 0 ? POWERUP.speedMult : 1) * this._relicSwimMult * finsMult, this.inSub ? SUB : DIVER);

    if (this.aiming) {
      // Swing the reticle onto the target — but do NOT fire here; release fires.
      const ta = Math.atan2(threat.y - this.diver.y, threat.x - this.diver.x);
      const rate = AIM.aimRateBase + AIM.aimRatePerLevel * (this.aimLevel - AIM.unlockLevel);
      this.aimAngle = this._angleToward(this.aimAngle, ta, rate * dt);
      this.diver.aimX = Math.cos(this.aimAngle); this.diver.aimY = Math.sin(this.aimAngle);
      // Once the reticle swings within lock tolerance, COMMIT to this target: a
      // release now fires STRAIGHT AT IT (independent of any residual swing lag).
      if (Math.abs(this._angleDiff(this.aimAngle, ta)) < AIM.lockTol) this._aimLock = threat;
    } else if (!(released && this._prevAiming)) {
      // Sync the reticle to facing — except on the frame we release out of an aim.
      this.aimAngle = Math.atan2(this.diver.aimY, this.diver.aimX);
    }
    // Release fires ONE shot. If a target was LOCKED during the hold, snap the
    // shot straight at it — the fix for 'release fires straight, not at the
    // target'. Otherwise (quick tap, or released before lock) fire along the
    // reticle/facing. `!graced` swallows the zone/game-entry press.
    if (released && !graced) {
      const tgt = this._aimLock;
      if (tgt && !tgt.dead) {
        const a = Math.atan2(tgt.y - this.diver.y, tgt.x - this.diver.x);
        this.diver.aimX = Math.cos(a); this.diver.aimY = Math.sin(a);
      } else {
        this.diver.aimX = Math.cos(this.aimAngle); this.diver.aimY = Math.sin(this.aimAngle);
      }
      this.fire();
    }
    if (!holding) this._aimLock = null;   // clear the lock for the next hold
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
      // Sealed Wetsuit consumable eases air drain; a lapsed extraction countdown
      // (The Deep) spikes it. Both fold into the same per-frame drain multiplier.
      const suitMult = this.buffT.suit > 0 ? CONSUMABLE_BY_ID.suit.airMult : 1;
      const lapseMult = this.extractLapsed ? ABYSS.extractLapseMult : 1;
      this.air -= (AIR.drainPerSec + this.diver.y * AIR.drainDepthFactor) * oxyMult * suitMult * lapseMult * dt;
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
    if (this.chestGuardian) {
      this.chestGuardian.update(dt, this.t, this.diver, this.specialChest);
      if (!this.chestGuardian.dead && this.chestGuardian.hp > 0 && this.diver.invuln <= 0 && this.chestGuardian.hits(this.diver)) this._hit();
    }
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
    if (this.magnetT > 0 || this._relicMagnet || this.buffT.lantern > 0) {
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
      // The nested zone modules' enter() takes a reef ENTRANCE (portal), not a Host
      // — they are reef-driven, not Core-booted (see each module's header). The cast
      // documents that intentional divergence from the MiniGame.enter(host) contract.
      for (const e of this.stageEntrances) { if (this.reentryT <= 0 && e.contains(d)) { this._stage.enter(/** @type {any} */ (e)); this.input.endFrame(); return; } }
      if (this.reentryT <= 0 && this.abyssEntrance &&
          Math.hypot(d.x - this.abyssEntrance.x, d.y - this.abyssEntrance.y) < this.abyssEntrance.r + d.radius) {
        this._enterAbyss(this.abyssEntrance); this.input.endFrame(); return;   // board the sub (free)
      }
      if (this.reentryT <= 0 && this.whirlEntrance && Math.hypot(d.x - this.whirlEntrance.x, d.y - this.whirlEntrance.y) < this.whirlEntrance.r + d.radius) {
        this._whirl.enter(/** @type {any} */ (this.whirlEntrance)); this.input.endFrame(); return;
      }
    } else if (this.zone === 'belly' && this.whaleExit) {
      const e = this.whaleExit;
      if (Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) { this._exitWhale(); this.input.endFrame(); return; }
    } else if (this.zone === 'abyss') {
      for (const e of this.abyssExits) {
        if (Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) {
          let bonus = e.bonus || 0, msg = `SURFACED · +${bonus}⚙`;
          // Beat the extraction countdown → a time-scaled Salvage bonus on top.
          if (this.extractActive && !this.extractLapsed) {
            const eb = Math.round(ABYSS.extractBonusBase * (this.extractT / ABYSS.extractSecs));
            if (eb > 0) { bonus += eb; msg = `EXTRACTED! · +${bonus}⚙  (⏱ +${eb})`; }
          }
          if (bonus) { this.meta.salvage += bonus; saveSalvage(this.meta); this.puName = msg; this.puCol = PAL.gateGlow; this.puT = 2.4; }
          this._exitAbyss(); this.input.endFrame(); return;
        }
      }
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
    for (const cr of this.creatures) if (cr.dead) {   // run kill tally (for badges)
      this.kills++;
      if (cr.constructor && cr.constructor.name === 'Shark') this.runSharkKills++;
    }
    this.creatures = this.creatures.filter((cr) => !cr.dead);
    this.harpoons = this.harpoons.filter((h) => !h.dead);
    this.nets = this.nets.filter((n) => !n.dead);
    this.charges = this.charges.filter((c) => !c.dead);
    this.bigBubbles = this.bigBubbles.filter((b) => !b.dead);
    this.krakens = this.krakens.filter((k) => !k.dead);
    if (this.chestGuardian && this.chestGuardian.dead) this.chestGuardian = null;
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
        if (this.zone === 'abyss') this._tripExtraction();   // first loot grab arms the escape timer
      }
    }
    // Treasure-sweep bonus: cross 80/90/100% of the reef's loose treasure and
    // bank a chunk of Salvage (once each) — rewards a thorough clean-out.
    if (this.zone === 'reef' && this._reefTreasureTotal > 0 && this._collectTier < COLLECT_BONUS.length) {
      let taken = 0; for (const tr of this.treasures) if (tr.taken) taken++;
      const frac = taken / this._reefTreasureTotal;
      while (this._collectTier < COLLECT_BONUS.length && frac >= COLLECT_BONUS[this._collectTier][0]) {
        const [f, sv] = COLLECT_BONUS[this._collectTier];
        this.meta.salvage += sv; saveSalvage(this.meta);
        this.puName = `${Math.round(f * 100)}% TREASURE SWEEP · +${sv}⚙`; this.puCol = PAL.gold; this.puT = 2.4; this.audio.bank();
        this._collectTier++;
      }
      if (this._collectTier >= COLLECT_BONUS.length) this.didCleanSweep = true;   // 100% swept a reef (badge)
    }
    // Shells (clams & chests): grab loot while open, get bitten when they shut.
    for (const s of this.shells) {
      if (s.canTakeLoot(d)) {
        const val = s.takeLoot(); this.carried += val;
        this.particles.sparkle(s.x, s.y, s.lootColor, s.salvage ? 42 : 24);
        if (s.salvage) {   // the giant clam's golden pearl: score+gold AND Salvage
          this.meta.salvage += s.salvage; saveSalvage(this.meta);
          this.puName = `GOLDEN PEARL · +${val} · +${s.salvage}⚙`; this.puCol = PAL.gold; this.puT = 2.6;
          this.audio.blackpearl();
        } else {
          this.audio.pearl();
        }
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
      // Harpoon vs the chest guardian — chip it; killing it opens the chest.
      const g = this.chestGuardian;
      if (!h.dead && g && g.hp > 0 && g.harpoonHit(h)) {
        h.dead = true; g.takeDamage(1);
        this.score += KRAKEN.hitPoints;
        const tip = h.tip(); this.particles.sparkle(tip.x, tip.y, PAL.krakenEye, 16); this.audio.kill();
        if (g.hp === 0) this._openSpecialChest(g);
      }
    }
    // Nets snare the first creature they touch (crowd control, not a kill).
    for (const n of this.nets) {
      if (n.dead) continue;
      for (const cr of this.creatures) {
        if (!cr.dead && cr.snareT <= 0 && !cr.netImmune && n.hits(cr)) {
          cr.snareT = NET.snare + (this.weaponLevel.net - 1) * 1.5; n.dead = true;
          this.runNetted++;   // lifetime "beasts netted" tally
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
    const eg = this.chestGuardian;
    if (eg && eg.hp > 0 && Math.hypot(eg.x - ch.x, eg.y - ch.y) < R + eg.radius) {
      eg.takeDamage(2); this.score += KRAKEN.hitPoints * 2;
      if (eg.hp === 0) this._openSpecialChest(eg);
    }
  }

  // The guardian just died — reward the kill and unseal the chest.
  _openSpecialChest(g) {
    this.score += GUARDIAN.killBonus;
    this.shake = 16; this.flash = 0.6;
    this.particles.sparkle(g.x, g.y, PAL.gold, 40); this.audio.bank();
    this.runGuardiansFelled++;
    if (this.specialChest) this.specialChest.opened = true;
    this._enqueueToast('🗝 THE CHEST OPENS!', PAL.gold || PAL.key, 2.4);
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
    // The sub's hull soaks several contact hits (no life/loot lost) while armor
    // remains. When it's spent, the next hit BREACHES the hull: the diver is
    // ejected from the trench and the un-banked trench haul is lost — the only
    // way to keep it is to leave through an exit hatch.
    if (this.inSub) {
      if (this.subArmor > 0) {
        this.subArmor -= 1; this.flash = 1; this.shake = 10; this.audio.hit();
        this.puName = this.subArmor > 0 ? `🛡 HULL HIT — armor ${this.subArmor}/${SUB.armor}` : '⚠ HULL BREACHING — one more hit ejects you!';
        this.puCol = this.subArmor > 0 ? PAL.air : PAL.danger; this.puT = 1.4;
        return;
      }
      this._ejectFromAbyss();
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
    this.tookDamage = true;   // any life lost disqualifies the Untouchable badge
    this.lives -= GAME.hitCost;
    if (this.lives <= 0) { this.deathCause = cause; this._gameOver(); return; }
    this.air = Math.max(this.air, this._relicSecondWind ? 60 : 35);
    this.diver.invuln = GAME.invulnAfterHit;
    this.diver.y = Math.max(WORLD.SURFACE + 40, this.diver.y - 70);
  }

  _gameOver() {
    if (this._shell.state === 'gameover') return;   // re-entrancy guard: a same-frame
    // second death (e.g. air runs out AND a creature touches you) must not award
    // the Salvage payout twice — the payout is a non-idempotent side effect.
    this._shell.state = 'gameover';
    this.audio.gasp();
    if (this.score > this._shell.hi) {
      this._shell.hi = this.score; this._shell.hiReef = this.reef; this.newHi = true;
      this._shell.saveHi();
    } else this.newHi = false;
    this.lastPayout = runPayout({ deepestReef: this.reef, bosses: this.bossesFelled, relicsBanked: this.relicsBanked });
    this.meta.salvage += this.lastPayout;
    // Tick equipped relic rentals down one dive; any that lapse are auto-benched.
    this.lapsedRentals = tickEquippedRentals(this.meta);
    saveSalvage(this.meta);
    // Award any newly-earned achievement badges from this run's summary.
    if (this.badgeState) {
      this.newBadges = awardBadges(this.badgeState, this._runStats());
      if (this.newBadges.length) {
        saveBadges(this.badgeState);
        // Mirror each freshly-earned badge to Steam (no-op on the web build).
        for (const id of this.newBadges) unlockAchievement(id);
      }
    }
    // Fold this run into the lifetime counters, then award any progressive tiers
    // it just crossed (see meta/stats.js + meta/progressive.js).
    if (this.statState && this.progressState) {
      addRun(this.statState, this._runDelta());
      saveStats(this.statState);
      const freshTiers = awardProgress(this.progressState, this.statState);
      if (freshTiers.length) {
        saveProgress(this.progressState);
        for (const id of freshTiers) unlockAchievement(id);
        this.newTiers = freshTiers.map((id) => tierNameById(id)).filter(Boolean);
      }
    }
  }

  _runDelta() {
    return {
      sharkKills: this.runSharkKills,
      metersDived: Math.round(this.depthReached / 10),
      diveSeconds: this.runTime,
      subLoot: this.runSubLoot,
      netted: this.runNetted,
      dives: 1,
      salvageEarned: (this.lastPayout || 0) + this.blackPearlsBanked * SALVAGE.perPearl,
      pearlsBanked: this.blackPearlsBanked,
      bossesFelled: this.bossesFelled,
      careerScore: this.score,
    };
  }

  _runStats() {
    return {
      won: this.won, cause: this.deathCause, reef: this.reef, depth: this.depthReached,
      score: this.score, kills: this.kills, spawned: this.creaturesSpawned,
      bosses: this.bossesFelled, pearls: this.blackPearlsBanked,
      cleanSweep: this.didCleanSweep, tookDamage: this.tookDamage,
    };
  }

  _win() {
    this.score += Math.round(this.air) * 5 + this.lives * 500;
    this.won = true;
    this._gameOver();
  }

  _setSail() {
    this._shell.state = 'sailing'; this.sailT = 0; this.reef += 1; this.dockHold = 0;
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
    this._shell.state = 'playing';
    this.audio.bank();
  }

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
    this.whaleExit = null; this.templeExit = null; this.abyssExits = []; this.door = null; this.key = null; this.hasKey = false; this.columns = [];
    // (whirl* gameplay state is owned + reset by the whirlpool MiniGame's exit(), not here)
    this._placeDiver(s.returnX, s.returnY, 0);
    // Surfacing from any special level tops the tank up by up to half — a breather
    // reward for making it out (and softens the deep-zone air tax on the way back).
    this.air = Math.min(this.airMax, this.air + this.airMax * GAME.exitAirRefillFrac);
    this.savedReef = null; this.zoneFade = 1;
    this.reentryT = 1.5;   // grace so we don't immediately re-enter what we just left
    this.audio.bank();
  }

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

  _exitWhale() {
    this._restoreReef();
    this.whales = this.whales.filter((w) => w !== this._enteredWhale);
    this._enteredWhale = null;
  }

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

  _exitTemple() { this._restoreReef(); this.templeGate = null; }

  _enterAbyss(entrance) {
    this._snapshotReef(entrance.x, entrance.y + 50);
    this.zone = 'abyss';
    this._generateAbyss();
    // Board the sub and drop in at a RANDOM safe open cell — you pilot the dark
    // trench by headlight to find one of the exit hatches. inSub is always on
    // here now (the sub IS the entrance); the hull armor soaks several hits.
    const c = this.cave.randomOpen(OPEN_BAND + 200) || { x: WW / 2, y: WH * 0.62 };
    this._placeDiver(c.x, c.y, 0);
    this.inSub = true; this.subArmor = SUB.armor;
    // Remember the haul on entry: leaving via a hatch keeps whatever you gather
    // in the trench, but a hull breach ejects you and forfeits the trench gains.
    this._abyssEntryCarried = this.carried; this._abyssEntryPearls = this.carriedPearls;
    this.extractActive = false; this.extractT = 0; this.extractLapsed = false;   // arm the kicker fresh
    this.shake = 8; this.zoneFade = 1;
    this.audio.select();
  }

  _exitAbyss() {
    // "Loot gathered with sub" = the trench haul carried out. On a hatch exit
    // carried holds the haul; on an eject _ejectFromAbyss has already reset
    // carried to the entry value, so this contributes nothing (loot forfeited).
    this.runSubLoot += Math.max(0, this.carried - (this._abyssEntryCarried || 0));
    this._restoreReef(); this.abyssEntrance = null; this.inSub = false; this.subArmor = 0;
  }

  _ejectFromAbyss() {
    this.carried = this._abyssEntryCarried || 0;
    this.carriedPearls = this._abyssEntryPearls || 0;
    this.flash = 1; this.shake = 18; this.audio.gasp();
    this.puName = '💥 HULL DESTROYED — ejected, trench haul lost!'; this.puCol = PAL.danger; this.puT = 2.8;
    this._exitAbyss();
  }

  _nearestExit() {
    let best = null, bd = Infinity;
    for (const e of this.abyssExits) { const dd = Math.hypot(this.diver.x - e.x, this.diver.y - e.y); if (dd < bd) { bd = dd; best = e; } }
    return best;
  }

  _tripExtraction() {
    if (this.zone !== 'abyss' || this.extractActive) return;
    this.extractActive = true; this.extractT = ABYSS.extractSecs; this.extractLapsed = false;
    this.puName = `⏱ TRENCH DESTABILISING — reach an exit in ${ABYSS.extractSecs}s!`; this.puCol = PAL.danger; this.puT = 3; this.shake = 10;
    this.audio.gasp();
  }

  _updateExtraction(dt) {
    if (!this.extractActive || this.extractLapsed) return;
    this.extractT -= dt;
    if (this.extractT <= 0) {
      this.extractT = 0; this.extractLapsed = true;
      this.puName = '⚠ EXTRACTION FAILED — air venting fast!'; this.puCol = PAL.danger; this.puT = 3; this.shake = 14;
      this.audio.gasp();
    }
  }

  _placeDiver(x, y, vx) {
    // The DiverWorld engine owns diver + camera (Phase 3); delegate to its one
    // authoritative placeDiver when present. Fallback keeps the original body for
    // bare construction (no engine).
    if (this._world) { this._world.placeDiver(x, y, vx); return; }
    const d = this.diver;
    d.x = x; d.y = y; d.vx = vx; d.vy = 0; d.invuln = 1.6;
    this.camX = Math.max(0, Math.min(WW - W, x - W / 2));
    this.camY = Math.max(0, Math.min(WH - H, y - H / 2));
  }

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

  render(_ctx) {
    W = WORLD.W; H = WORLD.H;   // live viewport (setViewport mutates WORLD)
    if (this._shell.state === 'sailing') { this._sailScreen(); return; }
    if (this.zone === 'stage') { this._stage.render(this.ctx); return; }
    if (this.zone === 'whirlpool') { this._whirl.render(this.ctx); return; }
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const cx = this.camX, cy = this.camY;
    const depthT = Math.min(1, cy / WH);
    // Distant shoals + sunken-wreck silhouettes only in the open-ocean reef;
    // enclosed zones (belly/temple/abyss) draw their own backdrops over this.
    this.bg.draw(ctx, cx, cy, this.t, depthT, { reef: this.zone === 'reef' });
    // Faint theme tint so each reef has its own mood.
    if (this.zone === 'reef' && this._shell.state !== 'menu' && this.reefTheme) {
      const [tr, tg, tb] = this.reefTheme.tint;
      ctx.fillStyle = `rgba(${tr},${tg},${tb},0.06)`; ctx.fillRect(0, 0, W, H);
    }
    this.boat.draw(ctx, cx, cy, this.t);

    if (this._shell.state !== 'menu' && this.cave) {
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
        // The entrance IS a submarine resting on the deep floor — swim up to it to
        // board and pilot it down into The Deep. Bobs gently; a soft glow marks it.
        const sx = this.abyssEntrance.x - cx, sy = this.abyssEntrance.y - cy + Math.sin(this.t * 2) * 3;
        ctx.save();
        const gl = ctx.createRadialGradient(sx, sy, 6, sx, sy, 64);
        gl.addColorStop(0, 'rgba(120,225,255,0.22)'); gl.addColorStop(1, 'rgba(120,225,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, sy, 64, 0, Math.PI * 2); ctx.fill();
        ctx.translate(sx, sy); ctx.scale(2.1, 2.1); drawSub(ctx, 0, 0, 1); ctx.restore();
      }
      if (this.whirlEntrance) { ctx.save(); ctx.translate(this.whirlEntrance.x - cx, this.whirlEntrance.y - cy); drawWhirlMaw(ctx, this.t, this.whirlEntrance.r); ctx.restore(); }
      if (this.door) { ctx.save(); ctx.translate(this.door.x + this.door.w / 2 - cx, this.door.y + this.door.h / 2 - cy); drawDoor(ctx, this.door.open, this.door.w, this.door.h); ctx.restore(); }
      if (this.key && !this.key.taken) { ctx.save(); ctx.translate(this.key.x - cx, this.key.y - cy); drawKey(ctx, this.t); ctx.restore(); }
      if (this.templeExit) { ctx.save(); ctx.translate(this.templeExit.x - cx, this.templeExit.y - cy); drawTempleGate(ctx, this.t, this.templeExit.r); ctx.restore(); }
      for (const e of this.abyssExits) { ctx.save(); ctx.translate(e.x - cx, e.y - cy); drawAbyssMaw(ctx, this.t, e.r); ctx.restore(); }
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
    // In the sub, the diver rides INSIDE the vessel: draw the sub (pilot shows
    // through its porthole) and skip the free-swimming diver sprite entirely.
    if (this._shell.state !== 'menu' && this.inSub) drawSub(ctx, this.diver.x - cx, this.diver.y - cy, this.diver.facing);
    else if (this._shell.state !== 'menu') this.diver.draw(ctx, cx, cy, this.aiming, this.aimAngle);
    if (this.zone === 'abyss') this._subLighting(ctx, cx, cy);   // dark trench + headlights
    // Shield bubble (blinks as it runs out).
    if (this.shieldT > 0 && this._shell.state !== 'menu') {
      const a = this.shieldT < 1.5 && Math.floor(this.shieldT * 8) % 2 ? 0.15 : 0.42;
      const sx = this.diver.x - cx, sy = this.diver.y - cy;
      ctx.save();
      ctx.strokeStyle = `rgba(143,230,255,${a})`; ctx.lineWidth = 3;
      ctx.fillStyle = `rgba(143,230,255,${a * 0.22})`;
      ctx.beginPath(); ctx.arc(sx, sy, this.diver.radius + 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // Shock rod: jagged lightning bolts arcing diver → target → target.
    if (this.shockT > 0 && this.shockBolts && this.shockBolts.length && this._shell.state !== 'menu') {
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
    if (this.aiming && this.aimTarget && this._shell.state === 'playing') {
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
    if (this._shell.state !== 'menu' && this.darkZones && this.darkZones.length) {
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
    if (this._shell.state !== 'menu') {
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

    if (this._shell.state === 'playing' || this._shell.state === 'paused') this._hud();
    if ((this._shell.state === 'playing' || this._shell.state === 'paused') && this.weaponSwapT > 0) this._weaponCarousel();
    if (this._shell.state === 'menu') this._shell._menu();
    if (this._shell.state === 'paused') this._overlay('PAUSED', (this.input.isTouch ? 'Tap ▶ to resume' : 'Press P / click to resume') + '   ·   H for help');
    if (this._shell.state === 'shop') this._shopScreen();
    if (this._shell.state === 'drydock') this._shell._dryDockScreen();
    if (this._shell.state === 'help') this._shell._helpScreen();
    if (this._shell.state === 'badges') this._shell._badgesScreen();
    if (this._shell.state === 'about') this._shell._aboutScreen();
    if (this._shell.state === 'gameover') this._shell._gameOverScreen();
  }

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
    // Consumable buffs: long timers, shown as m:ss (a bought gear icon, not a pickup).
    for (const c of CONSUMABLE) {
      if ((this.buffT[c.id] || 0) > 0) {
        this._text(`${c.glyph} ${this._mmss(this.buffT[c.id])}`, buffX, by + bh + 22, 12, PAL.gold, 'left', 'middle', true);
        buffX += this.ctx.measureText(`${c.glyph} ${this._mmss(this.buffT[c.id])}`).width + 14;
      }
    }

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
      if (this.inSub) {
        const breached = this.subArmor <= 0;
        this._text(`🛥 HULL ${'▮'.repeat(this.subArmor)}${'▯'.repeat(Math.max(0, SUB.armor - this.subArmor))}`, W - 20, 102, 12, breached ? PAL.danger : PAL.air, 'right', 'top');
      } else {
        this._text('⚠ 150% AIR', W - 20, 102, 12, PAL.danger, 'right', 'top');
      }
    }
    this._text(`HI ${this._shell.hi}`, W / 2, 22, 14, '#bfe6ff', 'center', 'top');
    if (this.muted) this._text('MUTED', W / 2, 42, 11, '#ff9a6b', 'center', 'top');
    // The Deep's extraction countdown — a loud centre banner once armed.
    if (this.zone === 'abyss' && this.extractActive) {
      const urgent = this.extractLapsed || this.extractT <= 10;
      const blink = urgent && Math.floor(this.t * 6) % 2 === 0;
      const col = this.extractLapsed ? PAL.danger : (blink ? '#ff3b30' : (urgent ? PAL.danger : PAL.gold));
      const label = this.extractLapsed ? '⚠ EXTRACTION FAILED — SURFACE NOW' : `⏱ EXTRACT  ${this._mmss(this.extractT)}`;
      this._text(label, W / 2, 60, 18, col, 'center', 'top', true);
    }

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
        this._text('🛥 A submarine — swim into it to board and dive The Deep (a dark trench of rich loot)', W / 2, H - 30, 14, PAL.abyssRim, 'center', 'middle');
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
    else if (this.zone === 'abyss' && this.abyssExits.length) { const e = this._nearestExit(); if (e) this._exitLocator(e.x, e.y, 'EXIT'); }

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
    if (this._shell._touchBtns) for (const b of this._shell._touchBtns) this._shell._touchBtn(b);
    ctx.restore();
  }

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

  _subLighting(ctx, cx, cy) {
    const dc = this._subDark || (this._subDark = document.createElement('canvas'));
    if (dc.width !== W || dc.height !== H) { dc.width = W; dc.height = H; }
    const g = dc.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = `rgba(1,3,9,${SUB.darkAlpha})`; g.fillRect(0, 0, W, H);
    const sx = this.diver.x - cx, sy = this.diver.y - cy;
    g.globalCompositeOperation = 'destination-out';
    // A big, SOFT halo: light bleeds far into the dark with a long gentle tail so
    // the trench glows around the hull rather than cutting off at a hard rim.
    const halo = g.createRadialGradient(sx, sy, 3, sx, sy, SUB.halo);
    halo.addColorStop(0, 'rgba(0,0,0,0.55)'); halo.addColorStop(0.5, 'rgba(0,0,0,0.22)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(sx, sy, SUB.halo, 0, Math.PI * 2); g.fill();
    // The bright core bubble the sub sits inside, fully clearing the dark up close.
    const amb = g.createRadialGradient(sx, sy, 3, sx, sy, SUB.ambient);
    amb.addColorStop(0, 'rgba(0,0,0,1)'); amb.addColorStop(0.62, 'rgba(0,0,0,0.9)'); amb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = amb; g.beginPath(); g.arc(sx, sy, SUB.ambient, 0, Math.PI * 2); g.fill();
    const moving = Math.hypot(this.diver.vx, this.diver.vy) > 12;
    const fwd = moving ? Math.atan2(this.diver.vy, this.diver.vx) : (this.diver.facing >= 0 ? 0 : Math.PI);
    const cone = (ang, range, half) => {
      g.save();
      g.beginPath(); g.moveTo(sx, sy); g.arc(sx, sy, range, ang - half, ang + half); g.closePath(); g.clip();
      const rg = g.createRadialGradient(sx, sy, 4, sx, sy, range);
      rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.72, 'rgba(0,0,0,0.8)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(sx - range, sy - range, range * 2, range * 2);
      g.restore();
    };
    cone(fwd, SUB.coneRange, SUB.coneHalfAngle);                       // forward beam
    cone(Math.PI / 2, SUB.coneRange * 0.7, SUB.coneHalfAngle * 0.9);   // downward beam
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(dc, 0, 0);
    // A faint warm tint inside the forward beam so it reads as headlights.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, SUB.coneRange, fwd - SUB.coneHalfAngle, fwd + SUB.coneHalfAngle); ctx.closePath();
    const wg = ctx.createRadialGradient(sx, sy, 6, sx, sy, SUB.coneRange);
    wg.addColorStop(0, 'rgba(200,225,255,0.12)'); wg.addColorStop(1, 'rgba(200,225,255,0)');
    ctx.fillStyle = wg; ctx.fill();
    // A warm additive bloom around the hull itself — the halo glow the sub casts.
    const bloom = ctx.createRadialGradient(sx, sy, 4, sx, sy, SUB.halo);
    bloom.addColorStop(0, `rgba(180,215,255,${SUB.glowWarm})`);
    bloom.addColorStop(0.4, `rgba(150,195,240,${SUB.glowWarm * 0.4})`);
    bloom.addColorStop(1, 'rgba(150,195,240,0)');
    ctx.beginPath(); ctx.arc(sx, sy, SUB.halo, 0, Math.PI * 2); ctx.fillStyle = bloom; ctx.fill();
    ctx.restore();
  }

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
    // Has the diver revealed the cell at a world point? The Prospector's Chart
    // reveals a wider radius, so it naturally surfaces more vents/bells below.
    const revealed = (x, y) => !!C.seen[Math.floor(y / CELL) * C.GW + Math.floor(x / CELL)];
    // Air vents — the map's most useful landmark: a cyan ring at every DISCOVERED
    // vent, in every cave zone, so you can always find your way back to air.
    for (const v of this.vents) {
      if (!revealed(v.x, v.y)) continue;
      ctx.strokeStyle = PAL.air; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(wx(v.x), wy(v.y), 2.1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(95,224,200,0.5)'; ctx.beginPath(); ctx.arc(wx(v.x), wy(v.y), 1, 0, Math.PI * 2); ctx.fill();
    }
    // boat + relic markers (reef only, relic once seen)
    if (this.zone === 'reef') {
      ctx.fillStyle = '#e07a4a'; ctx.fillRect(wx(this.boat.x) - 2, wy(WORLD.SURFACE) - 1, 4, 3);
      // dive bells — banking checkpoints, shown once DISCOVERED (their area revealed)
      for (const b of this.bells) {
        if (!revealed(b.x, b.y)) continue;
        ctx.fillStyle = PAL.bell; ctx.beginPath(); ctx.arc(wx(b.x), wy(b.y), 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#04121f'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (this.relic && !this.relic.taken) {
        const rgx = Math.floor(this.relic.x / CELL), rgy = Math.floor(this.relic.y / CELL);
        if (C.seen[rgy * C.GW + rgx]) { ctx.fillStyle = PAL.key; ctx.beginPath(); ctx.arc(wx(this.relic.x), wy(this.relic.y), 2.6, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // exit markers in the special zones (fixed, known locations — always shown)
    const exits = this.zone === 'temple' ? (this.templeExit ? [this.templeExit] : [])
      : this.zone === 'belly' ? (this.whaleExit ? [this.whaleExit] : [])
      : this.zone === 'abyss' ? this.abyssExits : [];
    for (const exit of exits) {
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

  // Canvas-chrome primitives now live in render/chrome.js (Phase 7 dedup) — these
  // stay as thin forwarders so every this._text(...) call-site is byte-identical.
  _mmss(secs) { return mmss(secs); }
  _key(action) { return ctrlPrompt(this._shell.controlScheme, action); }
  _overlay(title, sub) { overlay(this.ctx, title, sub); }
  _panel(alpha = 0.55) { panel(this.ctx, alpha); }
  _keycap(label, x, y) { keycap(this.ctx, label, x, y); }
  _text(str, x, y, size, color, align = 'left', base = 'alphabetic', bold = false) {
    text(this.ctx, str, x, y, size, color, align, base, bold);
  }
}
