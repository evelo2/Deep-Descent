// Platformer stage: parsing + physics for the cave-entrance minigame. LOGIC ONLY
// — no canvas/DOM imports, so Node can run it under test and the Game can drive
// it headlessly. Rendering lives in src/render/stage.js.
import { STAGE } from '../config.js';

const T = STAGE.tile;

// Glyphs that remain in the static grid after extraction (everything the physics
// queries by tile). Dynamic glyphs (S/o/$/x/E) are pulled into lists and their
// cell is cleared to '.'.
const STATIC = new Set(['.', '#', 'H', '^', '<', '>']);

export function parseRoom(rows) {
  const grid = rows.map((r) => r.split(''));
  const loot = [], movers = [];
  let start = null, cache = null;
  const cellBox = (c, r) => ({ x: c * T, y: r * T, w: T, h: T });
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const g = grid[r][c];
      if (STATIC.has(g)) continue;
      if (g === 'S') {
        start = { x: c * T + (T - STAGE.bodyW) / 2, y: r * T + (T - STAGE.bodyH) };
      } else if (g === 'o') {
        loot.push({ ...cellBox(c, r), taken: false });
      } else if (g === '$') {
        cache = { ...cellBox(c, r), taken: false };
      } else if (g === 'x') {
        movers.push({ ...cellBox(c, r), mode: 'slide', x0: c * T, dir: 1 });
      } else if (g === 'E') {
        movers.push({ ...cellBox(c, r), mode: 'patrol', x0: c * T, dir: 1 });
      }
      grid[r][c] = '.';   // clear the dynamic glyph from the static grid
    }
  }
  if (!start) start = { x: T, y: T };   // defensive: every room should have an S
  return { cols: STAGE.cols, rows: STAGE.rows, grid, start, loot, movers, cache };
}

export function solidAt(room, col, row) {
  if (col < 0 || col >= room.cols) return true;   // side walls
  if (row < 0) return true;                        // ceiling
  if (row >= room.rows) return false;              // below floor = pit
  return room.grid[row][col] === '#';
}
export function ladderAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
  return room.grid[row][col] === 'H';
}
export function spikeAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
  return room.grid[row][col] === '^';
}
export function doorKindAt(room, col, row) {
  if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return null;
  const g = room.grid[row][col];
  return g === '<' || g === '>' ? g : null;
}

