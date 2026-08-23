// The DiverWorld engine — the shared "diver world" the diver-world minigames
// ride. Slice 1 (see docs/superpowers/specs/2026-08-22-diverworld-engine-slice1-
// design.md) owns only the kinematic + vital core: the diver entity, the camera,
// and air. It is the object exposed as `host.world`.
//
// Ownership is the point: the legacy `Game` sources these fields FROM the engine
// (via instance accessors installed in its constructor — the same-refs seam that
// P2 used for the meta bags, generalized to primitives), so `game.js` internals
// stay byte-identical yet the diver/camera/air are engine-owned and reachable by
// any future minigame through `host.world`. Later phases grow this surface
// (cave/physics/HUD) as each extraction needs it.

/**
 * @param {Object} deps
 * @param {{W:number,H:number,WW:number,WH:number}} deps.viewport  Live logical
 *   viewport: W/H are the visible size (they flex — read live, never cache) and
 *   WW/WH are the fixed scrollable world extents. In production this is `WORLD`.
 * @returns {Object} the DiverWorld engine (host.world)
 */
export function makeDiverWorld({ viewport }) {
  const world = {
    // Owned state (slice 1). The consumer (Game, today) populates `diver` with
    // the real entity and seeds camera/air through the accessor seam; the engine
    // just owns the slots.
    diver: null,
    camX: 0,
    camY: 0,
    air: 0,
    airMax: 0,

    // Position the diver and center the camera on it, clamped to the world
    // extents. Byte-for-byte the semantics of the old Game._placeDiver, but the
    // one authoritative copy — reads the viewport LIVE so the clamp follows a
    // flexed viewport (responsive-viewport constraint).
    placeDiver(x, y, vx) {
      const d = world.diver;
      d.x = x; d.y = y; d.vx = vx; d.vy = 0; d.invuln = 1.6;
      const { W, H, WW, WH } = viewport;
      world.camX = Math.max(0, Math.min(WW - W, x - W / 2));
      world.camY = Math.max(0, Math.min(WH - H, y - H / 2));
    },
  };
  return world;
}
