// Game orchestration: state machine, 2D world generation, 2D camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, GAME, CAVE, HARPOON, SHARK, SHELL, BUBBLE, PAL } from './config.js';
import { Diver } from './entities/diver.js';
import { Boat } from './entities/boat.js';
import { Clam, Chest } from './entities/shell.js';
import { BigBubble } from './entities/bigbubble.js';
import { Treasure } from './entities/treasure.js';
import { Shark, Octopus, Jelly, Puffer, Eel, Angler } from './entities/creatures.js';
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
import { KRAKEN, POWERUP, RELIC, GOLD, BELL, WEAPON_ORDER, WEAPON_INFO, NET, CHARGE, SHOCK, SPEARGUN, SHOP } from './config.js';
import { drawWhaleSkeleton, drawRib, drawThroat, drawTempleGate, drawKey, drawDoor, drawColumn } from './render/props.js';

const HI_KEY = 'deepdescent.hi';
const HI_REEF_KEY = 'deepdescent.hireef';
const { W, H, WW, WH, OPEN_BAND, CELL } = WORLD;

// Cartoon pop-up name + colour flashed up when a power-up is collected.
const PU_INFO = {
  tank:      { name: '+30 AIR!',         col: PAL.air },
  multifire: { name: 'TRIPLE SHOT!',     col: PAL.harpoonTip },
  shield:    { name: 'SHIELD UP!',       col: PAL.gateGlow },
  speed:     { name: 'SPEED FINS!',      col: PAL.air },
  magnet:    { name: 'TREASURE MAGNET!', col: PAL.gold },
  life:      { name: 'EXTRA LIFE!',      col: PAL.diver },
};

export class Game {
  constructor(ctx, input, audio, particles, background) {
    this.ctx = ctx; this.input = input; this.audio = audio;
    this.particles = particles; this.bg = background;
    this.state = 'menu';                 // menu | playing | paused | gameover
    this.t = 0; this.shake = 0;
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.hi = +(localStorage.getItem(HI_KEY) || 0);
    this.hiReef = +(localStorage.getItem(HI_REEF_KEY) || 1);
    this.diver = new Diver();
    this.boat = new Boat();
    this.flash = 0; this.bankPulse = 0;
    this.harpoons = []; this.nets = []; this.charges = []; this.vents = []; this.wrecks = []; this.cave = null; this.flora = null;
    this.shells = []; this.bigBubbles = []; this.skeletons = []; this.whales = []; this.currents = []; this.krakens = [];
    this.zone = 'reef'; this.ribs = []; this.whaleExit = null; this.savedReef = null;
    this.templeGate = null; this.templeExit = null; this.door = null; this.key = null; this.hasKey = false; this.columns = [];
    this.powerups = []; this.airMax = AIR.max; this.multiFireT = 0; this.bells = []; this.crates = [];
    this.relic = null; this.relicBanked = false; this.carryingRelic = false; this.reefBanked = 0; this.reefGoal = RELIC.goalBase;
    this.reef = 1; this.dockHold = 0; this.sailT = 0; this.zoneFade = 0;
    this.puT = 0; this.puName = ''; this.puCol = '#fff';   // power-up name flourish
    this.diver.reset();
  }

  // ---- lifecycle -------------------------------------------------------
  start() {
    this.state = 'playing';
    this.score = 0; this.carried = 0; this.gold = 0; this.lives = GAME.startLives; this.atBell = null;
    this.airMax = AIR.max; this.air = this.airMax; this.multiFireT = 0;
    this.shieldT = 0; this.speedT = 0; this.magnetT = 0;
    this.nextLifeScore = 5000; this.oneUpT = 0;
    this.depthReached = 0; this.fireCd = 0;
    // Weapons: harpoon owned from the start; the rest are bought at the shop.
    // weapons[] is the equippable (owned) list in cycle order; weaponIdx cycles
    // it. weaponLevel tracks per-weapon upgrade tier (1..maxWeaponLevel).
    this.owned = new Set(['harpoon']);
    this.weapons = WEAPON_ORDER.filter((w) => this.owned.has(w));
    this.weaponIdx = 0; this.weaponSwapT = 0;
    this.weaponLevel = {}; for (const w of WEAPON_ORDER) this.weaponLevel[w] = 1;
    this.tankLevel = 0; this.shopSel = 0; this.shopDeny = 0;
    this.nets = []; this.charges = []; this.burst = 0; this.burstT = 0; this.shockT = 0;
    this.puT = 0; this.puName = ''; this.reentryT = 0;
    this.won = false; this.newHi = false; this.deathCause = null;
    this.zone = 'reef'; this.savedReef = null; this.reef = 1;
    this.diver.reset();
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this._generateWorld();
    this.audio.select();
  }