// Tile-range helpers used by the physics (Task 3+).
export function tileRange(x, y, w, h) {
  // The upper bound uses a tiny epsilon (not a full pixel) so a body resting
  // exactly on a tile boundary doesn't select the next tile, while genuine
  // sub-pixel overlap (e.g. one substep of gravity jitter at rest) still does.
  const EPS = 1e-3;
  return {
    c0: Math.floor(x / T), c1: Math.floor((x + w - EPS) / T),
    r0: Math.floor(y / T), r1: Math.floor((y + h - EPS) / T),
  };
}
export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Stage {
  constructor(theme) {
    this.theme = theme;
    this.rooms = theme.rooms.map((r) => parseRoom(r));
    this.roomIndex = 0;
    this.result = null;         // set to 'retreat' | 'complete' when leaving
    this.bannerT = 2.2;         // seconds the room banner shows
    this.animT = 0;             // walk/climb animation clock
    const st = this.rooms[0].start;
    this.body = {
      x: st.x, y: st.y, w: STAGE.bodyW, h: STAGE.bodyH,
      vx: 0, vy: 0, onGround: false, onLadder: false, facing: 1,
      invuln: 0, pose: 'stand',
    };
  }

  get room() { return this.rooms[this.roomIndex]; }

  // Advance the stage. Sub-steps the physics so a terminal-speed fall never
  // skips a tile. Returns per-frame events for the Game to apply.
  update(dt, cmd) {
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.animT += dt * (Math.abs(this.body.vx) > 10 || this.body.onLadder ? 1 : 0);
    if (this.body.invuln > 0) this.body.invuln -= dt;
    let remaining = dt;
    const ev = { loot: 0, died: false, exited: null };
    while (remaining > 0) {
      const step = Math.min(STAGE.substep, remaining);
      this._step(step, cmd);
      remaining -= step;
    }
    return ev;   // Tasks 4-6 fill loot/died/exited
  }

  // One physics sub-step: input → intent, gravity, X-then-Y tile collision.
  _step(dt, cmd) {
    const b = this.body;
    // Horizontal intent.
    b.vx = cmd.moveX * STAGE.walk;
    if (cmd.moveX !== 0) b.facing = cmd.moveX > 0 ? 1 : -1;

    // Ladder: if the body's centre column is a ladder tile and the player holds
    // up/down, climb (gravity off). Grabbing also holds position when climbY=0
    // *after* already on the ladder, so you can pause on a rung.
    const cx = Math.floor((b.x + b.w / 2) / T);
    const cyTop = Math.floor(b.y / T);
    const cyBot = Math.floor((b.y + b.h - 1) / T);
    const onLadderTile = ladderAt(this.room, cx, cyTop) || ladderAt(this.room, cx, cyBot);
    if (onLadderTile && (cmd.climbY !== 0 || b.onLadder)) {
      b.onLadder = true;
      let vy = cmd.climbY * STAGE.climb;
      // Already at the top rung (no ladder tile above, checking two rows up
      // so a single-tile gap — e.g. the 'S' spawn cell carved out of a ladder
      // column — still bridges via body-height overlap): stop climbing
      // instead of launching into free flight, which would overshoot upward
      // and then immediately re-grab on the way back down (unstable bounce
      // forever).
      if (vy < 0 && !ladderAt(this.room, cx, cyTop - 1) && !ladderAt(this.room, cx, cyTop - 2)) vy = 0;
      b.vy = vy;
      // Gently centre on the ladder column for a clean climb.
      const target = cx * T + (T - b.w) / 2;
      b.x += (target - b.x) * Math.min(1, dt * 12);
    } else {
      b.onLadder = false;
    }
    // Jump only from the ground OR off a ladder (leaves climb).
    if (cmd.jump && (b.onGround || b.onLadder)) { b.vy = -STAGE.jump; b.onGround = false; b.onLadder = false; }
    // Gravity — suspended while on a ladder.
    if (!b.onLadder) b.vy = Math.min(STAGE.maxFall, b.vy + STAGE.gravity * dt);

    // --- X axis ---
    b.x += b.vx * dt;
    this._collideAxis('x');
    // --- Y axis ---
    b.onGround = false;
    b.y += b.vy * dt;
    this._collideAxis('y');

    // Pose (renderer hint). Use walk intent (not just resultant vx) so pressing
    // into a wall still reads as "walking" rather than snapping to "stand" the
    // instant collision zeroes vx.
    if (b.onLadder) b.pose = 'climb';
    else if (!b.onGround) b.pose = 'jump';
    else if (Math.abs(b.vx) > 10 || cmd.moveX !== 0) b.pose = 'walk';
    else b.pose = 'stand';
  }

  // Resolve the body out of any solid tiles it overlaps along one axis.
  _collideAxis(axis) {
    const b = this.body, room = this.room;
    const rng = tileRange(b.x, b.y, b.w, b.h);
    for (let r = rng.r0; r <= rng.r1; r++) {
      for (let c = rng.c0; c <= rng.c1; c++) {
        if (!solidAt(room, c, r)) continue;
        const tileL = c * T, tileR = c * T + T, tileT = r * T, tileB = r * T + T;
        if (axis === 'x') {
          if (b.vx > 0) b.x = tileL - b.w;
          else if (b.vx < 0) b.x = tileR;
          b.vx = 0;
        } else {
          if (b.vy > 0) { b.y = tileT - b.h; b.onGround = true; }
          else if (b.vy < 0) b.y = tileB;
          b.vy = 0;
        }
      }
    }
  }
}
