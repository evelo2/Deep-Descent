// Real-physics traversal autopilot. Drives the actual Stage engine through a
// single room following waypoints, proving the critical path is walkable+
// climbable. Verifies GEOMETRY: movers are stripped (dodging a moving hazard is
// gameplay, not geometry); static spikes (^) and pits stay lethal.
import { Stage } from '../../src/stage/stage.js';
import { STAGE } from '../../src/config.js';

const T = STAGE.tile;
const DT = 1 / 60;

export function makeStage(rows, { palette = { accent: 'gem' }, stripMovers = true } = {}) {
  if (rows.length !== STAGE.rows) throw new Error(`room must have exactly ${STAGE.rows} rows, got ${rows.length}`);
  const bad = rows.map((r, i) => (r.length !== STAGE.cols ? `row ${i} len ${r.length}` : null)).filter(Boolean);
  if (bad.length) throw new Error(`room rows must be ${STAGE.cols} chars: ${bad.join(', ')}`);
  const st = new Stage({ rooms: [rows], palette, hazardGlyph: 'barrel', name: 'T', key: 't' });
  st.doorGrace = 0;
  if (stripMovers) st.rooms.forEach((rm) => { rm.movers = []; });
  return st;
}

const centreCol = (b) => Math.floor((b.x + b.w / 2) / T);
const topRow = (b) => Math.floor(b.y / T);

// Waypoints: {to}, {walkClimb:{to,dir,climbY}}, {climbTo}, {jump:{moveX}}, {hold:{frames,moveX,climbY}}
export function runRoom(rows, waypoints, { budgetPerWp = 400, palette } = {}) {
  const st = makeStage(rows, { palette });
  const b = st.body;
  let died = false, reachedExit = false, reachedCache = false;
  const step = (cmd) => {
    const ev = st.update(DT, cmd);
    if (ev.died) died = true;
    if (ev.exited === 'complete') reachedExit = true;
    if (st.room.cache && st.room.cache.taken) reachedCache = true;
  };
  for (const wp of waypoints) {
    let f = 0, done = false;
    while (f++ < budgetPerWp && !done && !died) {
      let cmd = { moveX: 0, jump: false, climbY: 0 };
      if (wp.to != null) {
        const target = wp.to * T + T / 2;
        if (Math.abs((b.x + b.w / 2) - target) < 2) { done = true; }
        else cmd.moveX = (b.x + b.w / 2) < target ? 1 : -1;
      } else if (wp.walkClimb != null) {
        cmd.moveX = wp.walkClimb.dir; cmd.climbY = wp.walkClimb.climbY || 0;
        if (centreCol(b) === wp.walkClimb.to) done = true;
      } else if (wp.climbTo != null) {
        cmd.climbY = topRow(b) === wp.climbTo ? 0 : (wp.climbTo < topRow(b) ? -1 : 1);
        if (topRow(b) === wp.climbTo) done = true;
      } else if (wp.jump != null) { cmd = { moveX: wp.jump.moveX || 0, jump: true, climbY: 0 }; done = true; }
      else if (wp.hold != null) { cmd = { moveX: wp.hold.moveX || 0, climbY: wp.hold.climbY || 0, jump: false }; if (f >= (wp.hold.frames || 30)) done = true; }
      step(cmd);
    }
    if (died) break;
  }
  return { reachedExit, reachedCache, died };
}