  _generateWorld() {
    const C = this.cave = new Cave('reef');
    this.shells = []; this.treasures = []; this.creatures = [];
    this.vents = []; this.wrecks = []; this.harpoons = []; this.nets = []; this.charges = []; this.bigBubbles = []; this.skeletons = [];
    this.whales = []; this.ribs = []; this.whaleExit = null; this.currents = []; this.krakens = [];
    this.columns = []; this.door = null; this.key = null; this.templeExit = null; this.hasKey = false; this.powerups = []; this.bells = []; this.crates = [];
    const chestValue = (y) => 200 + Math.round((y / WH) * 400);   // 200..600 by depth

    // Clams and chests rest on cave-floor ledges, opening and closing.
    for (const f of spread(C.floors(), 34, 150)) {
      if (Math.random() < 0.62) this.shells.push(new Clam(f.x, f.y - SHELL.clamRadius * 0.35));
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
      this.shells.push(new Chest(ch.x, floorY - 66, chestValue(ch.y) + 200));
      for (let k = 0; k < 3; k++) {
        const tx = ch.x + (Math.random() - 0.5) * 200, ty = floorY - 24 - Math.random() * 60;
        if (!C.isSolid(tx, ty)) this.treasures.push(new Treasure(tx, ty, 'gem'));
      }
    }

    // Dive bells: deep refuel/bank checkpoints hanging in roomy chambers.
    let bellSpots = spread(C.chambers(WH * BELL.minDepthFrac), BELL.count, 900);
    if (!bellSpots.length) { const c = C.randomOpen(WH * 0.5); if (c) bellSpots = [c]; }
    for (const s of bellSpots) this.bells.push(new DiveBell(s.x, s.y));

    // A supply crate sometimes drifts in the reef — free gear when you reach it.
    if (Math.random() < 0.5) { const c = C.randomOpen(OPEN_BAND + 300); if (c) this.crates.push(new SupplyCrate(c.x, c.y)); }

    // Flora rooted on cave floors — lots of it, for atmosphere.
    this.flora = new Flora(spread(C.floors(), 110, 70));

    // Whale skeletons resting on the deepest floors.
    const deepFloors = C.floors().filter((f) => f.y > WH * 0.72);
    for (const s of spread(deepFloors, 3, 500)) this.skeletons.push({ x: s.x, y: s.y - 6 });

    // Creatures change with depth; density and shark size rise with the reef
    // number so later reefs stay tense even as lives accumulate.
    const nCreatures = 32 + Math.min(this.reef - 1, 12) * 2;   // 32 → 56 by reef 13
    const sizeUp = Math.min((this.reef - 1) * 0.05, 0.4);      // bigger sharks deeper into a run
    for (let i = 0; i < nCreatures; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const deep = c.y / WH, r = Math.random();
      let cr;
      if (deep < 0.30) {                       // shallow reef
        cr = r < 0.42 ? new Jelly(c.x, c.y) : r < 0.72 ? new Puffer(c.x, c.y) : new Shark(c.x, c.y, 0.7 + sizeUp + Math.random() * 0.35);
      } else if (deep < 0.62) {                // mid water
        cr = r < 0.34 ? new Octopus(c.x, c.y) : r < 0.62 ? new Shark(c.x, c.y, 1.0 + sizeUp + Math.random() * 0.4)
          : r < 0.82 ? new Puffer(c.x, c.y) : new Jelly(c.x, c.y);
      } else {                                 // the deep
        cr = r < 0.34 ? new Shark(c.x, c.y, 1.3 + sizeUp + Math.random() * 0.4) : r < 0.64 ? new Eel(c.x, c.y) : new Angler(c.x, c.y);
      }
      this.creatures.push(cr);
    }

    // Water currents sweep through a few spots — mostly sideways, one downdraft.
    this._makeCurrents(5);

    // At most one special encounter per reef, and only sometimes — so each dive
    // feels different: a whale, a kraken, a temple gate, or just a plain reef.
    this.templeGate = null;
    if (Math.random() < 0.7) {
      const pickOne = (arr) => arr[(Math.random() * arr.length) | 0];
      const roomy = C.chambers(OPEN_BAND + 500);
      const deep = C.chambers(WH * 0.5);
      const gateFloors = C.floors().filter((f) => f.y > WH * 0.3 && f.y < WH * 0.7);
      const options = [];
      if (roomy.length) options.push('whale');
      if (deep.length) options.push('kraken');
      if (gateFloors.length) options.push('temple');
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
      }
    }

    // A power-up or two floating in the reef.
    this._makePowerups(1 + (Math.random() < 0.5 ? 1 : 0));

