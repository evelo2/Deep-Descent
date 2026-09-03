// Game orchestration: state machine, 2D world generation, 2D camera, collisions,
// air/score/lives economy, and the HUD. Rendered onto a fixed logical canvas.
import { WORLD, AIR, PAL, RENTAL } from './config.js';
import { VERSION } from './version.js';
import { Harpoon } from './entities/harpoon.js';
import { Net } from './entities/weapons.js';
import { SCHEMES, SCHEME_LABEL, nextScheme, prompt as ctrlPrompt, controlsHelpLines, hintStrip } from './controls.js';
import { GOLD, bellBankRate, WEAPON_INFO, SHOP, AIM, FLARE, TORCH, SALVAGE, CRATE, LIVES } from './config.js';
import { makeReef } from './minigames/reef/index.js';
import { text, panel, overlay, keycap, mmss } from './render/chrome.js';
import { loadSalvage, saveSalvage, availableSkips, skipStartGold } from './meta/salvage.js';
import { BADGES, BADGE_BY_ID, loadBadges, rankFor } from './meta/badges.js';
import { loadStats } from './meta/stats.js';
import { TRACKS, loadProgress, trackProgress } from './meta/progressive.js';
import { RELICS, getRelic, rentRelic } from './meta/relics.js';

const HI_KEY = 'deepdescent.hi';
const HI_REEF_KEY = 'deepdescent.hireef';
const CONTROLS_KEY = 'deepdescent.controls';
// W/H are the VISIBLE logical viewport and flex to fill the device screen
// (main.js sizes them on resize): the 900x600 core is always on screen and the
// long axis is extended out to the edges. They're module-level `let` so all
// HUD / menu / camera layout here — and input.js + render, which read WORLD.W/H
// — follow the live size.
let { W, H } = WORLD;
// WW/WH are LIVE — setWorldSize(reef) reassigns them per world tier, exactly as
// setViewport reassigns W/H. Capturing them here would pin a stale world.
const { OPEN_BAND, CELL } = WORLD;

