// The Whirlpool — the first reef zone extracted as its own MiniGame (Phase 4 of
// the platform migration; see docs/platform/migration-plan.md). A survival sweep
// down an accelerating shaft: a forced downward current owns vertical motion, the
// player only steers laterally to dodge obstacles, and three exits (an obstacle
// hit through all hull lives, air-out, or a bail-out at the top maw) all bank the
// ride's score/loot and return to the reef. It NEVER costs a run-life, by design.
//
// SHAPE: it is a MiniGame (`id`/`enter`/`update`/`render`/`exit`) but a *nested,
// reef-driven* one — entered mid-dive FROM the reef, not booted by the Core. The
// reef (still the legacy monolith until P6) constructs it once and delegates its
// `_updateWhirlpool`/`_draw`/enter/exit seams here.
//
// BOUNDARY:
//   host.world     — diver/camX/camY/air/airMax/placeDiver (engine-owned, P3).
//   host.economy   — earn({salvage}) for speed-break tier payouts (was the inline
//                    `meta.salvage += r; saveSalvage`).
//   host.audio/particles/input, host.viewport (live W/H/WW/WH).
//   reef           — an explicit facade for the reef-owned surface the whirlpool
//                    still touches (loot piles, fx, snapshot/restore, HUD helpers).
//                    This is the remaining coupling P6 narrows when the reef itself
//                    becomes a MiniGame. See the migration plan's Phase 4 design.
//
// The `whirlEntrance` stays reef-owned (a reef portal): the reef rolls, detects,
// draws and hints it; it hands the entrance to `enter()` and the module clears it
// on `exit()` (a plundered portal is spent).

import { WHIRL, whirlpoolReward, PAL, BUBBLE, DIVER, WORLD } from '../../config.js';
import { Treasure } from '../../entities/treasure.js';
import { drawWhirlMaw } from '../../render/props.js';

/**
 * @param {Object} deps
 * @param {import('../../core/contract.js').Host} deps.host  Shared services;
 *   requires the opt-in `world` capability + `economy`.
 * @param {Object} deps.reef  The reef facade (reef-owned state + verbs the
 *   whirlpool touches). Currently backed by the legacy Game.
 * @returns {import('../../core/contract.js').MiniGame}
 */