    // The reef's relic objective + this reef's high points fallback.
    this.reefBanked = 0; this.relicBanked = false; this.carryingRelic = false;
    this.reefGoal = RELIC.goalBase + (this.reef - 1) * RELIC.goalPerReef;
    const rc = C.randomOpen(OPEN_BAND + 400) || C.randomOpen(OPEN_BAND) || { x: WW / 2, y: WH * 0.5 };
    this.relic = new Relic(rc.x, rc.y, RELIC.types[(Math.random() * RELIC.types.length) | 0]);
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
      this.owned.add(w); this._rebuildWeapons(); this.weaponIdx = this.weapons.indexOf(w);
      this.puName = `${WEAPON_INFO[w].name}!`; this.puCol = PAL.gold; this.puT = 1.7;
    } else {
      const upg = WEAPON_ORDER.filter((w) => this.owned.has(w) && this.weaponLevel[w] < SHOP.maxWeaponLevel);
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
    for (const w of WEAPON_ORDER) {
      const info = WEAPON_INFO[w];
      if (info.cost > 0 && !this.owned.has(w) && this.reef >= info.minReef)
        items.push({ kind: 'weapon', id: w, label: `${info.glyph} Unlock ${info.name}`, cost: info.cost });
    }
    for (const w of WEAPON_ORDER) {
      if (this.owned.has(w) && this.weaponLevel[w] < SHOP.maxWeaponLevel)
        items.push({ kind: 'upgrade', id: w, label: `${WEAPON_INFO[w].glyph} Upgrade ${WEAPON_INFO[w].name} → Lv${this.weaponLevel[w] + 1}`, cost: SHOP.weaponUpgradeBase * this.weaponLevel[w] });
    }
    if (this.tankLevel < SHOP.tankMaxLevel)
      items.push({ kind: 'tank', id: 'tank', label: `🫁 Air Tank +${SHOP.tankBonus} (Lv${this.tankLevel + 1})`, cost: SHOP.tankBaseCost + this.tankLevel * SHOP.tankCostGrowth });
    items.push({ kind: 'close', id: 'close', label: 'Close', cost: 0 });
    return items;
  }

  _shopRow(i) { const w = 470, x = (W - w) / 2, y = 178 + i * 46; return { x, y, w, h: 40 }; }

  _openShop(where) { this.state = 'shop'; this.shopWhere = where; this.shopSel = 0; this.shopDeny = 0; this.audio.select(); }
  _closeShop() { this.state = 'playing'; }
  _shopMove(dir) { const n = this._shopItems().length; this.shopSel = (this.shopSel + dir + n) % n; this.audio.pickup(); }

  _shopBuy() {
    const items = this._shopItems();
    const it = items[this.shopSel]; if (!it) return;
    if (it.kind === 'close') { this._closeShop(); return; }
    if (this.gold < it.cost) { this.shopDeny = 0.6; this.audio.gasp(); return; }
    this.gold -= it.cost;
    if (it.kind === 'weapon') {
      this.owned.add(it.id); this._rebuildWeapons(); this.weaponIdx = this.weapons.indexOf(it.id);
      this.puName = `${WEAPON_INFO[it.id].name}!`; this.puCol = PAL.gold; this.puT = 1.6;
    } else if (it.kind === 'upgrade') {
      this.weaponLevel[it.id] += 1;
      this.puName = `${WEAPON_INFO[it.id].name} Lv${this.weaponLevel[it.id]}`; this.puCol = PAL.air; this.puT = 1.6;
    } else if (it.kind === 'tank') {
      this.tankLevel += 1; this.airMax += SHOP.tankBonus; this.air = this.airMax;
      this.puName = 'BIGGER TANK!'; this.puCol = PAL.air; this.puT = 1.6;
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

  // Unload carried loot at a station (boat or bell): full score points plus
  // gold (a fraction of the value) to spend on gear, and bank the relic.
  _bankLoot() {
    const g = Math.round(this.carried * GOLD.rate);
    this.reefBanked += this.carried; this.score += this.carried; this.gold += g;
    this.carried = 0; this.bankPulse = 1; this.audio.bank();
    if (this.carryingRelic) { this.relicBanked = true; this.carryingRelic = false; }
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
    this.columns = []; this.hasKey = false; this.templeGate = null; this.whaleExit = null; this.powerups = []; this.relic = null; this.bells = []; this.crates = [];
    const value = (y) => 400 + Math.round((y / WH) * 500);

    // Scattered loot + a couple of air vents + light hazards.
    for (const f of spread(C.floors(), 10, 200)) this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, value(f.y)));
    for (let i = 0; i < 26; i++) { const c = C.randomOpen(); if (c) this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.4 ? 'gem' : 'coin')); }
    for (const w of spread(C.walls(), 5, 380)) this.vents.push(new AirVent(w.x, w.y, w.side));
    for (let i = 0; i < 6; i++) { const c = C.randomOpen(OPEN_BAND + 300); if (c) this.creatures.push(Math.random() < 0.5 ? new Eel(c.x, c.y) : new Puffer(c.x, c.y)); }
    // Columns for temple flavour.
    for (const f of spread(C.floors(), 18, 200)) this.columns.push({ x: f.x, y: f.y });

    // The key, mid-temple.
    const kc = C.randomOpen(OPEN_BAND + 400) || { x: WW / 2, y: WH * 0.4 };
    this.key = { x: kc.x, y: kc.y, r: 20, taken: false };
    // The locked door deep down, with the vault (locked loot) behind/below it.
    const dc = C.randomOpen(WH * 0.6) || { x: WW / 2, y: WH * 0.7 };
    const dFloor = C.surfaceBelow(dc.x, dc.y, 200);
    this.door = { x: dc.x, y: dFloor - 90, w: 74, h: 180, open: 0 };
    for (let i = 0; i < 8; i++) {
      const vx = dc.x + (Math.random() - 0.5) * 180, vy = dFloor + 20 + Math.random() * 80;
      if (!C.isSolid(vx, vy)) { const t = new Treasure(vx, vy, Math.random() < 0.6 ? 'gem' : 'chest'); t.locked = true; this.treasures.push(t); }
    }
    this.flora = new Flora([]);
    this._makeCurrents(2);
    this._makePowerups(1);
    this.templeExit = { x: WW / 2, y: OPEN_BAND - 6, r: 46 };
  }

  // Scatter current zones on open cells, flowing along the cave.
  _makeCurrents(count) {
    const C = this.cave;
    for (let i = 0; i < count; i++) {
      const c = C.randomOpen(OPEN_BAND + 200); if (!c) continue;
      const horizontal = Math.random() < 0.7;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const w = horizontal ? 360 + Math.random() * 240 : 200 + Math.random() * 120;
      const h = horizontal ? 170 + Math.random() * 90 : 300 + Math.random() * 200;
      const fx = horizontal ? dir : 0, fy = horizontal ? 0 : 1;   // vertical currents pull down
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
    this.templeGate = null; this.columns = []; this.powerups = []; this.relic = null; this.bells = []; this.crates = [];
    const value = (y) => 350 + Math.round((y / WH) * 500);   // richer than the reef

    // Rib bones lining the belly.
    for (const f of spread(C.floors(), 40, 130)) this.ribs.push({ x: f.x, y: f.y - 40, dir: Math.random() < 0.5 ? 1 : -1 });
    // A generous trove: chests on ledges, gems & coins everywhere.
    for (const f of spread(C.floors(), 22, 150)) this.shells.push(new Chest(f.x, f.y - SHELL.chestRadius * 0.35, value(f.y)));
    for (let i = 0; i < 60; i++) { const c = C.randomOpen(); if (c) this.treasures.push(new Treasure(c.x, c.y, Math.random() < 0.5 ? 'gem' : 'coin')); }
    // A couple of blowhole vents so it's survivable, plus swallowed hazards.
    for (const w of spread(C.walls(), 6, 400)) this.vents.push(new AirVent(w.x, w.y, w.side));
    for (let i = 0; i < 8; i++) { const c = C.randomOpen(OPEN_BAND + 200); if (c) this.creatures.push(Math.random() < 0.5 ? new Eel(c.x, c.y) : new Jelly(c.x, c.y)); }
    this.flora = new Flora([]);
    this._makeCurrents(3);   // churning guts
    this._makePowerups(1);
    // Glowing throat exit up in the entrance band; the diver starts down in the belly.
    this.whaleExit = { x: WW / 2, y: OPEN_BAND - 6, r: 46 };
  }

  // ---- input events (from main) ---------------------------------------
  onAction() {
    if (this.state === 'menu' || this.state === 'gameover') { this.audio.ensure(); this.audio.resume(); this.start(); }
    else if (this.state === 'paused') this.state = 'playing';
    else if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'shop') this._shopBuy();
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
    if (this.state !== 'playing' || this.fireCd > 0) return;
    const id = this.weapon, lvl = this.weaponLevel[id];
    this.fireCd = WEAPON_INFO[id].cd * (1 - 0.08 * (lvl - 1));
    switch (id) {
      case 'harpoon':  this._fireHarpoon(); break;
      case 'net':      this._fireNet(); break;
      case 'speargun': this.burst = SPEARGUN.shots + (lvl - 1); this.burstT = 0; break;   // +1 shot per level
      case 'charge':   this._fireCharge(lvl); break;
      case 'shock':    this._fireShock(lvl); break;
    }
  }

  _spear(angleOff = 0) {
    const d = this.diver, ca = Math.cos(angleOff), sa = Math.sin(angleOff);
    this.harpoons.push(new Harpoon(d.x, d.y, d.aimX * ca - d.aimY * sa, d.aimX * sa + d.aimY * ca));
    this.audio.fire();
  }
  _fireHarpoon() {
    if (this.multiFireT > 0) for (const a of [-POWERUP.spread, 0, POWERUP.spread]) this._spear(a);
    else this._spear(0);
  }
  _fireNet() {
    const d = this.diver;
    this.nets.push(new Net(d.x, d.y, d.aimX, d.aimY));
    this.audio.fire();
  }
  _fireCharge(lvl = 1) {
    const d = this.diver;
    const ch = new DepthCharge(d.x, d.y, d.aimX, d.aimY);
    ch.blast = CHARGE.blast * (1 + 0.3 * (lvl - 1));   // bigger blast when upgraded
    this.charges.push(ch);
    this.audio.fire();
  }
  _fireShock(lvl = 1) {
    const d = this.diver, R = SHOCK.radius * (1 + 0.2 * (lvl - 1));
    this.shockR = R;
    for (const cr of this.creatures) {
      if (cr.dead) continue;
      const dist = Math.hypot(cr.x - d.x, cr.y - d.y);
      if (dist < R) {
        cr.snareT = Math.max(cr.snareT || 0, SHOCK.stun * (1 + 0.3 * (lvl - 1)));
        const a = Math.atan2(cr.y - d.y, cr.x - d.x);          // knock outward
        if (cr.vx !== undefined) { cr.vx += Math.cos(a) * SHOCK.knock; cr.vy += Math.sin(a) * SHOCK.knock; }
        this.particles.sparkle(cr.x, cr.y, PAL.gateGlow, 8);
      }
    }
    this.shockT = 0.28;
    this.particles.sparkle(d.x, d.y, PAL.gateGlow, 20);
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
    this._syncTouchButtons();   // on-screen buttons for touch play
    // Gamepad confirm/start advances menus / resumes (fire handles it in-play).
    const startEdge = this.input.consumeStart();
    if (this.input.pressed('pause') || this.input.consumeButton('pause')) { if (this.state === 'shop') this._closeShop(); else this.onAction(); }
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
    if (startEdge && this.state !== 'playing') { this.audio.ensure(); this.audio.resume(); this.onAction(); }

    // Sailing to a new reef: brief transition, then a fresh cave.
    if (this.state === 'sailing') {
      this.sailT += dt;
      if (this.sailT > 1.8) this._newReef();
      this.input.endFrame(); return;
    }
    if (this.state !== 'playing') { this.input.endFrame(); return; }
    // Switch weapons (keyboard Q/E or [ ], gamepad Y/LB, touch weapon button).
    if (this.input.pressed('weaponNext') || this.input.consumeButton('weapon')) this._cycleWeapon(1);
    if (this.input.pressed('weaponPrev')) this._cycleWeapon(-1);
    this.weaponSwapT = Math.max(0, this.weaponSwapT - dt);
    if (this.input.consumeTapFire()) this.fire();
    this.fireCd = Math.max(0, this.fireCd - dt);
    // Speargun burst: fire the queued shots out over a few frames.
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        const j = (SPEARGUN.shots - this.burst) - (SPEARGUN.shots - 1) / 2;
        this._spear(j * SPEARGUN.spread);
        this.burst -= 1; this.burstT = SPEARGUN.interval;
      }
    }
    this.multiFireT = Math.max(0, this.multiFireT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.speedT = Math.max(0, this.speedT - dt);
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.shockT = Math.max(0, this.shockT - dt);
    if (this.shieldT > 0) this.diver.invuln = Math.max(this.diver.invuln, 0.1);   // shield = invulnerable

    const intent = this.input.vector();
    this.diver.update(dt, intent, (x, y) => this.particles.bubble(x, y), this.speedT > 0 ? POWERUP.speedMult : 1);
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
      if (this.carried > 0) this._bankLoot();
      // Hold ↑ into the boat to sail on — once you've banked the relic or the goal.
      if (atBoat && this.carried === 0 && this.canSail && intent.y < -0.3) { this.dockHold += dt; if (this.dockHold > 1.0) this._setSail(); }
      else this.dockHold = 0;
      // Touch players tap the on-screen SAIL ON button instead of holding ↑.
      if (atBoat && this.input.consumeButton('sail') && this.carried === 0 && this.canSail) this._setSail();
    } else {
      this.dockHold = 0;
      this.air -= (AIR.drainPerSec + this.diver.y * AIR.drainDepthFactor) * dt;
      if (inVent) { this.air = Math.min(this.airMax, this.air + AIR.ventRefillPerSec * dt); if (Math.random() < 0.2) this.audio.refill(); }
      if (this.air <= 0) { this.air = 0; this._loseLife(); }
      else if (this.air < 20 && Math.random() < 0.02) this.audio.gasp();
    }
    // Open the shop while docked (loot banked) — spend gold on gear.
    if (atStation && this.carried === 0 && (this.input.pressed('shop') || this.input.consumeButton('shop'))) this._openShop(atBoat ? 'boat' : 'bell');

    // Entities.
    const emitBig = (x, y) => this.bigBubbles.push(new BigBubble(x, y));
    for (const s of this.shells) s.update(dt, this.t, emitBig);
    for (const b of this.bigBubbles) b.update(dt, this.cave);
    for (const tr of this.treasures) tr.update(dt, this.t);
    for (const cr of this.creatures) {
      if (cr.snareT > 0) { cr.snareT -= dt; if (cr.vx !== undefined) { cr.x += cr.vx * dt; cr.y += cr.vy * dt; cr.vx *= 0.9; cr.vy *= 0.9; } this.cave.collide(cr); continue; }  // netted/stunned: held in place
      cr.update(dt, this.t, this.diver);
      if (this.cave.collide(cr) && cr.dir !== undefined) cr.dir = cr._nx > 0 ? -1 : 1; // turn off walls
    }
    for (const h of this.harpoons) h.update(dt, this.cave);
    for (const n of this.nets) n.update(dt, this.cave);
    for (const ch of this.charges) { ch.update(dt, this.cave); if (ch.exploded) this._explode(ch); }
    for (const k of this.krakens) { k.update(dt, this.t, this.diver); if (this.diver.invuln <= 0 && k.hits(this.diver)) this._hit(); }
    for (const pu of this.powerups) { pu.update(dt, this.t); if (!pu.taken && pu.reached(this.diver)) { pu.taken = true; this._applyPowerUp(pu.type); } }
    for (const cr of this.crates) { cr.update(dt, this.t); if (this.zone === 'reef' && cr.reached(this.diver)) { cr.taken = true; this._openCrate(); } }
    // Relic objective — pick it up, carry it back to the boat to bank it.
    if (this.relic && !this.relic.taken) {
      this.relic.update(dt, this.t);
      if (this.zone === 'reef' && this.relic.reached(this.diver)) {
        this.relic.taken = true; this.carryingRelic = true; this.carried += RELIC.value;
        this.particles.sparkle(this.relic.x, this.relic.y, PAL.key, 30); this.audio.gem();
      }
    }
    // Treasure magnet: pull nearby loot toward the diver.
    if (this.magnetT > 0) {
      const dv = this.diver, R = POWERUP.magnetRadius;
      for (const tr of this.treasures) {
        if (tr.locked && !this.hasKey) continue;
        const dx = dv.x - tr.x, dy = dv.y - tr.baseY, dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < R) {
          const speed = 130 + (POWERUP.magnetPull - 130) * (1 - dist / R);
          const step = Math.min(dist, speed * dt);
          tr.x += (dx / dist) * step; tr.baseY += (dy / dist) * step;
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
    } else if (this.zone === 'belly' && this.whaleExit) {
      const e = this.whaleExit;
      if (Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) { this._exitWhale(); this.input.endFrame(); return; }
    } else if (this.zone === 'temple') {
      // Key: grab it to unlock the door and the vault.
      if (this.key && !this.key.taken && Math.hypot(d.x - this.key.x, d.y - this.key.y) < this.key.r + d.radius) {
        this.key.taken = true; this.hasKey = true;
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

    // Extra life every 5000 points banked.
    while (this.score >= this.nextLifeScore) { this.lives += 1; this.nextLifeScore += 5000; this.oneUpT = 2.2; this.audio.bank(); }

    if (this.zone === 'reef' && this.shells.every((s) => !s.hasLoot) && this.treasures.length === 0 && this.carried === 0 && this.diver.atSurface) this._win();

    this.input.endFrame();
  }

  _collisions() {
    const d = this.diver;
    for (const tr of this.treasures) {
      if (tr.locked && !this.hasKey) continue;   // vault loot needs the key
      if (!tr.taken && tr.reached(d)) {
        tr.taken = true; this.carried += tr.value;
        this.particles.sparkle(tr.x, tr.y, tr.kind === 'gem' ? PAL.gem : PAL.gold, tr.kind === 'coin' ? 12 : 18);
        tr.kind === 'gem' ? this.audio.gem() : this.audio.pickup();
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
          h.dead = true; cr.dead = true;
          this.score += cr.points;
          this.particles.sparkle(cr.x, cr.y, PAL.danger, 20);
          this.audio.kill();
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
        if (!cr.dead && cr.snareT <= 0 && n.hits(cr)) {
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
    this.shake = Math.max(this.shake, 10); this.flash = Math.max(this.flash, 0.3);
    this.particles.sparkle(ch.x, ch.y, PAL.puffer, 40);
    this.particles.sparkle(ch.x, ch.y, PAL.gold, 20);
    this.audio.kill();
    const R = ch.blast;
    for (const cr of this.creatures) {
      if (!cr.dead && Math.hypot(cr.x - ch.x, cr.y - ch.y) < R + (cr.radius || 14)) {
        cr.dead = true; this.score += cr.points;
        this.particles.sparkle(cr.x, cr.y, PAL.danger, 14);
      }
    }
    for (const k of this.krakens) {
      if (k.hp > 0 && Math.hypot(k.x - ch.x, k.y - ch.y) < R + k.radius) {
        k.takeDamage(2); this.score += KRAKEN.hitPoints * 2;
        if (k.hp === 0) { this.score += KRAKEN.killBonus; this.particles.sparkle(k.x, k.y, PAL.gold, 40); this.audio.bank(); for (let n = 0; n < 6; n++) this.treasures.push(new Treasure(k.x + (Math.random() - 0.5) * 120, k.y + (Math.random() - 0.5) * 120, 'gem')); }
      }
    }
  }

  _hit() {
    this.diver.hit(); this.flash = 1; this.shake = 12;
    this.audio.hit();
    this._loseLife('killed');
  }

  _loseLife(cause = 'air') {
    this.lives -= GAME.hitCost;
    if (this.lives <= 0) { this.deathCause = cause; this._gameOver(); return; }
    this.air = Math.max(this.air, 35);
    this.diver.invuln = GAME.invulnAfterHit;
    this.diver.y = Math.max(WORLD.SURFACE + 40, this.diver.y - 70);
  }

  _gameOver() {
    this.state = 'gameover';
    this.audio.gasp();
    if (this.score > this.hi) {
      this.hi = this.score; this.hiReef = this.reef; this.newHi = true;
      localStorage.setItem(HI_KEY, String(this.hi));
      localStorage.setItem(HI_REEF_KEY, String(this.hiReef));
    } else this.newHi = false;
  }

  _win() {
    this.score += Math.round(this.air) * 5 + this.lives * 500;
    this.won = true;
    this._gameOver();
  }

  // Board the boat and set sail for a fresh reef (score & lives carry over).
  _setSail() {
    this.state = 'sailing'; this.sailT = 0; this.reef += 1; this.dockHold = 0;
    this.audio.select();
  }
  _newReef() {
    this._generateWorld();
    this.diver.reset();
    this.camX = WW / 2 - W / 2; this.camY = 0;
    this.air = this.airMax;
    this.state = 'playing';
    this.audio.bank();
  }

  // ---- special zones (whale belly, temple) ---------------------------
  // Snapshot the whole reef and where to drop the diver when they come back.
  get canSail() { return this.relicBanked || this.reefBanked >= this.reefGoal; }

  _snapshotReef(returnX, returnY) {
    const keys = ['cave', 'shells', 'treasures', 'creatures', 'vents', 'wrecks', 'flora', 'skeletons', 'bigBubbles', 'whales', 'ribs', 'currents', 'krakens', 'templeGate', 'powerups', 'relic', 'bells', 'crates'];
    const snap = { returnX, returnY };
    for (const k of keys) snap[k] = this[k];
    this.savedReef = snap;
  }
  _restoreReef() {
    const s = this.savedReef; if (!s) return;
    const keys = ['cave', 'shells', 'treasures', 'creatures', 'vents', 'wrecks', 'flora', 'skeletons', 'bigBubbles', 'whales', 'ribs', 'currents', 'krakens', 'templeGate', 'powerups', 'relic', 'bells', 'crates'];
    for (const k of keys) this[k] = s[k];
    this.zone = 'reef';
    this.whaleExit = null; this.templeExit = null; this.door = null; this.key = null; this.hasKey = false; this.columns = [];
    this._placeDiver(s.returnX, s.returnY, 0);
    this.savedReef = null; this.zoneFade = 1;
    this.reentryT = 1.5;   // grace so we don't immediately re-enter what we just left
    this.audio.bank();
  }

  // Swallowed! Snapshot the reef, generate the belly, drop the diver inside.
  _enterWhale(whale) {
    const m = whale.mouthZone();
    this._snapshotReef(m.x + whale.facing * 34, m.y);
    this.zone = 'belly';
    this._generateBelly();
    const c = this.cave.randomOpen(WH * 0.55) || { x: WW / 2, y: WH * 0.6 };
    this._placeDiver(c.x, c.y, 0);
    this.shake = 10; this.zoneFade = 1;
    this.audio.gasp();
  }
  _exitWhale() { this._restoreReef(); }

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
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const cx = this.camX, cy = this.camY;
    const depthT = Math.min(1, cy / WH);
    this.bg.draw(ctx, cx, cy, this.t, depthT);
    this.boat.draw(ctx, cx, cy, this.t);

    if (this.state !== 'menu') {
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
      if (this.door) { ctx.save(); ctx.translate(this.door.x + this.door.w / 2 - cx, this.door.y + this.door.h / 2 - cy); drawDoor(ctx, this.door.open, this.door.w, this.door.h); ctx.restore(); }
      if (this.key && !this.key.taken) { ctx.save(); ctx.translate(this.key.x - cx, this.key.y - cy); drawKey(ctx, this.t); ctx.restore(); }
      if (this.templeExit) { ctx.save(); ctx.translate(this.templeExit.x - cx, this.templeExit.y - cy); drawTempleGate(ctx, this.t, this.templeExit.r); ctx.restore(); }
      if (this.relic && !this.relic.taken) this.relic.draw(ctx, cx, cy, this.t);
      for (const b of this.bigBubbles) b.draw(ctx, cx, cy);
      for (const h of this.harpoons) h.draw(ctx, cx, cy);
      for (const n of this.nets) n.draw(ctx, cx, cy);
      for (const ch of this.charges) ch.draw(ctx, cx, cy);
      // Depth darkening — the deep swallows the light (drawn under the diver).
      if (this.zone === 'belly') {
        const beat = 0.30 + 0.10 * Math.sin(this.t * 2.2) + 0.04 * Math.sin(this.t * 4.4);
        ctx.fillStyle = `rgba(60,10,18,${beat})`; ctx.fillRect(0, 0, W, H);       // warm, pulsing "inside a body"
      } else if (depthT > 0.02) {
        ctx.fillStyle = `rgba(2,7,15,${0.5 * depthT})`; ctx.fillRect(0, 0, W, H);
      }
    }

    this.particles.draw(ctx, cx, cy);
    if (this.state !== 'menu') this.diver.draw(ctx, cx, cy);
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
    // Shock-prod discharge: a crackling electric ring around the diver.
    if (this.shockT > 0 && this.state !== 'menu') {
      const sx = this.diver.x - cx, sy = this.diver.y - cy;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.shockT / 0.28);
      ctx.strokeStyle = PAL.gateGlow; ctx.lineWidth = 2;
      ctx.beginPath();
      const shockR = this.shockR || SHOCK.radius;
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = shockR * (0.9 + 0.14 * Math.sin(a * 6 + this.t * 40));
        const px = sx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
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
    if (this.state === 'menu') this._menu();
    if (this.state === 'paused') this._overlay('PAUSED', this.input.isTouch ? 'Press P or tap ▶ to resume' : 'Press P / click to resume');
    if (this.state === 'shop') this._shopScreen();
    if (this.state === 'gameover') this._gameOverScreen();
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
    // caption
    this._text(`SAILING TO REEF ${this.reef}…`, W / 2, H * 0.72, 26, PAL.hudText, 'center', 'middle', true);
    this._text(`SCORE ${this.score}   ·   LIVES ${this.lives}`, W / 2, H * 0.72 + 34, 15, '#bfe6ff', 'center', 'middle');
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
      if (this.state === 'playing' && this.weapons.length > 1) {
        btns.push({ id: 'weapon', x: W - 66, y: H - 74, w: 52, h: 44 });
      }
      // At a station with loot banked: a SHOP button.
      const atStation = this.state === 'playing' && this.zone === 'reef' && this.carried === 0 &&
        (this.boat.contains(this.diver) || this.bells.some((b) => b.contains(this.diver)));
      if (atStation) btns.push({ id: 'shop', x: W / 2 - 60, y: H - 128, w: 120, h: 38 });
      // In the shop: one tappable button per item row.
      if (this.state === 'shop') {
        const items = this._shopItems();
        items.forEach((it, i) => { const r = this._shopRow(i); btns.push({ id: 'shop' + i, x: r.x, y: r.y, w: r.w, h: r.h }); });
      }
    }
    this._touchBtns = btns;
    this.input.touchButtons = btns;
  }

  // Draw one on-screen touch button with its icon/label.
  _touchBtn(b) {
    const ctx = this.ctx;
    const active = (b.id === 'pause' && this.state === 'paused') || (b.id === 'mute' && this.muted) || b.id === 'sail';
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
    if (this.weapons.length > 1) this._text('◂ Q E ▸', harpIconX + 30 + nameW, wy2, 10, 'rgba(150,190,220,0.6)', 'left', 'middle');
    // Active buff timers.
    let buffX = harpIconX + 30 + nameW + 54;
    const buff = (label, secs, col) => { this._text(`${label} ${Math.ceil(secs)}s`, buffX, by + bh + 22, 12, col, 'left', 'middle', true); buffX += this.ctx.measureText(`${label} ${Math.ceil(secs)}s`).width + 14; };
    if (this.multiFireT > 0) buff('✸×3', this.multiFireT, PAL.harpoonTip);
    if (this.shieldT > 0) buff('🛡', this.shieldT, PAL.gateGlow);
    if (this.speedT > 0) buff('»»', this.speedT, PAL.air);
    if (this.magnetT > 0) buff('🧲', this.magnetT, PAL.gold);

    // Gold purse (spendable currency, earned when you bank loot).
    this._text(`💰 ${this.gold}`, bx + 8, by + bh + 46, 15, PAL.gold, 'left', 'middle', true);

    this._text(`SCORE ${this.score}`, W - 20, 22, 18, PAL.hudText, 'right', 'top');
    const cp = this.bankPulse > 0 ? PAL.gold : PAL.hudText;
    this._text(`CARRYING ${this.carried}`, W - 20, 46, 14, cp, 'right', 'top');
    this._text(`DEPTH ${Math.round(this.depthReached / 10)} m`, W - 20, 66, 13, '#bfe6ff', 'right', 'top');
    const zoneTag = this.zone === 'belly' ? '🐋 THE BELLY' : this.zone === 'temple' ? '🏛 THE TEMPLE' : `REEF ${this.reef}`;
    const zoneCol = this.zone === 'belly' ? PAL.membrane : this.zone === 'temple' ? PAL.templeRim : '#8fbfda';
    this._text(zoneTag, W - 20, 84, 12, zoneCol, 'right', 'top');
    if (this.zone === 'temple' && this.hasKey) this._text('🔑 KEY', W - 20, 102, 12, PAL.key, 'right', 'top');
    if (this.zone === 'reef') {
      const rel = this.relicBanked ? '⚓ RELIC ✓' : this.carryingRelic ? '⚓ RELIC — bank it!' : `⚓ ${this.reefBanked}/${this.reefGoal}`;
      this._text(this.canSail ? '⚓ SAIL READY' : rel, W - 20, 102, 12, this.canSail ? PAL.air : PAL.key, 'right', 'top');
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
      const msg = this.carried > 0 ? '🔔 DIVE BELL — banking loot & refilling air' : '🔔 DIVE BELL — air topped up. A safe haven in the deep';
      this._text(msg, W / 2, H - 30, 15, PAL.bellLight, 'center', 'middle');
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
      }
    }
    // Shop hint at any station once loot is banked.
    if (this.zone === 'reef' && this.carried === 0 && (this.boat.contains(this.diver) || this.bells.some((b) => b.contains(this.diver)))) {
      this._text(this.input.isTouch ? 'Tap ⚙ SHOP to spend gold on gear' : 'Press B to open the ⚙ SHOP', W / 2, H - 52, 13, PAL.gold, 'center', 'middle');
    }

    // Point the way to the exit in the special zones (they're easy to lose).
    if (this.zone === 'temple' && this.templeExit) this._exitLocator(this.templeExit.x, this.templeExit.y, 'EXIT');
    else if (this.zone === 'belly' && this.whaleExit) this._exitLocator(this.whaleExit.x, this.whaleExit.y, 'ESCAPE');

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
    ctx.save();
    ctx.fillStyle = 'rgba(3,12,22,0.72)';
    ctx.beginPath(); ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
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
    const exit = this.zone === 'temple' ? this.templeExit : this.zone === 'belly' ? this.whaleExit : null;
    if (exit) {
      ctx.fillStyle = PAL.gateGlow;
      ctx.beginPath(); ctx.arc(wx(exit.x), wy(exit.y), 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // diver (blinking)
    ctx.fillStyle = Math.floor(this.t * 4) % 2 ? '#eaffff' : '#7ff3ff';
    ctx.beginPath(); ctx.arc(wx(this.diver.x), wy(this.diver.y), 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#04121f'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // label
    this._text('MAP', mx + mw - 2, my - 6, 9, 'rgba(150,200,230,0.7)', 'right', 'bottom');
  }

  _menu() {
    const cx = W / 2;
    this._panel();
    this._text('DEEP DESCENT', cx, 170, 58, PAL.glow, 'center', 'middle', true);
    this._text('a modern homage to Durell’s SCUBA DIVE (1983)', cx, 216, 16, '#bfe6ff', 'center', 'middle');
    this._text('Explore 2D caves — tunnels, drop-offs & chambers.', cx, 288, 17, PAL.hudText, 'center', 'middle');
    this._text('Grab pearls, gems & sunken wrecks. Harpoon the hunters.', cx, 314, 17, PAL.hudText, 'center', 'middle');
    this._text('Refill air at bubble vents; surface at the boat to bank.', cx, 340, 17, PAL.hudText, 'center', 'middle');
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE', cx, 404, 22, PAL.gold, 'center', 'middle', true);
    this._text('Swim: Arrows / WASD / drag / stick   ·   Fire: Space / F / tap / A   ·   Weapons: Q / E / Y   ·   Pause: P / Start', cx, 452, 13, '#9fc6e0', 'center', 'middle');
    this._text('🎮 Gamepad supported (Steam Deck, ROG Ally & more)', cx, 472, 12, '#7fb0d0', 'center', 'middle');
    if (this.hi > 0) this._text(`BEST ${this.hi} · REEF ${this.hiReef}`, cx, 486, 14, '#bfe6ff', 'center', 'middle');
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
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE AGAIN', cx, 430, 20, PAL.gold, 'center', 'middle', true);
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
