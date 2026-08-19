import { STAGE } from '../../src/config.js';
import { THEMES, getTheme } from '../../src/stage/themes.js';

let failed = 0, passed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`ok   - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}`); }
}
function near(a, b, eps = 1.5) { return Math.abs(a - b) <= eps; }
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

assert('two themes ship+lair', THEMES.length === 2 && THEMES[0].key === 'ship' && THEMES[1].key === 'lair');
assert('getTheme returns lair', getTheme('lair').name === 'THE LAIR');
assert('getTheme falls back', getTheme('nope') === THEMES[0]);
for (const th of THEMES) {
  assert(`${th.key} has 3 rooms`, th.rooms.length === 3);
  for (let i = 0; i < th.rooms.length; i++) {
    const room = th.rooms[i];
    assert(`${th.key} room ${i} has ${STAGE.rows} rows`, room.length === STAGE.rows);
    const badRow = room.findIndex((r) => r.length !== STAGE.cols);
    assert(`${th.key} room ${i} all rows are ${STAGE.cols} chars`, badRow === -1);
    assert(`${th.key} room ${i} has exactly one S`, room.join('').split('S').length - 1 === 1);
    assert(`${th.key} room ${i} has an exit >`, room.join('').includes('>'));
  }
  const last = th.rooms[th.rooms.length - 1];
  assert(`${th.key} final room has a cache $`, last.join('').includes('$'));
}

import { parseRoom, solidAt, ladderAt, spikeAt, doorKindAt } from '../../src/stage/stage.js';

const T = STAGE.tile;
const sample = [
  '##############################', // row0 solid ceiling strip
  '..............................',
  '..S.....o.....................',
  '..#####.......................',
  '.....H........................',
  '.....H....^...................',
  '.....H....E.........$.........',
  '.....H........................',
  '<...........................>.',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '##############################',
];
const room = parseRoom(sample);
assert('parse: cols/rows', room.cols === 30 && room.rows === 20);
assert('parse: S extracted to empty', room.grid[2][2] === '.');
assert('parse: start x centered', near(room.start.x, 2 * T + (T - STAGE.bodyW) / 2));
assert('parse: start y feet at tile bottom', near(room.start.y, 2 * T + (T - STAGE.bodyH)));
assert('parse: one loot', room.loot.length === 1 && near(room.loot[0].x, 8 * T));
assert('parse: loot tile cleared', room.grid[2][8] === '.');
assert('parse: cache present', room.cache && near(room.cache.x, 20 * T) && room.cache.taken === false);
assert('parse: two movers (slide? no, one E one none)', room.movers.length === 1); // only 'E' here
assert('parse: mover is patrol', room.movers[0].mode === 'patrol');
assert('parse: spike stays in grid', spikeAt(room, 10, 5) === true);
assert('parse: solid lookup', solidAt(room, 0, 0) === true && solidAt(room, 5, 5) === false);
assert('parse: side walls solid OOB', solidAt(room, -1, 5) === true && solidAt(room, 30, 5) === true);
assert('parse: pit below bottom not solid', solidAt(room, 5, 20) === false);
assert('parse: ladder lookup', ladderAt(room, 5, 4) === true);
assert('parse: doors', doorKindAt(room, 0, 8) === '<' && doorKindAt(room, 28, 8) === '>');

// --- Reachability gate: every room must be completable. Flood-fill (4-connected)
// directly over the RAW ascii rows from a room's S cell, treating every
// non-'#' character as passable (parseRoom clears dynamic glyphs S/o/$/x/E to
// '.', so scanning the raw strings is the only way to locate them by position;
// '#' is the only glyph that blocks movement). Assert the fill reaches every
// '>' door, and — for each theme's final room — the '$' cache. This is a
// necessary (not sufficient) connectivity check: it can't prove a jump/ladder
// path is *comfortable*, but it guarantees the goal isn't sealed behind solid
// rock, which is exactly the class of bug this guards against.
function floodReachable(rawRows) {
  const R = rawRows.length, C = rawRows[0].length;
  let sr = -1, sc = -1;
  for (let r = 0; r < R; r++) {
    const c = rawRows[r].indexOf('S');
    if (c !== -1) { sr = r; sc = c; break; }
  }
  const seen = Array.from({ length: R }, () => Array(C).fill(false));
  if (sr === -1) return seen;   // no S found — caller's assertions will fail elsewhere
  const stack = [[sr, sc]];
  seen[sr][sc] = true;
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
      if (seen[nr][nc]) continue;
      if (rawRows[nr][nc] === '#') continue;   // only solid rock blocks
      seen[nr][nc] = true;
      stack.push([nr, nc]);
    }
  }
  return seen;
}

for (const th of THEMES) {
  for (let i = 0; i < th.rooms.length; i++) {
    const raw = th.rooms[i];
    const seen = floodReachable(raw);
    const isFinal = i === th.rooms.length - 1;
    for (let r = 0; r < raw.length; r++) {
      for (let c = 0; c < raw[r].length; c++) {
        const ch = raw[r][c];
        if (ch === '>') {
          assert(`${th.key} room ${i}: S can reach exit > at (${r},${c})`, seen[r][c]);
        } else if (ch === '$' && isFinal) {
          assert(`${th.key} room ${i}: S can reach cache $ at (${r},${c})`, seen[r][c]);
        }
      }
    }
  }
}

done();
