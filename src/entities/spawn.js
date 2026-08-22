// Data-driven zone spawn framework. A ZONE_FAUNA table maps a context (depth
// band or special zone/location) to a weighted list of eligible creature
// entries, each reef-gated by an optional minReef. pickFauna picks one entry
// from a band's pool; spawnCreature builds the actual creature instance(s)
// from an entry. This replaces the old depth-band if/else cascade in
// game.js with a table the later creature tasks can extend in place.
import { Shark, Octopus, Jelly, Puffer, Eel, Angler, Piranha, Stonefish, Barracuda, Moray, ElectricRay, Grouper, Urchin, GiantSquid, Parasite, Sentinel } from './creatures.js';
import { CREATURES } from '../config.js';

// Depth bands + special zones. dark/wreck/current/belly/temple carry their
// final zone-themed rosters (Task 10); shallow/mid/deep are the generic
// depth-band roster used by the main reef spawn loop.
export const ZONE_FAUNA = {
  shallow: [ {k:'jelly',w:3}, {k:'puffer',w:3}, {k:'shark',w:2,scale:'small'}, {k:'piranha',w:2,minReef:3} ],
  mid:     [ {k:'octopus',w:2}, {k:'shark',w:3,scale:'mid'}, {k:'puffer',w:2}, {k:'jelly',w:1}, {k:'piranha',w:1,minReef:2}, {k:'barracuda',w:2,minReef:2} ],
  deep:    [ {k:'shark',w:2,scale:'big'}, {k:'eel',w:2}, {k:'angler',w:2}, {k:'stonefish',w:1,minReef:2}, {k:'barracuda',w:1,minReef:3}, {k:'moray',w:1,minReef:3}, {k:'ray',w:1,minReef:3}, {k:'urchin',w:1,minReef:5}, {k:'squid',w:1,minReef:4} ],
  dark:    [ {k:'stonefish',w:3,minReef:1}, {k:'moray',w:2,minReef:2}, {k:'urchin',w:2,minReef:4} ],
  wreck:   [ {k:'moray',w:2,minReef:2}, {k:'grouper',w:2,minReef:3} ],
  current: [ {k:'urchin',w:3,minReef:4} ],
  belly:   [ {k:'parasite',w:3}, {k:'urchin',w:1} ],
  temple:  [ {k:'sentinel',w:2} ],
};

// Display name + glyph per creature kind — for the reef-intro "new threat"
// flash (see Game#_generateWorld). Covers every kind used in ZONE_FAUNA.
export const FAUNA_INFO = {
  shark:     { name: 'Shark',        glyph: '🦈' },
  octopus:   { name: 'Octopus',      glyph: '🐙' },
  jelly:     { name: 'Jellyfish',    glyph: '🪼' },
  puffer:    { name: 'Pufferfish',   glyph: '🐡' },
  piranha:   { name: 'Piranha',      glyph: '🐟' },
  barracuda: { name: 'Barracuda',    glyph: '🐟' },
  eel:       { name: 'Eel',          glyph: '🐍' },
  angler:    { name: 'Anglerfish',   glyph: '🎣' },
  stonefish: { name: 'Stonefish',    glyph: '🪨' },
  moray:     { name: 'Moray Eel',    glyph: '🐍' },
  ray:       { name: 'Electric Ray', glyph: '⚡' },
  urchin:    { name: 'Sea Urchin',   glyph: '🦔' },
  squid:     { name: 'Giant Squid',  glyph: '🦑' },
  grouper:   { name: 'Grouper',      glyph: '🐠' },
  parasite:  { name: 'Parasite',     glyph: '🦠' },
  sentinel:  { name: 'Sentinel',     glyph: '🗿' },
};
export function faunaInfo(kind) { return FAUNA_INFO[kind] || null; }

// Bands that actually appear inside the open reef (excludes the belly & temple
// special zones). Used to choose each reef's "featured new enemy".
const REEF_BANDS = ['shallow', 'mid', 'deep', 'dark', 'wreck', 'current'];

