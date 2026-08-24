// Regression test: creatures must never spawn on a "portal" — a zone entrance
// (temple gate, whale mouth, stage entrance), a dive station (bell), or a zone
// exit (whaleExit/templeExit) — otherwise you arrive at / get dropped beside one
// straight into an enemy. Drives the real Reef.prototype._clearCreaturesNearPortals()
// against stub state. Run: node tests/game/portal-clearance.test.mjs

import { Reef } from '../../src/minigames/reef/index.js';
import { BELL, STAGE } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));
const clearPortals = Reef.prototype._clearCreaturesNearPortals;
const mob = (x, y, tag) => ({ x, y, radius: 15, tag });

// --- Reef: bell, temple gate, whale mouth, stage entrance all clear a radius. ---
{
  const s = {
    zone: 'reef',
    bells: [{ x: 1000, y: 1000 }],
    templeGate: { x: 1500, y: 1200, r: 46 },
    whales: [{ mouthZone: () => ({ x: 500, y: 800 }) }],
    stageEntrances: [{ x: 2000, y: 1500 }],
    whaleExit: null, templeExit: null,
    creatures: [
      mob(1000, 1000, 'on-bell'),
      mob(1500, 1200, 'on-gate'),
      mob(505, 805, 'at-whale-mouth'),
      mob(2000, 1500, 'on-stage'),
      mob(300, 2600, 'far-1'),
      mob(2400, 3200, 'far-2'),
    ],
  };
  clearPortals.call(s);
  const tags = s.creatures.map((c) => c.tag);
  check('creature on a dive bell is cleared', !tags.includes('on-bell'));
  check('creature on the temple gate is cleared', !tags.includes('on-gate'));
  check('creature at the whale mouth is cleared', !tags.includes('at-whale-mouth'));
  check('creature on a stage entrance is cleared', !tags.includes('on-stage'));
  check('far creatures survive', tags.includes('far-1') && tags.includes('far-2'));
  check('only the four portal-overlapping mobs were removed', s.creatures.length === 2);
}

// --- Just outside the clearance is kept (we don't nuke the whole neighbourhood). ---
{
  const justOutside = BELL.radius + 90 + 15 + 5;   // clearance = r + 90 + creatureRadius, + a hair
  const s = { zone: 'reef', bells: [{ x: 0, y: 0 }], templeGate: null, whales: [], stageEntrances: [],
    whaleExit: null, templeExit: null, creatures: [mob(justOutside, 0, 'edge')] };
  clearPortals.call(s);
  check('a creature just past the clearance radius survives', s.creatures.length === 1);
}

// --- Belly: the throat exit is cleared. ---
{
  const s = { zone: 'belly', bells: [], templeGate: null, whales: [], stageEntrances: [],
    whaleExit: { x: 1380, y: 244, r: 46 }, templeExit: null,
    creatures: [mob(1385, 250, 'on-exit'), mob(1380, 900, 'deep-in-belly')] };
  clearPortals.call(s);
  const tags = s.creatures.map((c) => c.tag);
  check('creature on the whale throat exit is cleared', !tags.includes('on-exit'));
  check('creature deep in the belly survives', tags.includes('deep-in-belly'));
}

// --- Temple: the exit is cleared. ---
{
  const s = { zone: 'temple', bells: [], templeGate: null, whales: [], stageEntrances: [],
    whaleExit: null, templeExit: { x: 1380, y: 244, r: 46 },
    creatures: [mob(1380, 244, 'on-exit'), mob(1380, 1500, 'in-vault')] };
  clearPortals.call(s);
  const tags = s.creatures.map((c) => c.tag);
  check('creature on the temple exit is cleared', !tags.includes('on-exit'));
  check('creature down by the vault survives', tags.includes('in-vault'));
}

// --- No portals present → no-op (nothing removed). ---
{
  const s = { zone: 'reef', bells: [], templeGate: null, whales: [], stageEntrances: [],
    whaleExit: null, templeExit: null, creatures: [mob(100, 100), mob(200, 200)] };
  clearPortals.call(s);
  check('no portals → creatures untouched', s.creatures.length === 2);
}

console.log(`portal-clearance: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
