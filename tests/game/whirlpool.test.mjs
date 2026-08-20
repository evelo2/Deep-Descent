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
  check('a bail-out exit is placed', !!s.whirlExit && typeof s.whirlExit.x === 'number' && typeof s.whirlExit.y === 'number');
  check('obstacles are seeded down the shaft', Array.isArray(s.whirlObstacles) && s.whirlObstacles.length > 0);
  check('every obstacle sits within the shaft half-width', s.whirlObstacles.every((o) => Math.abs(o.x - s.whirlShaft.cx) <= s.whirlShaft.halfW));
  check('the drop-in area (just below the exit) stays clear of obstacles', s.whirlObstacles.every((o) => o.y > s.whirlShaft.top + 200));
  check('obstacles get denser with depth (second half has more than the first)', (() => {
    const mid = (s.whirlShaft.top + s.whirlShaft.bottom) / 2;
    const shallow = s.whirlObstacles.filter((o) => o.y < mid).length;
    const deep = s.whirlObstacles.filter((o) => o.y >= mid).length;
    return deep > shallow;
  })());
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

// --- Phase 2 smoke test: _generateWhirlpool() also seeds collectibles down
// the shaft — bubbles for air, loot + at least one Black Pearl for the
// Salvage payoff cashed on exit (see _updateWhirlpool/_bankLoot). ---
{
  const s = { reef: 1, zone: 'whirlpool' };
  Game.prototype._generateWhirlpool.call(s);
  check('bubbles are seeded down the shaft', Array.isArray(s.whirlBubbles) && s.whirlBubbles.length > 0);
  check('loot/pearls are seeded down the shaft', Array.isArray(s.whirlTreasures) && s.whirlTreasures.length > 0);
  check('at least one Black Pearl is seeded', s.whirlTreasures.some((tr) => tr.pearl));
  check('every bubble sits within the shaft half-width', s.whirlBubbles.every((b) => Math.abs(b.x - s.whirlShaft.cx) <= s.whirlShaft.halfW));
  check('every treasure sits within the shaft half-width', s.whirlTreasures.every((tr) => Math.abs(tr.x - s.whirlShaft.cx) <= s.whirlShaft.halfW));
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
