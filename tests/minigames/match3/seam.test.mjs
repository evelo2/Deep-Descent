// tests/minigames/match3/seam.test.mjs
import { makeMatch3 } from '../../../src/minigames/match3/index.js';
import { mulberry32 } from '../../../src/stage/chunkgen.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

function fakeHost() {
  const wallet = { salvage: 0 };
  return {
    rng: mulberry32(123),
    input: { pressed: () => false, consumeButton: () => false, isTouch: false, endFrame() {} },
    audio: { select() {}, ensure() {}, resume() {}, gasp() {} },
    particles: { bubble() {} },
    viewport: { W: 960, H: 600, WW: 960, WH: 600 },
    economy: { earn: ({ salvage = 0 }) => { wallet.salvage += salvage; return wallet.salvage; }, state: wallet },
    _closed: null,
    close(result) { this._closed = result; },
    _wallet: wallet,
  };
}

// entering starts at level 0 in the intro phase
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  check(mg.id === 'match3', 'id');
  mg.enter(host);
  check(mg.phase === 'intro' && mg.levelIndex === 0, 'enters at level 0 intro');
  check(mg.board && mg.board.cols === 8, 'board built');
  check(mg.movesLeft === 20, 'moves seeded from level 1');
}

// clearing the objective wins the level and credits salvage
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  mg.enter(host);
  mg.phase = 'play';
  // Force the objective met by driving progress directly, then advance.
  mg.progress = mg.level.targetCount;
  mg._checkGoal();
  check(mg.phase === 'won', 'goal met → won');
  check(host._wallet.salvage >= mg.level.reward, 'salvage credited for the win');
}

// running out of moves loses
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  mg.enter(host);
  mg.phase = 'play';
  mg.movesLeft = 0;
  mg.progress = 0;
  mg._checkGoal();
  check(mg.phase === 'lost', 'no moves + goal unmet → lost');
}

// Keyboard confirm (Space) during play selects the cursor tile. Regression:
// update() read the 'confirm' edge once for phase transitions and pressed()
// CONSUMES the edge, so _handlePlayInput's re-read saw nothing and Space was
// dead during play. This models pressed()'s real consume-on-read semantics.
function scriptInput() {
  const edges = new Set();
  return {
    isTouch: false,
    _queue(a) { edges.add(a); },
    pressed(a) { if (edges.has(a)) { edges.delete(a); return true; } return false; },
    consumeButton() { return false; },
    endFrame() { edges.clear(); },
  };
}
{
  const host = fakeHost();
  const inp = scriptInput();
  host.input = inp;
  const mg = makeMatch3({ host });
  mg.enter(host);
  mg.phase = 'play'; mg.sel = null; mg.cursor = { r: 0, c: 0 };
  inp._queue('confirm');
  mg.update(0.016);
  check(mg.sel && mg.sel.r === 0 && mg.sel.c === 0, 'Space during play selects the cursor tile');
  // A second confirm on the (adjacent) neighbour attempts the swap → clears sel.
  mg.cursor = { r: 0, c: 1 };
  inp._queue('confirm');
  mg.update(0.016);
  check(mg.sel === null, 'second Space attempts the swap and clears the selection');
}

// exit returns a report-only result (salvage already credited per level)
{
  const host = fakeHost();
  const mg = makeMatch3({ host });
  mg.enter(host);
  const r = mg.exit();
  check(r && r.credited === true, 'exit result is report-only (credited)');
}

console.log(`ok seam.test.mjs (${pass} checks)`);