// Called by main.js whenever the viewport resizes/rotates. Updates both the
// module-level W/H used throughout this file and WORLD.W/H used by input.js and
// the render modules, keeping every consumer on one live viewport size.
export function setViewport(w, h) {
  W = w; H = h;
  WORLD.W = w; WORLD.H = h;
}
// How-to-play pages shown on the Help screen.
const HELP_PAGES = [
  { title: '🐟 CONTROLS', id: 'controls', lines: [
    'Swim — Arrows / WASD / drag / left stick',
    'Fire — Space / F / tap / A   ·   HOLD to aim the nearest threat, RELEASE to shoot it',
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
  { title: '⚙ SALVAGE & DRY DOCK', lines: [
    'Salvage (⚙) is meta-currency that PERSISTS between runs and even game-overs.',
    'Earn it: reaching new reefs, felling mini-bosses, finding the reef relic,',
    'whirlpool speed-breaks, golden pearls, and sweeping a reef’s treasure clean.',
    'Black Pearls (rare, deep) bank straight to Salvage. Spend it at the DRY DOCK',
    '(🛠 R on the menu) to unlock & equip permanent relics — lungs, fins, sonar…',
    'A reef relic you FIND can be cashed at the menu to START a run reefs deeper.',
  ] },
];

// The Core shell (Phase 6): menu / state-machine router / meta screens (help,
// Trophy Wall, dry-dock) / control schemes / services. It builds the reef dive
// loop as a MiniGame (this._reef) and forwards update/draw/onAction to it; the
// reef owns all gameplay + run-state. See docs/platform/migration-plan.md.
export class Game {
  constructor(ctx, input, audio, particles, background, services, world, host) {
    this._host = host;   // Core Host (P9) — source of open/close for the reef.
    this.ctx = ctx; this.input = input; this.audio = audio;
    this.particles = particles; this.bg = background;
    this.state = 'menu';                 // menu | playing | paused | gameover
    // DiverWorld engine seam (Phase 3, slice 1): the diver/camera live in the
    // engine (host.world). Since P6 the reef MiniGame owns the dive loop + its own
    // world accessors, so the SHELL only needs the fields it still reads directly:
    // `camX`/`camY` (main.js paints ambient bubbles at game.camX/Y) and `diver`
    // (the shell's touch-button geometry hit-tests boat.contains(this.diver)). The
    // `air`/`airMax` shims were dropped in P7 — nothing on the shell reads them
    // (the reef reads air through its OWN accessors). These read/write host.world
    // so the values stay the single engine-owned copy. Instance-level (not
    // prototype) so the prototype-call stub tests, which never `new Game`, are
    // untouched. Bare construction (no world) keeps plain own fields, as before.
    this._world = world;
    if (world) {
      for (const key of ['diver', 'camX', 'camY']) {
        Object.defineProperty(this, key, {
          get() { return this._world[key]; },
          set(v) { this._world[key] = v; },
          configurable: true, enumerable: true,
        });
      }
    }
    this.hi = +(localStorage.getItem(HI_KEY) || 0);
    this.hiReef = +(localStorage.getItem(HI_REEF_KEY) || 1);
    // The meta-progression states are now OWNED by the Core services (Phase 2):
    // when the platform hands us `services`, we source the same state objects it
    // holds so a salvage/badge earned here is the one every future minigame sees
    // (host.economy.state, host.progression.badges, …). All our mutations + saves
    // below stay byte-identical — the wallet just lives in Core now. Without
    // services (bare construction, e.g. isolated tests) we load directly as before.
    this.meta = services ? services.economy.state : loadSalvage();
    this.badgeState = services ? services.progression.badges : loadBadges();   // Trophy Wall (persistent achievements)
    this.statState = services ? services.progression.stats : loadStats();      // lifetime cumulative counters (progressive badges)
    this.progressState = services ? services.progression.progress : loadProgress(); // earned progressive tier ids
    // On-screen control legend: Keyboard / Steam Deck / ROG Ally. A saved choice
    // wins; otherwise we start on Keyboard and auto-switch to pad prompts once a
    // gamepad shows up (until the player picks manually).
    const savedScheme = localStorage.getItem(CONTROLS_KEY);
    this.controlScheme = SCHEMES.includes(savedScheme) ? savedScheme : 'keyboard';
    this._schemeManual = !!savedScheme;
    this._applyHintStrip();
    this.pendingStartReef = 1;   // menu 'START AT' selection (cash a reef relic)

    // Phase 6: the reef dive loop is now a MiniGame that OWNS the ephemeral
    // run-state (score/loadout/entities/zones) + builds the nested whirlpool (P4)
    // and stage (P5). The shell (this Game) holds only menu/router/screens/services
    // and forwards update/draw/onAction to the reef; it hands the reef a `shell`
    // facade for the few shell-owned things it reads (state/controlScheme/hi). Built
    // only with the engine + meta spine (bare stub constructions skip it).
    this._reef = (world && services)
      ? makeReef({
          host: {
            world: this._world, economy: services.economy,
            progression: services.progression, achievements: services.achievements,
            audio: this.audio, input: this.input, particles: this.particles,
            viewport: WORLD, rng: (host && host.rng) || Math.random,
            // P9: the reef launches sibling minigames (host.open('match3')) via
            // the Core stack. open/close come from the real Host, Core-bound in
            // main.js; undefined-safe no-ops under bare/stub construction.
            // ctx MUST be forwarded: match-3 reads `source: 'chest'` off it to
            // arm the hoardcleared achievement (dropping it made that Steam
            // achievement unobtainable). See tests/game/open-ctx-chain.test.mjs.
            open: (id, ctx) => host && host.open && host.open(id, ctx),
            close: (result) => host && host.close && host.close(result),
          },
          shell: this._reefShell(), ctx: this.ctx, bg: this.bg,
        })
      : null;
  }

  // The shell-owned surface the reef MiniGame reaches back for (Phase 6): the
  // top-level `state` (the reef sets it on dive transitions — gameover/shop/sail),
  // the `controlScheme` for HUD hints, and the persisted best-record `hi`/`hiReef`
  // (the menu displays them; the reef updates them at game-over and the shell owns
  // the persistence keys). Getters/setters route to this Game.
  _reefShell() {
    const g = this;
    return {
      get state() { return g.state; }, set state(v) { g.state = v; },
      get controlScheme() { return g.controlScheme; },
      get hi() { return g.hi; }, set hi(v) { g.hi = v; },
      get hiReef() { return g.hiReef; }, set hiReef(v) { g.hiReef = v; },
      get pendingStartReef() { return g.pendingStartReef; }, set pendingStartReef(v) { g.pendingStartReef = v; },
      get _touchBtns() { return g._touchBtns; },
      saveHi: () => { localStorage.setItem(HI_KEY, g.hi); localStorage.setItem(HI_REEF_KEY, g.hiReef); },
      // Meta-screen input handlers (help/Trophy Wall/dry-dock) the reef routes to.
      _updateHelp: (startEdge, cycleControls) => g._updateHelp(startEdge, cycleControls),
      _updateBadges: (startEdge) => g._updateBadges(startEdge),
      _updateDryDock: (dt, startEdge) => g._updateDryDock(dt, startEdge),
      // Meta-screen open/close/nav + control schemes + touch chrome + renders.
      _openHelp: (from) => g._openHelp(from),
      _openBadges: (from) => g._openBadges(from),
      _openDryDock: (from) => g._openDryDock(from),
      _closeDryDock: () => g._closeDryDock(),
      _dryDockAct: () => g._dryDockAct(),
      _cycleScheme: () => g._cycleScheme(),
      _setScheme: (s) => g._setScheme(s),
      _cycleStartReef: () => g._cycleStartReef(),
      _autoDetectScheme: () => g._autoDetectScheme(),
      _syncTouchButtons: () => g._syncTouchButtons(),
      _touchBtn: (b) => g._touchBtn(b),
      _menu: () => g._menu(),
      _helpScreen: () => g._helpScreen(),
      _badgesScreen: () => g._badgesScreen(),
      _dryDockScreen: () => g._dryDockScreen(),
      _gameOverScreen: () => g._gameOverScreen(),
      _updateAbout: (startEdge) => g._updateAbout(startEdge),
      _openAbout: (from) => g._openAbout(from),
      _aboutScreen: () => g._aboutScreen(),
    };
  }

  // Meta-screen input handlers, invoked by the reef's state machine via the shell
  // facade (the reef brackets the frame with input.poll/endFrame). These own the
  // shell-side screen-state (helpPage/bdPage/ddSel/ddDeny) + HELP_PAGES.
  _updateHelp(startEdge, cycleControls) {
    const n = HELP_PAGES.length;
    if (cycleControls) this._cycleScheme();
    if (this.input.pressed('right') || this.input.pressed('weaponNext') || this.input.consumeButton('helpnext') || this.input.consumeTapFire()) this.helpPage = (this.helpPage + 1) % n;
    if (this.input.pressed('left') || this.input.pressed('weaponPrev') || this.input.consumeButton('helpprev')) this.helpPage = (this.helpPage - 1 + n) % n;
    if (this.input.pressed('help') || this.input.pressed('pause') || startEdge || this.input.consumeButton('helpclose')) this._closeHelp();
  }
  _updateBadges(startEdge) {
    if (this.input.pressed('left') || this.input.pressed('right') || this.input.pressed('weaponNext') || this.input.pressed('weaponPrev') || this.input.consumeButton('badgespage')) {
      this.bdPage = this.bdPage ? 0 : 1; this.audio.pickup(); return;
    }
    if (this.input.pressed('badges') || this.input.pressed('pause') || this.input.pressed('help') || startEdge || this.input.consumeTapFire() || this.input.consumeButton('badgesclose')) this._closeBadges();
  }
  _updateDryDock(dt, startEdge) {
    if (startEdge) this._dryDockAct();
    if (this.input.pressed('up')) this._dryDockMove(-1);
    if (this.input.pressed('down')) this._dryDockMove(1);
    if (this.input.pressed('left') || this.input.pressed('right')) this._dryDockEquipToggle();
    const rows = this._dryDockRows();
    for (let i = 0; i < rows.length; i++) {
      if (this.input.consumeButton('dd' + i)) { this.ddSel = i; this._dryDockAct(); break; }
      if (this.input.consumeButton('ddeq' + i)) { this.ddSel = i; this._dryDockEquipToggle(); break; }
    }
    this.ddDeny = Math.max(0, this.ddDeny - dt);
  }




  // Format a seconds count as m:ss (for long consumable-buff timers).
  _mmss(secs) { return mmss(secs); }
  // Doubling cost per level (loadout-slot pricing). (Also lives in the reef for the
  // shop; a tiny pure helper duplicated on the shell — P7 dedup candidate.)
  _dblCost(base, level) { return Math.round(base * Math.pow(2, level)); }




  // ---- dry dock (spend Salvage between runs: unlock relics, equip them into
  // slots, buy more slots) — mirrors the in-run shop's UI/nav closely. -----
  _dryDockRows() {
    const rows = [];
    for (const r of RELICS) {
      const dives = this.meta.rentals[r.id] || 0;
      rows.push({ kind: 'relic', id: r.id, name: r.name, desc: r.desc, cost: r.cost, dives, equipped: this.meta.loadout.includes(r.id) });
    }
    if (this.meta.slots < SALVAGE.maxSlots) {
      rows.push({ kind: 'slot', id: 'slot', label: `➕ Loadout slot (${this.meta.slots} → ${this.meta.slots + 1})`, cost: this._dblCost(SALVAGE.slotCostBase, this.meta.slots - SALVAGE.startSlots) });
    }
    if (this.meta.lifeMax < LIVES.capMax) {
      rows.push({ kind: 'life', id: 'life',
        label: `❤️ Max lives (${this.meta.lifeMax} → ${this.meta.lifeMax + 1})`,
        cost: this._dblCost(LIVES.costBase, this.meta.lifeMax - LIVES.baseMax) });
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

  // The Trophy Wall — a read-only grid of achievement badges (earned vs. locked).
  _openBadges(from) { this.bdReturn = from; this.bdPage = 0; this.state = 'badges'; this.audio.select(); }
  _closeBadges() { this.state = this.bdReturn || 'menu'; this.audio.select(); }

  // About / versions overlay — same open/close/route pattern as Badges.
  _openAbout(from) { this.aboutReturn = from; this.state = 'about'; this.audio.select(); }
  _closeAbout() { this.state = this.aboutReturn || 'menu'; this.audio.select(); }
  _updateAbout(startEdge) {
    // Any confirm / back / tap closes it (read-only screen).
    if (this.input.pressed('confirm') || this.input.pressed('back') || this.input.pressed('pause') ||
        startEdge || this.input.consumeTapFire() || this.input.consumeButton('aboutclose')) this._closeAbout();
  }
  _dryDockMove(dir) { const n = this._dryDockRows().length; this.ddSel = (this.ddSel + dir + n) % n; this.audio.pickup(); }

  // Confirm on a Dry Dock row = rent/renew a relic (spend cost, refill to a full
  // period) or buy a loadout slot. A first rent of an idle relic auto-equips it if
  // a slot is free, so the common case is one press. Equip/bench is ← / → (see
  // _dryDockEquipToggle).
  _dryDockAct() {
    const rows = this._dryDockRows();
    const row = rows[this.ddSel]; if (!row) return;
    if (row.kind === 'close') { this._closeDryDock(); return; }
    if (row.kind === 'slot') {
      if (this.meta.salvage < row.cost) { this.ddDeny = 0.6; this.audio.gasp(); return; }
      this.meta.salvage -= row.cost; this.meta.slots += 1; saveSalvage(this.meta); this.audio.bank();
    } else if (row.kind === 'life') {
      if (this.meta.salvage < row.cost) { this.ddDeny = 0.6; this.audio.gasp(); return; }
      this.meta.salvage -= row.cost; this.meta.lifeMax += 1; saveSalvage(this.meta); this.audio.bank();
    } else if (row.kind === 'relic') {
      const wasRented = (this.meta.rentals[row.id] || 0) > 0;
      if (!rentRelic(this.meta, row.id)) { this.ddDeny = 0.6; this.audio.gasp(); return; }
      // First rent of an idle relic auto-equips if a slot is free (one-press flow).
      if (!wasRented && !this.meta.loadout.includes(row.id) && this.meta.loadout.length < this.meta.slots) {
        this.meta.loadout.push(row.id);
      }
      saveSalvage(this.meta); this.audio.bank();
    }
    const n = this._dryDockRows().length;
    if (this.ddSel >= n) this.ddSel = n - 1;
  }

  // ← / → on a Dry Dock relic row = equip / bench (no cost). Needs an active
  // rental and a free slot to equip.
  _dryDockEquipToggle() {
    const row = this._dryDockRows()[this.ddSel];
    if (!row || row.kind !== 'relic') return;
    if (row.equipped) {
      this.meta.loadout = this.meta.loadout.filter((id) => id !== row.id);
    } else if ((this.meta.rentals[row.id] || 0) > 0 && this.meta.loadout.length < this.meta.slots) {
      this.meta.loadout.push(row.id);
    } else { this.ddDeny = 0.6; this.audio.gasp(); return; }
    saveSalvage(this.meta); this.audio.pickup();
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
      const cy = r.y + r.h / 2;
      const afford = row.kind === 'relic' ? this.meta.salvage >= row.cost : (row.kind === 'close' || this.meta.salvage >= row.cost);
      ctx.fillStyle = sel ? 'rgba(30,84,124,0.92)' : 'rgba(8,26,44,0.82)';
      ctx.strokeStyle = sel ? PAL.gold : 'rgba(120,200,255,0.22)'; ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
      if (row.kind === 'relic') {
        const rented = row.dives > 0;
        // Clip the name+desc so it never runs into the right-aligned rent/equip text.
        let label = `${rented ? '' : '🔒 '}${row.name} — ${row.desc}`;
        if (label.length > 52) label = label.slice(0, 51) + '…';
        this._text(label, r.x + 16, cy, 14, rented ? PAL.hudText : 'rgba(180,200,215,0.7)', 'left', 'middle', sel);
        if (rented) {
          // remaining dives (warn-tinted when low) + an equip chip on the right
          const low = row.dives <= 3;
          this._text(`${row.dives}d`, r.x + r.w - 92, cy, 13, low ? PAL.danger : '#9fc6e0', 'right', 'middle', true);
          this._text(row.equipped ? '✓ equipped' : 'equip', r.x + r.w - 16, cy, 13, row.equipped ? PAL.gold : '#9fc6e0', 'right', 'middle', true);
        } else {
          this._text(`RENT ⚙${row.cost}`, r.x + r.w - 16, cy, 13, afford ? PAL.gold : '#c88', 'right', 'middle', true);
        }
      } else {
        this._text(row.label, r.x + 16, cy, 15, afford ? PAL.hudText : 'rgba(210,130,130,0.85)', 'left', 'middle', sel);
        if (row.kind === 'slot') this._text(`⚙${row.cost}`, r.x + r.w - 16, cy, 14, afford ? PAL.gold : '#c88', 'right', 'middle', true);
      }
    });
    const hint = this.input.isTouch ? 'Tap a row to rent/renew · tap ✓ to equip · Close to leave' : '↑ / ↓ select   ·   Space / A rent/renew   ·   ← / → equip   ·   R / Esc close';
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


  // ---- input events (from main) ---------------------------------------
  // Phase 6: the shell delegates the dive loop + state machine to the reef
  // MiniGame. These three forwarders are what main.js + the Core drive each frame
  // (main.js also reads this.state / this.camX, which stay shell-resolvable).
  onAction() { this._reef.onAction(); }


  // ---- update ----------------------------------------------------------
  update(dt) { this._reef.update(dt); }









  // ---- render ----------------------------------------------------------
  draw() { this._reef.render(this.ctx); }

  // ---- touch buttons ---------------------------------------------------
  // Compute the on-screen buttons for the current state and hand their logical
  // rects to Input for hit-testing. Only ever populated on touch devices, so
  // desktop/gamepad play is untouched. Rects are fixed; visibility is by state.
  _syncTouchButtons() {
    // In-play, on-screen controls — TOUCH ONLY (desktop/gamepad use the keys).
    // These are the only buttons _touchBtn draws; menu / shop / dry-dock / help
    // SCREEN buttons draw their own chrome, so they live in `screen` below and
    // are added for hit-testing only (which is what makes them mouse-clickable).
    const gameplay = [];
    // Phase 6 moved the dive run-state (zone/boat/carried/weapons/…) into the reef
    // MiniGame, so the in-play touch buttons read it off `this._reef`, not the shell
    // (reading the shell here silently hid every gameplay button on touch — the P7
    // fix). `this.diver` stays: it is world-shimmed and shell-resolvable.
    const r = this._reef;
    if (this.input.isTouch && r) {
      if (this.state === 'playing' || this.state === 'paused') {
        gameplay.push({ id: 'pause', x: 300, y: 8, w: 46, h: 34 });
        gameplay.push({ id: 'mute', x: 352, y: 8, w: 46, h: 34 });
        gameplay.push({ id: 'music', x: 404, y: 8, w: 46, h: 34 });
      }
      if (this.state === 'playing' && r.zone === 'reef' &&
          r.boat.contains(this.diver) && r.canSail && r.carried === 0) {
        gameplay.push({ id: 'sail', x: W / 2 - 90, y: H - 80, w: 180, h: 40 });
      }
      if (this.state === 'playing') {
        // Primary FIRE button — enlarged for thumb reach at the bottom-right,
        // left of the weapon/flare/torch column. Tap = shot, hold = aim.
        gameplay.push({ id: 'aim', x: W - 142, y: H - 96, w: 72, h: 64 });
        if (r.weapons.length > 1) gameplay.push({ id: 'weapon', x: W - 66, y: H - 74, w: 52, h: 44 });
        if (r.flares > 0) gameplay.push({ id: 'flare', x: W - 66, y: H - 124, w: 52, h: 44 });
        if (r.hasTorch) gameplay.push({ id: 'torch', x: W - 66, y: H - 174, w: 52, h: 44 });
      }
      if (this.state === 'playing' && r.zone === 'stage') {
        gameplay.push({ id: 'jump', x: W - 96, y: H - 84, w: 72, h: 56 });
      }
      // A SHOP button: at the boat once the hold is empty (auto-banked), or at a
      // dive bell any time (the shop offers banking there).
      const onReef = this.state === 'playing' && r.zone === 'reef';
      const atBoatEmpty = onReef && r.carried === 0 && r.boat.contains(this.diver);
      const atAnyBell = onReef && r.bells.some((b) => b.contains(this.diver));
      if (atBoatEmpty || atAnyBell) gameplay.push({ id: 'shop', x: W / 2 - 60, y: H - 128, w: 120, h: 38 });
    }

    // Menu / screen UI buttons — clickable on BOTH mouse and touch (this is the
    // #47 fix: on desktop these had no hit-rects, so only the keys worked).
    const screen = [];
    if (this.state === 'menu' || this.state === 'gameover') {
      // Must match _menuButtons(): y=516, w=104, xs = cx-220 / cx-108 / cx+4 / cx+116.
      screen.push({ id: 'help', x: W / 2 - 220, y: 516, w: 104, h: 34 });
      screen.push({ id: 'drydock', x: W / 2 - 108, y: 516, w: 104, h: 34 });
      screen.push({ id: 'badges', x: W / 2 + 4, y: 516, w: 104, h: 34 });
      screen.push({ id: 'match3', x: W / 2 + 116, y: 516, w: 104, h: 34 });
      screen.push({ id: 'schemeNext', x: W / 2 - 150, y: 434, w: 320, h: 32 });
      if (availableSkips(this.meta).length) screen.push({ id: 'skipNext', x: W / 2 - 152, y: 358, w: 344, h: 28 });
    } else if (this.state === 'paused') {
      screen.push({ id: 'help', x: W / 2 - 66, y: 516, w: 132, h: 34 });
    }
    if (this.state === 'menu') screen.push(this._aboutLinkRect());   // corner "ⓘ version" link
    if (this.state === 'badges') {
      screen.push({ id: 'badgespage', x: W / 2 - 85, y: 520, w: 170, h: 26 });
      screen.push({ id: 'badgesclose', x: W / 2 - 85, y: 552, w: 170, h: 34 });
    }
    if (this.state === 'about') screen.push({ id: 'aboutclose', x: 0, y: 0, w: W, h: H });   // tap anywhere closes
    // The depth-warning modal (_warnScreen's "Tap to continue") has no button
    // chrome to hit on touch — without this rect a touch player could not
    // dismiss it at all (no gameplay buttons exist for 'warn', and main.js's
    // touchstart-anywhere shortcut only covers 'menu'/'gameover'), soft-locking
    // the run the first time oxygen/crush depth is crossed. Same tap-anywhere
    // pattern as 'aboutclose' just above.
    if (this.state === 'warn') screen.push({ id: 'warnclose', x: 0, y: 0, w: W, h: H });
    if (this.state === 'shop' && this._reef) {
      const items = this._reef._shopItems();   // shop is reef-owned (P6)
      items.forEach((it, i) => { const r = this._reef._shopRow(i); screen.push({ id: 'shop' + i, x: r.x, y: r.y, w: r.w, h: r.h }); });
    }
    if (this.state === 'drydock') {
      const rows = this._dryDockRows();
      rows.forEach((row, i) => {
        const r = this._ddRow(i); screen.push({ id: 'dd' + i, x: r.x, y: r.y, w: r.w, h: r.h });
        // A rented relic gets a small equip-chip touch target at its right edge.
        if (row.kind === 'relic' && row.dives > 0) screen.push({ id: 'ddeq' + i, x: r.x + r.w - 70, y: r.y, w: 70, h: r.h });
      });
    }
    if (this.state === 'help') {
      const r = this._helpRects(); screen.push(r.prev, r.next, r.close);
      if (HELP_PAGES[this.helpPage].id === 'controls') screen.push({ id: 'controls', x: W / 2 - 150, y: 162, w: 300, h: 30 });
    }

    this._touchBtns = gameplay;   // only the touch controls are drawn by _touchBtn
    // Hit-test list: touch gets everything (controls + screen); desktop gets the
    // screen buttons, so the mouse can click menu/help/shop/dry-dock/scheme.
    this.input.touchButtons = this.input.isTouch ? [...gameplay, ...screen] : screen;
  }

  // Draw one on-screen touch button with its icon/label.
  _touchBtn(b) {
    // The scheme selectors are invisible tap targets over their own menu/help
    // text — no button chrome, just a hit region.
    if (b.id === 'schemeNext' || b.id === 'controls' || b.id === 'skipNext') return;
    const ctx = this.ctx;
    const active = (b.id === 'pause' && this.state === 'paused') || (b.id === 'mute' && this.muted)
      || (b.id === 'music' && this._reef && this._reef.musicMuted) || b.id === 'sail'
      || (b.id === 'aim' && this.input._aimBtnActive) || (b.id === 'torch' && this.torchOn);
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
    } else if (b.id === 'music') {
      // Music mute is its own toggle, so it needs its own off-state signal —
      // a struck-through note, the same two-state idea as 🔊/🔇 next door. The
      // flag lives on the reef, not the shell (see the 'weapon' note below).
      const off = !!(this._reef && this._reef.musicMuted);
      this._text('🎵', cx, cy + 1, 16, PAL.hudText, 'center', 'middle');
      if (off) {
        ctx.save();
        ctx.strokeStyle = '#ff9a6b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 10, cy + 8); ctx.lineTo(cx + 10, cy - 8); ctx.stroke();
        ctx.restore();
      }
    } else if (b.id === 'sail') {
      this._text('⛵ SAIL ON', cx, cy + 1, 15, PAL.gold, 'center', 'middle', true);
    } else if (b.id === 'weapon') {
      // The dive run-state (incl. the current weapon) lives on the reef MiniGame,
      // not the shell — same reason _syncTouchButtons reads r.weapons off
      // this._reef. Reading this.weapon here (undefined on the shell) crashed the
      // render loop on touch devices with ≥2 weapons (ROG). Source it from the
      // reef, with a harpoon-glyph fallback so a bad key can never throw again.
      const wInfo = WEAPON_INFO[this._reef && this._reef.weapon];
      this._text(wInfo ? wInfo.glyph : '➤', cx, cy - 4, 17, PAL.harpoonTip, 'center', 'middle');
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
    // Help / Dry Dock / Badges buttons + prompt.
    this._menuButtons(cx);
    this._text(this.input.isTouch ? 'Tap 🛠 DRY DOCK for relics  ·  🎖 BADGES for trophies' : 'R = DRY DOCK (relics)  ·  B = BADGES (trophies)', cx, 505, 11, '#9fc6e0', 'center', 'middle');
    // "ⓘ version" link, bottom-right corner → opens the About screen.
    const al = this._aboutLinkRect();
    const ver = (this.aboutInfo && this.aboutInfo.app) || VERSION;
    this._text(`ⓘ v${ver} · about`, al.x + al.w, al.y + al.h / 2, 12, '#7fb0d0', 'right', 'middle');
  }

  // The shared three-button bar (Help / Dry Dock / Badges) on the menu and
  // game-over screens. Coordinates here MUST match the hit-rects registered in
  // _syncTouchButtons so both mouse and touch land on the same targets.
  _menuButtons(cx) {
    const ctx = this.ctx, y = 516, w = 104, h = 34;
    const xs = [cx - 220, cx - 108, cx + 4, cx + 116];   // help, drydock, badges, match3
    ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.7)'; ctx.strokeStyle = 'rgba(150,200,240,0.4)'; ctx.lineWidth = 1;
    for (const x of xs) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    this._text('❔ HELP (H)', xs[0] + w / 2, y + h / 2, 12, PAL.hudText, 'center', 'middle', true);
    this._text('🛠 DRY DOCK (R)', xs[1] + w / 2, y + h / 2, 11, PAL.gold, 'center', 'middle', true);
    this._text('🎖 BADGES (B)', xs[2] + w / 2, y + h / 2, 11, PAL.glow, 'center', 'middle', true);
    this._text('💰 CHEST (N)', xs[3] + w / 2, y + h / 2, 11, PAL.gold, 'center', 'middle', true);
  }

  // The small "ⓘ version" link in the menu's bottom-right corner. Single source
  // of geometry, shared by the draw (_menu) and the hit-rect (_syncTouchButtons)
  // so mouse + touch land on the same target.
  _aboutLinkRect() { return { id: 'about', x: W - 150, y: H - 30, w: 140, h: 22 }; }

  // Read-only About / versions overlay: engine (Core platform) + app/build, then
  // every registered minigame's version (from Core.versions(), injected as
  // this.aboutInfo in main.js). Opened by the corner link; any key/tap closes it.
  _aboutScreen() {
    const cx = W / 2;
    this._panel(0.92);
    const info = this.aboutInfo || { engine: '—', app: '—', build: '—', games: [] };
    this._text('ⓘ ABOUT', cx, 78, 30, PAL.gold, 'center', 'middle', true);
    this._text('DEEP DESCENT', cx, 120, 22, PAL.glow, 'center', 'middle', true);
    this._text("a modern homage to Durell's SCUBA DIVE (1983)", cx, 146, 12, '#9fc6e0', 'center', 'middle');

    let y = 196;
    this._text('ENGINE', cx, y, 13, '#7fb0d0', 'center', 'middle', true); y += 24;
    this._text(`Core Platform  v${info.engine}`, cx, y, 16, PAL.hudText, 'center', 'middle', true); y += 22;
    this._text(`app v${info.app}   ·   build ${info.build}`, cx, y, 12, '#bfe6ff', 'center', 'middle'); y += 44;

    this._text('MINIGAMES', cx, y, 13, '#7fb0d0', 'center', 'middle', true); y += 28;
    for (const gm of info.games) {
      this._text((gm.icon ? gm.icon + ' ' : '') + gm.name, cx - 12, y, 15, PAL.gold, 'right', 'middle', true);
      this._text(`v${gm.version}`, cx + 12, y, 15, PAL.hudText, 'left', 'middle');
      y += 26;
    }

    this._text(this.input.isTouch ? 'Tap to close' : 'Space / Esc to close', cx, H - 40, 13, '#9fc6e0', 'center', 'middle');
  }

  _gameOverScreen() {
    const cx = W / 2;
    this._panel();
    // Post-P6 the run summary lives on the reef MiniGame; the shell reads it back.
    const s = (this._reef && this._reef.finalStats()) || {};
    const title = s.won ? 'HAUL SECURED!' : s.deathCause === 'killed' ? 'YOU DIED' : s.deathCause === 'crushed' ? 'CRUSHED' : 'OUT OF AIR';
    this._text(title, cx, 220, 48, s.won ? PAL.gold : PAL.danger, 'center', 'middle', true);
    if (!s.won) {
      const sub = s.deathCause === 'killed' ? 'The wildlife got you' : s.deathCause === 'crushed' ? 'The pressure took you' : 'You ran out of air';
      this._text(sub, cx, 256, 15, '#ff9a6b', 'center', 'middle');
    }
    this._text(`SCORE ${s.score || 0}`, cx, 290, 30, PAL.hudText, 'center', 'middle');
    this._text(`DEEPEST ${Math.round((s.depthReached || 0) / 10)} m`, cx, 326, 16, '#bfe6ff', 'center', 'middle');
    if (s.newHi) this._text(`★ NEW BEST · REEF ${s.reef} ★`, cx, 360, 20, PAL.glow, 'center', 'middle', true);
    else this._text(`BEST ${this.hi} · REEF ${this.hiReef}`, cx, 360, 16, '#bfe6ff', 'center', 'middle');
    if (s.lastPayout != null) {
      const pearlNote = s.blackPearlsBanked > 0 ? `  ·  ${s.blackPearlsBanked} pearl${s.blackPearlsBanked === 1 ? '' : 's'}` : '';
      this._text(`⚙ SALVAGE +${s.lastPayout}  ·  ${this.meta.salvage} banked${pearlNote}`, cx, 394, 15, PAL.gold, 'center', 'middle');
    }
    // New badges earned this run — a bright callout so the unlock lands.
    let cy = 420;
    if (s.newBadges && s.newBadges.length) {
      const glyphs = s.newBadges.map((id) => BADGE_BY_ID[id] && BADGE_BY_ID[id].glyph).filter(Boolean).join(' ');
      const names = s.newBadges.map((id) => BADGE_BY_ID[id] && BADGE_BY_ID[id].name).filter(Boolean).join(', ');
      this._text(`🎖 NEW BADGE${s.newBadges.length > 1 ? 'S' : ''}: ${glyphs}`, cx, cy, 17, PAL.glow, 'center', 'middle', true);
      this._text(names, cx, cy + 20, 13, '#bfe6ff', 'center', 'middle');
      cy += 38;
    }
    // Progressive tiers crossed this run.
    if (s.newTiers && s.newTiers.length) {
      this._text(`⭐ ${s.newTiers.join('   ')}`, cx, cy, 14, PAL.gold, 'center', 'middle', true);
      cy += 24;
    }
    // Relic rentals that ran out this dive (auto-benched) — nudge to renew.
    if (s.lapsedRentals && s.lapsedRentals.length) {
      const names = s.lapsedRentals.map((id) => getRelic(id) && getRelic(id).name).filter(Boolean).join(', ');
      this._text(`⚙ ${names} rental${s.lapsedRentals.length > 1 ? 's' : ''} expired`, cx, cy, 13, '#ff9a6b', 'center', 'middle');
    }
    const blink = Math.floor(((this._reef && this._reef.t) || 0) * 2) % 2 === 0;
    if (blink) this._text('PRESS SPACE / TAP TO DIVE AGAIN', cx, 470, 20, PAL.gold, 'center', 'middle', true);
    this._text(this.input.isTouch ? '🛠 DRY DOCK for relics  ·  🎖 BADGES for trophies' : 'R = DRY DOCK  ·  B = BADGES', cx, 500, 12, '#9fc6e0', 'center', 'middle');
    this._menuButtons(cx);
  }

  // The Trophy Wall — a two-column grid of every badge, earned ones lit and
  // locked ones dimmed behind a padlock (with their unlock hint still shown, so
  // players have something to chase). A rank line summarises progress.
  // Format a lifetime stat value for display, per its track unit.
  _fmtStat(v, unit) {
    v = Math.round(v);
    if (unit === 'time') {
      const h = (v / 3600) | 0, m = ((v % 3600) / 60) | 0;
      return h > 0 ? `${h}h${m}m` : (m > 0 ? `${m}m` : `${v}s`);
    }
    if (unit === 'm') return `${v} m`;
    if (unit === 'gold') return `${v}g`;
    return `${v}`;
  }

  _badgesScreen() {
    const ctx = this.ctx, cx = W / 2;
    this._panel(0.9);
    const earned = new Set(this.badgeState.earned);
    const rank = rankFor(earned.size);
    this._text('🎖 THE TROPHY WALL', cx, 70, 30, PAL.gold, 'center', 'middle', true);

    if (!this.bdPage) {
      this._text(`${rank.name}  ·  ${earned.size} / ${BADGES.length} badges`, cx, 108, 16, PAL.glow, 'center', 'middle', true);
      const cols = 2, cellW = 400, gap = 24;
      const gridW = cols * cellW + (cols - 1) * gap, x0 = cx - gridW / 2;
      const top = 140, rowsN = Math.ceil(BADGES.length / cols);
      const step = Math.min(54, (508 - top) / rowsN), ch = step - 6;
      BADGES.forEach((b, i) => {
        const col = i % cols, row = (i / cols) | 0;
        const x = x0 + col * (cellW + gap), y = top + row * step;
        const has = earned.has(b.id);
        ctx.save();
        ctx.fillStyle = has ? 'rgba(36,78,58,0.5)' : 'rgba(20,32,48,0.45)';
        ctx.strokeStyle = has ? 'rgba(120,230,170,0.5)' : 'rgba(120,160,200,0.18)';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, cellW, ch, 8); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.globalAlpha = has ? 1 : 0.55;
        this._text(has ? b.glyph : '🔒', x + 26, y + ch / 2, 22, PAL.hudText, 'center', 'middle');
        this._text(b.name, x + 52, y + 16, 15, has ? PAL.gold : '#9fb8cc', 'left', 'middle', true);
        this._text(b.desc, x + 52, y + 34, 11, has ? '#cfe6d8' : '#7f97ac', 'left', 'middle');
        ctx.globalAlpha = 1;
      });
    } else {
      const life = this.statState, prog = new Set(this.progressState.earned);
      const tiersEarned = prog.size;
      this._text(`PROGRESSIVE  ·  ${tiersEarned} / ${TRACKS.length * 3} tiers`, cx, 108, 16, PAL.glow, 'center', 'middle', true);
      const cols = 2, cellW = 400, gap = 24;
      const gridW = cols * cellW + (cols - 1) * gap, x0 = cx - gridW / 2;
      const top = 140, rowsN = Math.ceil(TRACKS.length / cols);
      const step = Math.min(74, (508 - top) / rowsN), ch = step - 8;
      TRACKS.forEach((tr, i) => {
        const col = i % cols, row = (i / cols) | 0;
        const x = x0 + col * (cellW + gap), y = top + row * step;
        const p = trackProgress(life, tr);
        const started = p.reached > 0;
        ctx.save();
        ctx.fillStyle = p.reached === p.max ? 'rgba(48,66,30,0.55)' : (started ? 'rgba(30,52,70,0.5)' : 'rgba(20,32,48,0.42)');
        ctx.strokeStyle = p.reached === p.max ? 'rgba(230,200,110,0.55)' : 'rgba(120,160,200,0.22)';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, cellW, ch, 8); ctx.fill(); ctx.stroke(); ctx.restore();
        this._text(tr.glyph, x + 26, y + 22, 20, PAL.hudText, 'center', 'middle');
        this._text(tr.label, x + 50, y + 15, 14, PAL.gold, 'left', 'middle', true);
        // tier pips ●●○
        for (let t = 0; t < p.max; t++) {
          this._text(t < p.reached ? '●' : '○', x + cellW - 66 + t * 18, y + 15, 13, t < p.reached ? PAL.gold : '#6f879c', 'center', 'middle');
        }
        // progress bar toward the next tier (or full at MAX)
        const prev = p.reached > 0 ? tr.tiers[p.reached - 1] : 0;
        const frac = p.next === null ? 1 : Math.max(0, Math.min(1, (p.have - prev) / (p.next - prev)));
        const bx = x + 50, bw = cellW - 66, by = y + ch - 16, bh = 6;
        ctx.save();
        ctx.fillStyle = 'rgba(10,24,40,0.8)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill();
        ctx.fillStyle = p.next === null ? PAL.gold : PAL.glow; ctx.beginPath(); ctx.roundRect(bx, by, bw * frac, bh, 3); ctx.fill();
        ctx.restore();
        const label = p.next === null ? `MAX · ${this._fmtStat(p.have, tr.unit)}` : `${this._fmtStat(p.have, tr.unit)} / ${this._fmtStat(p.next, tr.unit)}`;
        this._text(label, x + cellW - 12, y + ch - 26, 11, '#bfe6ff', 'right', 'middle');
      });
    }

    // Page toggle + close.
    const pw = 170, ph = 26, px = cx - pw / 2, py = 520;
    ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.7)'; ctx.strokeStyle = 'rgba(150,200,240,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    this._text(this.bdPage ? '◂ BADGES' : 'PROGRESSIVE ▸', cx, py + ph / 2, 13, PAL.hudText, 'center', 'middle', true);
    const bw = 170, bh = 34, bx = cx - bw / 2, by = 552;
    ctx.save(); ctx.fillStyle = 'rgba(10,30,50,0.7)'; ctx.strokeStyle = 'rgba(150,200,240,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke(); ctx.restore();
    this._text(this.input.isTouch ? 'CLOSE' : 'CLOSE  (B)', cx, by + bh / 2, 14, PAL.hudText, 'center', 'middle', true);
  }

  // Canvas-chrome primitives now live in render/chrome.js (Phase 7 dedup) — these
  // stay as thin forwarders so every this._text(...) call-site is byte-identical.
  _overlay(title, sub) { overlay(this.ctx, title, sub); }
  _panel(alpha = 0.55) { panel(this.ctx, alpha); }
  _keycap(label, x, y) { keycap(this.ctx, label, x, y); }
  _text(str, x, y, size, color, align = 'left', base = 'alphabetic', bold = false) {
    text(this.ctx, str, x, y, size, color, align, base, bold);
  }
}