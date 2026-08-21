// Tests for Phase 1 of the whirlpool survival zone: _generateWhirlpool()
// produces a usable shaft (obstacles + a bail-out exit) and clears the
// reef-only fields the same way _generateAbyss does, and the whirlpool's own
// methods never call _loseLife anywhere — the whole point of the zone is
// that hitting an obstacle or running out of air ends the run WITHOUT
// costing a life. Run: node tests/game/whirlpool.test.mjs

import { Game } from '../../src/game.js';
import { WHIRL, whirlpoolReward } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Smoke test: _generateWhirlpool() builds a usable shaft off a stub Game.
// Unlike _generateAbyss/_generateTemple, this needs no Cave/document stub —
// it's pure world-gen: a fixed-width column + scattered obstacles, no miner
// carving (see the comment on _generateWhirlpool in src/game.js). ---
{
  const s = { reef: 1, zone: 'whirlpool' };
  Game.prototype._generateWhirlpool.call(s);
  check('a whirlpool shaft is defined', !!s.whirlShaft && typeof s.whirlShaft.cx === 'number' && typeof s.whirlShaft.halfW === 'number');
  check('the shaft is endless (no fixed bottom)', s.whirlShaft.bottom === undefined);
  check('a bail-out exit is placed', !!s.whirlExit && typeof s.whirlExit.x === 'number' && typeof s.whirlExit.y === 'number');
  // Endless model: nothing is seeded at generate — obstacles/collectibles stream
  // in at run time (see _updateWhirlpool). Generate just arms the cursors.
  check('obstacles/bubbles/treasures start EMPTY (streamed at run time)',
    s.whirlObstacles.length === 0 && s.whirlBubbles.length === 0 && s.whirlTreasures.length === 0);
  check('the density timer + streaming cursors are armed',
    s.whirlT === 0 && s.whirlNextObstacleY > s.whirlShaft.top && s.whirlNextBubbleY > s.whirlShaft.top && s.whirlNextTreasureY > s.whirlShaft.top);
  check('reef-only special-zone fields are cleared while generating the whirlpool',
    s.templeGate === null && s.whirlEntrance === null && s.door === null && s.key === null && s.abyssEntrance === null);
}

// --- The whirlpool never costs a life: a static-source check on the methods
// that actually drive it, so a future edit can't silently reintroduce a
// _loseLife call on the obstacle-hit / air-out / bail-out exit paths. Method
// bodies are located by a line-start anchor (2-space class-method indent) so
// this can't accidentally match the `this._updateWhirlpool(dt)` *call site*
// in update()'s zone dispatcher, which appears earlier in the file. ---
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/game.js', import.meta.url), 'utf8');
  const grabMethod = (name) => {
    const m = new RegExp(`^  ${name}\\(`, 'm').exec(src);
    if (!m) return '';
    const braceStart = src.indexOf('{', m.index);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(m.index, i + 1);
  };
  const updateBody = grabMethod('_updateWhirlpool');
  const exitBody = grabMethod('_exitWhirlpool');
  const enterBody = grabMethod('_enterWhirlpool');
  check('_updateWhirlpool source was located', updateBody.length > 0);
  check('_exitWhirlpool source was located', exitBody.length > 0);
  check('_enterWhirlpool source was located', enterBody.length > 0);
  check('_updateWhirlpool never calls _loseLife (obstacle/air-out/bail exits are all free)', !updateBody.includes('_loseLife'));
  check('_exitWhirlpool never calls _loseLife', !exitBody.includes('_loseLife'));
  check('_enterWhirlpool never calls _loseLife', !enterBody.includes('_loseLife'));
  // All three exits must actually reach _exitWhirlpool (the only sanctioned way out).
  const exitCalls = (updateBody.match(/_exitWhirlpool\(\)/g) || []).length;
  check('_updateWhirlpool exits via _exitWhirlpool on all three paths (obstacle, air-out, bail)', exitCalls === 3);
}

