// @ts-check
// The Platformer Stage — the second reef zone extracted as its own MiniGame
// (Phase 5; see docs/platform/migration-plan.md). A themed, single-screen
// platformer minigame reached through a reef entrance: on foot under gravity,
// walk/jump/climb ladders through procedurally-generated rooms to a loot cache,
// then exit back to the reef. Air is sealed in-stage; a hit/fall costs a run-life
// and respawns at the room start; only reaching the forward exit completes it.
//
// SHAPE: like the whirlpool (P4), a nested, reef-driven MiniGame (id/enter/update/
// render/exit) — entered mid-dive from the reef, not Core.boot-ed (the reef is the
// legacy monolith until P6). It wraps the already-modular `Stage` engine
// (src/stage/stage.js) + its chunk/decor generators + the stage renderer.
//
// BOUNDARY:
//   host.world     — camera (zeroed for the fixed single-screen view) + air/airMax
//                    (read for the HUD); the diver world is engine-owned (P3).
//   host.input/audio/particles, host.viewport (live W/H).
//   reef           — the reef-owned surface the stage still touches: the carried
//                    loot pile, run score/lives/fx, snapshot/restore, `_loseLife`
//                    (the stage DOES cost run-lives, unlike the whirlpool), the
//                    reef-owned `stageEntrances` portals (consumed one-shot on
//                    exit), `_fireGrace`, and the control scheme for the HUD hint.
//                    This is the coupling P6 narrows when the reef becomes a
//                    MiniGame. See the Phase 5 design in the migration plan.
//
// `stageEntrances` stay reef-owned portals (rolled/detected/drawn by the reef);
// the reef hands one to `enter(entrance)` and the module consumes it on `exit()`.

import { STAGE, PAL } from '../../config.js';
import { Stage } from '../../stage/stage.js';
import { makeStageRooms, makeStageDecor, mulberry32 } from '../../stage/chunkgen.js';
import { drawStageScene, drawStageHud } from '../../render/stage.js';
import { stageHintStrip } from '../../controls.js';

/**
 * @param {Object} deps
 * @param {import('../../core/contract.js').Host} deps.host  Shared services;
 *   requires the opt-in `world` capability.
 * @param {Object} deps.reef  The reef facade (reef-owned state + verbs the stage
 *   touches). Currently backed by the legacy Game.
 * @returns {import('../../core/contract.js').MiniGame}
 */
export function makeStage({ host, reef }) {
  // Assigned to a local (not returned inline) so `this` inside the methods infers
  // the module's FULL shape — its zone-local state + private helpers — instead of
  // being contextually narrowed to the bare MiniGame contract. `return mod` below
  // still verifies the module satisfies MiniGame. See docs/platform (Phase 8 types).
  const mod = {
    id: 'stage',

    // --- owned state ---
    stage: null,            // the Stage engine instance (null outside the zone)
    enteredEntrance: null,  // the reef portal we came in through (consumed on exit)
    upPrev: false,          // rising-edge tracker for the jump-on-up-press

    // Enter a themed platformer stage through a reef entrance. Snapshots the reef,
    // builds the rooms + decor (separate seed streams so decor never perturbs room
    // reproducibility), seals into the fixed single-screen camera.
    enter(entrance) {
      reef.snapshotReef(entrance.x, entrance.y + STAGE.entranceR + 10);
      this.enteredEntrance = entrance;
      reef.zone = 'stage';
      const seed = (Math.random() * 0x100000000) >>> 0;
      const rooms = makeStageRooms(entrance.theme, reef.reefNum, mulberry32(seed));
      const decor = makeStageDecor(entrance.theme, rooms, mulberry32((seed ^ 0x9e3779b9) >>> 0), STAGE.decorPerRoom);
      this.stage = new Stage({ ...entrance.theme, rooms, decor });
      host.world.camX = 0; host.world.camY = 0;   // fixed single-screen camera in-stage
      reef.shake = 8; reef.zoneFade = 1;
      host.audio.select();
    },

    // Drive the stage: translate Input → command, apply loot/death/exit events.
    update(dt) {
      const inp = host.input;
      const v = inp.vector();
      const up = v.y < -0.4, down = v.y > 0.4;
      const moveX = Math.abs(v.x) > 0.3 ? (v.x > 0 ? 1 : -1) : 0;
      const climbY = up ? -1 : down ? 1 : 0;
      // Jump edge: fresh up-press (rising edge), fire press (Space/F/A), tap, or JUMP button.
      const jump = (up && !this.upPrev) || inp.firePress || inp.consumeTapFire() || inp.consumeButton('jump');
      this.upPrev = up;

      const ev = this.stage.update(dt, { moveX, jump, climbY });
      if (ev.loot) {
        reef.carried += ev.loot;
        host.particles.sparkle(this.stage.body.x, this.stage.body.y, PAL.gold, 16);
        host.audio.pearl();
      }
      if (ev.died) {
        reef.flash = 1; reef.shake = 12; host.audio.hit();
        reef.loseLife('killed');
        if (reef.state === 'playing') this.stage.respawn();   // still alive → back to room start
      }
      // No backing out: only reaching the forward exit completes the stage and
      // returns to the reef (the engine emits no 'retreat' — commit-and-finish).
      if (ev.exited === 'complete') this.exit();
    },

    render(ctx) {
      const { W, H } = host.viewport;
      ctx.save();
      if (reef.shake > 0.2) ctx.translate((Math.random() - 0.5) * reef.shake, (Math.random() - 0.5) * reef.shake);
      drawStageScene(ctx, this.stage, reef.t);
      ctx.restore();
      if (reef.flash > 0.01) { ctx.fillStyle = `rgba(255,40,40,${0.35 * reef.flash})`; ctx.fillRect(0, 0, W, H); }
      if (reef.zoneFade > 0.01) { ctx.fillStyle = `rgba(120,180,220,${0.7 * reef.zoneFade})`; ctx.fillRect(0, 0, W, H); }
      drawStageHud(ctx, this.stage, {
        air: host.world.air, airMax: host.world.airMax,
        lives: reef.lives, score: reef.score, carried: reef.carried,
        hint: stageHintStrip(reef.controlScheme),
      });
      reef.drawChrome();   // touch buttons + pause overlay + gameover screen
    },

    // Leave the stage on completion. Restores the reef and consumes the entrance
    // (one-shot), mirroring how the whale/temple spend their entrances.
    exit() {
      reef.restoreReef();
      reef.consumeStageEntrance(this.enteredEntrance);
      this.enteredEntrance = null;
      this.stage = null;
      reef.fireGrace = 0.3;   // the exit/jump press shouldn't fire a harpoon back in the reef
      return { outcome: 'complete', credited: true };   // loot self-banks via the reef carried pile
    },
  };
  return mod;
}