export function makeWhirlpool({ host, reef }) {
  return {
    id: 'whirlpool',

    // --- owned state (armed by generate(), reset by exit()) ---
    shaft: null, bailMaw: null,
    obstacles: [], bubbles: [], treasures: [],
    speed: 0, rideScore: 0, tier: 0, salvageEarned: 0,
    elapsed: 0, hitT: 0, lives: 0,
    nextObstacleY: 0, nextBubbleY: 0, nextTreasureY: 0, treasuresSeeded: 0,

    // Build the endless shaft: a fixed-width vertical column the diver is swept
    // down, with a bail-out maw at the top. Obstacles + collectibles are STREAMED
    // ahead at run time (see update()), so generate just arms the cursors.
    generate() {
      const { WW } = host.viewport;
      const cx = WW / 2, halfW = WHIRL.shaftHalfW;
      const top = WORLD.OPEN_BAND;
      this.shaft = { cx, halfW, top };   // endless: no fixed bottom
      this.obstacles = []; this.bubbles = []; this.treasures = [];
      this.elapsed = 0;                                 // seconds swept (density ramp)
      this.nextObstacleY = top + WHIRL.safeDrop;        // obstacles begin below the safe drop-in
      this.nextBubbleY = top + WHIRL.safeDrop + 120;
      this.nextTreasureY = top + WHIRL.safeDrop + 60;
      this.treasuresSeeded = 0;                         // for the periodic Black Pearl
      this.lives = WHIRL.lives;                         // hull hits survived before the sweep ends
      this.hitT = 0;                                    // i-frame timer after a hit
      this.bailMaw = { x: cx, y: top - 6, r: 46 };
    },

    // Spawn one row of obstacles at world-y `y`. `ramp` (0→1) tightens rows and
    // adds obstacles as the run wears on.
    spawnRow(y, ramp) {
      const s = this.shaft, usable = s.halfW - 12;
      const count = 1 + Math.round(ramp * (WHIRL.rowCountMax - 1));   // 1 → rowCountMax
      const kinds = ['mine', 'jelly', 'star'];
      for (let n = 0; n < count; n++) {
        const r = WHIRL.obstacleR * (0.8 + Math.random() * 0.5);
        const x = s.cx + (Math.random() * 2 - 1) * (usable - r);
        const kind = kinds[(Math.random() * kinds.length) | 0];
        this.obstacles.push({ x, y: y + (Math.random() - 0.5) * 90, r, kind, phase: Math.random() * Math.PI * 2 });
      }
    },
    randX(r) { const s = this.shaft; return s.cx + (Math.random() * 2 - 1) * (s.halfW - r - 12); },

    // Register one obstacle hit: drop the struck rock, spend a hull life, start
    // i-frames, flash. Returns true when that was the last life (caller banks +
    // exits). Never costs a real run-life.
    hit(i) {
      this.obstacles.splice(i, 1);
      this.lives -= 1; this.hitT = WHIRL.hitInvuln;
      reef.shake = 12; reef.flash = 0.6; host.audio.hit();
      if (this.lives <= 0) return true;
      reef.toast(`💥 HULL HIT — ${this.lives} left`, PAL.danger, 1.1);
      return false;
    },

    // Dive the maw: snapshot the reef, build the shaft, drop the diver just below
    // the bail-out exit. The ramping sweep is the whole danger — no life at stake.
    enter(entrance) {
      reef.snapshotReef(entrance.x, entrance.y + 50);
      reef.zone = 'whirlpool';
      this.generate();
      host.world.placeDiver(this.bailMaw.x, this.bailMaw.y + 90, 0);
      this.speed = WHIRL.baseSpeed;
      this.rideScore = 0; this.tier = 0; this.salvageEarned = 0;
      reef.shake = 10; reef.zoneFade = 1;
      host.audio.gasp();
    },

    // Leave the whirlpool (obstacle-out, air-out, or bail). Restores the reef and
    // consumes the entrance; resets the zone-local state so nothing leaks into the
    // next run. NEVER pairs with a run-life loss.
    exit() {
      reef.restoreReef();
      reef.whirlEntrance = null;
      this.speed = 0; this.rideScore = 0; this.obstacles = []; this.shaft = null;
      this.tier = 0; this.salvageEarned = 0; this.bubbles = []; this.treasures = [];
      return { outcome: 'ended', credited: true };   // self-credited during play
    },

    update(dt) {
      const world = host.world, d = world.diver, shaft = this.shaft;
      const { W, H, WW, WH } = host.viewport;
      // The sweep ramps forever (capped at maxSpeed) — it never gets easier.
      this.speed = Math.min(WHIRL.maxSpeed, this.speed + WHIRL.accel * dt);
      this.elapsed += dt;
      this.hitT = Math.max(0, this.hitT - dt);

      // Endless streaming: spawn obstacles + collectibles ahead of the diver at a
      // density ramping over WHIRL.rampSecs, recycling anything scrolled above.
      const ramp = Math.min(1, this.elapsed / WHIRL.rampSecs);
      const rowGap = WHIRL.rowGapStart + (WHIRL.rowGapEnd - WHIRL.rowGapStart) * ramp;
      const ahead = d.y + H * 1.4;
      while (this.nextObstacleY < ahead) { this.spawnRow(this.nextObstacleY, ramp); this.nextObstacleY += rowGap; }
      while (this.nextBubbleY < ahead) {
        this.bubbles.push({ x: this.randX(BUBBLE.r), y: this.nextBubbleY, r: BUBBLE.r, taken: false, phase: Math.random() * Math.PI * 2 });
        this.nextBubbleY += WHIRL.bubbleGap * (0.7 + Math.random() * 0.6);
      }
      while (this.nextTreasureY < ahead) {
        const n = ++this.treasuresSeeded;
        const kind = (n % WHIRL.pearlEvery === 0) ? 'blackpearl' : (Math.random() < 0.5 ? 'gem' : 'coin');
        this.treasures.push(new Treasure(this.randX(14), this.nextTreasureY, kind));
        this.nextTreasureY += WHIRL.treasureGap * (0.7 + Math.random() * 0.6);
      }
      const above = d.y - H;   // recycle everything scrolled off the top
      this.obstacles = this.obstacles.filter((o) => o.y > above);
      this.bubbles = this.bubbles.filter((b) => !b.taken && b.y > above);
      this.treasures = this.treasures.filter((t) => !t.taken && t.y > above);

      // Lateral steering only — vertical speed is the current's, not physics'.
      const v = host.input.vector();
      d.vx += v.x * DIVER.accel * dt;
      d.vx *= Math.max(0, 1 - DIVER.drag * dt);
      if (d.vx > DIVER.maxSpeed) d.vx = DIVER.maxSpeed; else if (d.vx < -DIVER.maxSpeed) d.vx = -DIVER.maxSpeed;
      d.vy = this.speed;
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      // Clamp to the shaft walls — a soft bump (kills lateral speed), not a bounce.
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
      world.camX += (tx - world.camX) * Math.min(1, dt * 6);
      world.camY += (ty - world.camY) * Math.min(1, dt * 6);
      reef.depthReached = Math.max(reef.depthReached, d.y - WORLD.SURFACE);

      // Air drains at a fixed whirlpool rate (depth is unbounded, so the old
      // depth-scaled drain can't apply). Bubbles refill. No zone penalty.
      world.air -= WHIRL.airDrain * dt;

      // Survival score: speed × time, so riding it faster/longer is worth more.
      this.rideScore += this.speed * dt * 0.12;

      // Collect while dodging: bubbles refill air, loot/pearls go to the same
      // carried/carriedPearls piles the reef uses — cashed on exit by bank().
      for (const b of this.bubbles) {
        if (!b.taken && Math.hypot(d.x - b.x, d.y - b.y) < b.r + d.radius) {
          b.taken = true;
          world.air = Math.min(world.airMax, world.air + BUBBLE.air);
          host.particles.sparkle(b.x, b.y, PAL.air, 12);
          host.audio.refill();
        }
      }
      for (const tr of this.treasures) {
        if (tr.taken) continue;
        tr.update(dt, reef.t);
        if (!tr.reached(d)) continue;
        tr.taken = true;
        if (tr.pearl) {
          reef.carriedPearls = (reef.carriedPearls || 0) + 1;
          host.particles.sparkle(tr.x, tr.y, PAL.blackPearlSheen, 22);
          host.audio.blackpearl();
        } else {
          reef.carried += tr.value;
          host.particles.sparkle(tr.x, tr.y, tr.kind === 'gem' ? PAL.gem : PAL.gold, tr.kind === 'coin' ? 12 : 18);
          tr.kind === 'gem' ? host.audio.gem() : host.audio.pickup();
        }
      }

      // Speed-break tiers: crossing a speed threshold awards Salvage + score once
      // per tier — the `while` (not `if`) means a multi-tier dt spike still awards
      // each tier once. Tiers count speed ABOVE the base sweep, so tier 1 requires
      // actually accelerating into the vortex.
      const tier = this.speed <= WHIRL.baseSpeed ? 0 : Math.floor((this.speed - WHIRL.baseSpeed) / WHIRL.tierStep) + 1;
      while (tier > this.tier) {
        this.tier += 1;
        const r = whirlpoolReward(this.tier) - whirlpoolReward(this.tier - 1);   // marginal award for THIS tier
        host.economy.earn({ salvage: r });
        this.salvageEarned += r;
        reef.score += WHIRL.tierScore;
        reef.toast(`SPEED ${this.tier} · +${r}⚙`, PAL.gateGlow, 1.4);
        host.audio.bank();
      }

      // Every exit banks rideScore + collected loot and hands back a small air
      // floor before restoring the reef — "no life lost" must hold in practice:
      // the shared reef drain path would otherwise see air<=0 next frame and cost
      // a life there. 20 is enough to swim for safety, nothing more.
      const bank = () => {
        reef.score += Math.round(this.rideScore);
        world.air = Math.max(world.air, 20);
        const tierReached = this.tier, earned = this.salvageEarned;
        reef.bankLoot(1);   // cash collected loot + pearls -> score/gold/Salvage, at full rate
        reef.toast(`SURVIVED · SPEED ${tierReached} · +${earned}⚙`, PAL.gateGlow, 2.2);
      };

      // Obstacle contact costs a hull life; the run ends only when they run out.
      // I-frames after a hit so one rock can't drain several lives; the struck
      // obstacle is removed so you're not re-hit while passing through.
      if (this.hitT <= 0) {
        for (let i = 0; i < this.obstacles.length; i++) {
          const o = this.obstacles[i];
          if (Math.hypot(d.x - o.x, d.y - o.y) < o.r + d.radius) {
            if (this.hit(i)) { bank(); this.exit(); return; }
            break;
          }
        }
      }
      // Air-out ends the run the same way — never a life.
      if (world.air <= 0) { world.air = 0; bank(); this.exit(); return; }
      // Bail at the top exit (swim back up against the current) — a clean escape.
      const e = this.bailMaw;
      if (e && Math.hypot(d.x - e.x, d.y - e.y) < e.r + d.radius) { bank(); this.exit(); return; }
    },

    // The whirlpool's own scene: shaft walls, churning backdrop, streamed
    // collectibles + obstacles, the bail-out maw, and the swept diver. Generic
    // chrome (pause/gameover/touch/flourish) is delegated to reef.drawChrome().
    render(ctx) {
      const world = host.world, { W, H, WH } = host.viewport;
      ctx.save();
      if (reef.shake > 0.2) ctx.translate((Math.random() - 0.5) * reef.shake, (Math.random() - 0.5) * reef.shake);
      const cx = world.camX, cy = world.camY;
      const depthT = Math.min(1, cy / WH);
      reef.bg.draw(ctx, cx, cy, reef.t, depthT);
      ctx.fillStyle = `rgba(20,70,80,${0.16 + 0.14 * depthT})`; ctx.fillRect(0, 0, W, H);

      const shaft = this.shaft;
      if (shaft) {
        const leftX = shaft.cx - shaft.halfW - cx, rightX = shaft.cx + shaft.halfW - cx;
        ctx.fillStyle = PAL.whirlRock;
        ctx.fillRect(leftX - 60, 0, 60, H);
        ctx.fillRect(rightX, 0, 60, H);
        ctx.strokeStyle = 'rgba(46,230,200,0.4)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(leftX, 0); ctx.lineTo(leftX, H); ctx.moveTo(rightX, 0); ctx.lineTo(rightX, H); ctx.stroke();
      }
      // Swirl streaks — a churning-current backdrop; scrolls faster the higher the
      // sweep speed, so it reads as accelerating.
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = PAL.whirlRim; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const yy = ((reef.t * (140 + this.speed * 0.6) + i * 160) % (H + 160)) - 80;
        ctx.beginPath(); ctx.ellipse(W / 2, yy, shaft ? shaft.halfW * 0.7 : 150, 22, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // Collectibles — bubbles for air, loot/pearls for the Salvage payoff.
      for (const b of this.bubbles) {
        if (b.taken) continue;
        const bx = b.x - cx, by = b.y - cy;
        if (bx < -60 || bx > W + 60 || by < -60 || by > H + 60) continue;
        const wob = Math.sin(reef.t * 2.5 + b.phase) * 1.5;
        ctx.save();
        ctx.strokeStyle = 'rgba(190,235,255,0.8)'; ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(150,220,255,0.18)';
        ctx.beginPath(); ctx.ellipse(bx, by, b.r + wob, b.r - wob, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx - b.r * 0.32, by - b.r * 0.32, b.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
        ctx.restore();
      }
      for (const tr of this.treasures) {
        if (tr.taken) continue;
        const tx = tr.x - cx, ty = tr.y - cy;
        if (tx < -60 || tx > W + 60 || ty < -60 || ty > H + 60) continue;
        tr.draw(ctx, cx, cy, reef.t);
      }
      // Obstacles — landmines, jellyfish, starfish (random per obstacle).
      for (const o of this.obstacles) {
        const ox = o.x - cx, oy = o.y - cy;
        if (ox < -60 || ox > W + 60 || oy < -60 || oy > H + 60) continue;
        ctx.save(); ctx.translate(ox, oy);
        this.drawObstacle(ctx, o, reef.t);
        ctx.restore();
      }
      // Bail-out exit near the top.
      if (this.bailMaw) { ctx.save(); ctx.translate(this.bailMaw.x - cx, this.bailMaw.y - cy); drawWhirlMaw(ctx, reef.t, this.bailMaw.r); ctx.restore(); }

      host.particles.draw(ctx, cx, cy);
      if (reef.state !== 'menu') world.diver.draw(ctx, cx, cy, false, 0);
      if (depthT > 0.02) { ctx.fillStyle = `rgba(2,7,15,${0.5 * depthT})`; ctx.fillRect(0, 0, W, H); }
      if (reef.flash > 0.01) { ctx.fillStyle = `rgba(255,40,40,${0.35 * reef.flash})`; ctx.fillRect(0, 0, W, H); }
      if (reef.zoneFade > 0.01) { ctx.fillStyle = `rgba(120,180,220,${0.7 * reef.zoneFade})`; ctx.fillRect(0, 0, W, H); }
      ctx.restore();

      if (reef.state === 'playing' || reef.state === 'paused') this.hud(ctx);
      reef.drawChrome();   // puFlourish + pause overlay + gameover + touch buttons
    },

    // Minimal HUD for the sweep — air + score + hull lives + the survival banner.
    hud(ctx) {
      const world = host.world, { W, H } = host.viewport;
      const g = ctx.createLinearGradient(0, 0, 0, 70);
      g.addColorStop(0, 'rgba(4,14,20,0.55)'); g.addColorStop(1, 'rgba(4,14,20,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);

      const bx = 20, by = 20, bw = 240, bh = 18;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.fill();
      const frac = world.air / world.airMax;
      const low = frac < 0.25;
      ctx.fillStyle = low && Math.floor(reef.t * 6) % 2 === 0 ? PAL.airLow : (low ? '#ff9a6b' : PAL.air);
      ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * frac), bh, 9); ctx.fill();
      reef.text('AIR', bx, by - 6, 12, PAL.hudText, 'left', 'bottom');
      reef.text(`${Math.round(world.air)}`, bx + bw + 8, by + bh / 2, 13, PAL.hudText, 'left', 'middle');

      // Hull lives — filled ♥ for remaining, hollow ♡ for spent.
      const lives = this.lives != null ? this.lives : WHIRL.lives;
      const hearts = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, WHIRL.lives - lives));
      reef.text(`HULL ${hearts}`, bx, by + bh + 12, 15, this.hitT > 0 ? PAL.danger : PAL.gold, 'left', 'middle', true);

      reef.text(`SCORE ${reef.score}`, W - 20, 22, 18, PAL.hudText, 'right', 'top');
      reef.text(`+${Math.round(this.rideScore)} this ride`, W - 20, 46, 14, PAL.whirlRim, 'right', 'top');
      reef.text(`HI ${reef.hi}`, W / 2, 22, 14, '#bfe6ff', 'center', 'top');

      // The payoff building: speed tier, Salvage earned this ride, carried loot.
      reef.text(`TIER ${this.tier}`, W - 20, 68, 14, PAL.gateGlow, 'right', 'top');
      reef.text(`⚙ +${this.salvageEarned} this ride`, W - 20, 88, 13, PAL.whirlRim, 'right', 'top');
      if (reef.carried > 0 || reef.carriedPearls > 0) {
        const pearlBit = reef.carriedPearls > 0 ? `  ◦${reef.carriedPearls}` : '';
        reef.text(`LOOT +${reef.carried}${pearlBit}`, W - 20, 108, 13, PAL.gold, 'right', 'top');
      }

      reef.text(`🌀 WHIRLPOOL — SPEED ${Math.round(this.speed)} — survive the rocks! (costs no run-life)`, W / 2, H - 30, 15, PAL.whirlRim, 'center', 'middle', true);
      reef.text('◀ ▶ steer — dodge the rocks, or ride back up to the maw to bail out', W / 2, H - 8, 12, 'rgba(200,240,235,0.75)', 'center', 'middle');
    },

    // Draw a whirlpool obstacle (centred at 0,0) by kind: landmine / jellyfish /
    // starfish. Collision is the plain circle radius o.r regardless of kind.
    drawObstacle(ctx, o, t) {
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
    },
  };
}