// --- WHIRL config sanity: the sweep must actually have room to accelerate,
// and the shaft/obstacle sizing must be positive. ---
{
  check('WHIRL.baseSpeed < WHIRL.maxSpeed (the sweep has room to ramp)', WHIRL.baseSpeed < WHIRL.maxSpeed);
  check('WHIRL.accel is positive (it actually ramps over time)', WHIRL.accel > 0);
  check('WHIRL.shaftHalfW / obstacleR are positive', WHIRL.shaftHalfW > 0 && WHIRL.obstacleR > 0);
  check('WHIRL.entranceChance is a valid probability', WHIRL.entranceChance > 0 && WHIRL.entranceChance <= 1);
}

// --- Phase 2: whirlpoolReward(tier) — the cumulative Salvage payout for
// having reached a given speed-break tier. Must start at 0 and only grow,
// and the marginal (per-tier) award it implies must always be positive so
// every tier crossed in _updateWhirlpool actually pays out something. ---
{
  check('whirlpoolReward(0) === 0', whirlpoolReward(0) === 0);
  const tiers = [0, 1, 2, 3, 4, 5, 6];
  const vals = tiers.map(whirlpoolReward);
  check('whirlpoolReward is monotonic increasing over tiers 0..6', vals.every((v, i) => i === 0 || v > vals[i - 1]));
  check('the marginal per-tier award (reward(n) - reward(n-1)) is positive for every tier 1..6',
    tiers.slice(1).every((n) => whirlpoolReward(n) - whirlpoolReward(n - 1) > 0));
}

// --- Endless streaming: _whirlSpawnRow starts LOW-density (1 obstacle at
// ramp 0) and adds more toward the peak; obstacles are random among the three
// kinds (landmine/jellyfish/starfish) and stay within the shaft. ---
{
  const s = { reef: 1, zone: 'whirlpool' };
  Game.prototype._generateWhirlpool.call(s);
  Game.prototype._whirlSpawnRow.call(s, 1000, 0);
  check('low starting density: a row at ramp 0 spawns exactly 1 obstacle', s.whirlObstacles.length === 1);
  check('the first obstacle has a valid kind', ['mine', 'jelly', 'star'].includes(s.whirlObstacles[0].kind));

  s.whirlObstacles = [];
  for (let i = 0; i < 40; i++) Game.prototype._whirlSpawnRow.call(s, 1000 + i * 120, 1);
  check('peak density spawns more obstacles per row than the start', s.whirlObstacles.length > 40);
  check('every obstacle has a valid kind (mine/jelly/star)', s.whirlObstacles.every((o) => ['mine', 'jelly', 'star'].includes(o.kind)));
  check('every obstacle sits within the shaft half-width', s.whirlObstacles.every((o) => Math.abs(o.x - s.whirlShaft.cx) <= s.whirlShaft.halfW));
  const kinds = new Set(s.whirlObstacles.map((o) => o.kind));
  check('all three obstacle kinds appear across a large sample', kinds.has('mine') && kinds.has('jelly') && kinds.has('star'));
}

// --- Phase 2: _exitWhirlpool resets the new zone-local state (whirlTier,
// whirlSalvageEarned, the collectible lists) just like the Phase 1 fields
// (whirlSpeed/whirlScore) — no leak into the next run. ---
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/game.js', import.meta.url), 'utf8');
  const m = /^  _exitWhirlpool\(/m.exec(src);
  const braceStart = src.indexOf('{', m.index);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const exitBody = src.slice(m.index, i + 1);
  check('_exitWhirlpool resets whirlTier', /this\.whirlTier\s*=\s*0/.test(exitBody));
  check('_exitWhirlpool resets whirlSalvageEarned', /this\.whirlSalvageEarned\s*=\s*0/.test(exitBody));
  check('_exitWhirlpool resets whirlBubbles', /this\.whirlBubbles\s*=\s*\[\]/.test(exitBody));
  check('_exitWhirlpool resets whirlTreasures', /this\.whirlTreasures\s*=\s*\[\]/.test(exitBody));
}

console.log(`whirlpool: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