// Earliest reef a kind becomes available across the reef bands (an entry with
// no minReef is reef-1 baseline).
function earliestReef(kind) {
  let best = Infinity;
  for (const band of REEF_BANDS) for (const e of ZONE_FAUNA[band] || []) {
    if (e.k === kind) best = Math.min(best, e.minReef || 1);
  }
  return best;
}

// Unique reef-band kinds that first unlock *exactly* at `reef` — the genuine
// new arrivals to announce.
export function newFaunaAtReef(reef) {
  const kinds = new Set();
  for (const band of REEF_BANDS) for (const e of ZONE_FAUNA[band] || []) kinds.add(e.k);
  return [...kinds].filter((k) => earliestReef(k) === reef);
}

// Unique reef-band kinds available at or before `reef` (the fallback novelty
// pool once a reef unlocks nothing new).
export function faunaKindsUpTo(reef) {
  const kinds = new Set();
  for (const band of REEF_BANDS) for (const e of ZONE_FAUNA[band] || []) if ((e.minReef || 1) <= reef) kinds.add(e.k);
  return [...kinds];
}

// Weighted pick from a zone's fauna pool, filtered by reef gating
// (entries whose minReef exceeds the current reef are excluded). Returns the
// chosen entry (not a Creature instance) or null if the pool is empty.
export function pickFauna(band, reef, rng = Math.random) {
  const pool = (ZONE_FAUNA[band] || []).filter((e) => (e.minReef || 0) <= reef);
  if (!pool.length) return null;
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of pool) { if ((r -= e.w) <= 0) return e; }
  return pool[pool.length - 1];
}

// Build the actual Creature instance(s) for a fauna entry (as returned by
// pickFauna, or a hand-built equivalent). opts.sizeUp scales shark size
// (reef-driven "bigger sharks deeper into a run"); opts.rng overrides
// Math.random for deterministic tests. Swarm-type entries (later tasks) may
// return an array of Creatures instead of a single one.
export function spawnCreature(entry, x, y, reef, opts = {}) {
  const sizeUp = opts.sizeUp || 0, rng = opts.rng || Math.random;
  switch (entry.k) {
    case 'shark': {
      const base = entry.scale === 'big' ? 1.3 : entry.scale === 'mid' ? 1.0 : 0.7;
      return new Shark(x, y, base + sizeUp + rng() * 0.4);
    }
    case 'octopus': return new Octopus(x, y);
    case 'jelly':   return new Jelly(x, y);
    case 'puffer':  return new Puffer(x, y);
    case 'eel':     return new Eel(x, y);
    case 'angler':  return new Angler(x, y);
    case 'stonefish': return new Stonefish(x, y);
    case 'barracuda': return new Barracuda(x, y);
    case 'moray':     return new Moray(x, y);
    case 'ray':       return new ElectricRay(x, y);
    case 'grouper':   return new Grouper(x, y, opts.anchor);
    case 'urchin':    return new Urchin(x, y, opts.drift || 0);
    case 'squid':     return new GiantSquid(x, y);
    case 'parasite':  return new Parasite(x, y);
    case 'sentinel':  return new Sentinel(x, y, opts.anchor);
    case 'piranha': {
      const [lo, hi] = CREATURES.piranha.count;
      const count = lo + Math.floor(rng() * (hi - lo + 1));
      const units = [];
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 40;
        units.push(new Piranha(x + Math.cos(a) * r, y + Math.sin(a) * r));
      }
      // Link the swarm into one shared-HP shoal: a hit on any member drains the
      // shared pool, and clearing it kills the whole shoal at once (see
      // Piranha.takeDamage). shoalHp is the scalable difficulty knob.
      const shoal = { hp: CREATURES.piranha.shoalHp ?? 1, units };
      for (const u of units) u.shoal = shoal;
      return units;
    }
    default: return null;
  }
}
