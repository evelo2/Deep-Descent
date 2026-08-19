// Data-driven zone spawn framework. A ZONE_FAUNA table maps a context (depth
// band or special zone/location) to a weighted list of eligible creature
// entries, each reef-gated by an optional minReef. pickFauna picks one entry
// from a band's pool; spawnCreature builds the actual creature instance(s)
// from an entry. This replaces the old depth-band if/else cascade in
// game.js with a table the later creature tasks can extend in place.
import { Shark, Octopus, Jelly, Puffer, Eel, Angler, Piranha, Stonefish, Barracuda } from './creatures.js';
import { CREATURES } from '../config.js';

// Existing roster only — new keys are added by later creature tasks.
export const ZONE_FAUNA = {
  shallow: [ {k:'jelly',w:3}, {k:'puffer',w:3}, {k:'shark',w:2,scale:'small'}, {k:'piranha',w:2,minReef:1} ],
  mid:     [ {k:'octopus',w:2}, {k:'shark',w:3,scale:'mid'}, {k:'puffer',w:2}, {k:'jelly',w:1}, {k:'piranha',w:1,minReef:2}, {k:'barracuda',w:2,minReef:2} ],
  deep:    [ {k:'shark',w:2,scale:'big'}, {k:'eel',w:2}, {k:'angler',w:2}, {k:'stonefish',w:1,minReef:2}, {k:'barracuda',w:1,minReef:3} ],
  dark:    [ {k:'eel',w:2}, {k:'jelly',w:1}, {k:'stonefish',w:3,minReef:1} ],
  wreck:   [ {k:'puffer',w:2}, {k:'eel',w:1} ],
  current: [ {k:'jelly',w:1} ],
  belly:   [ {k:'eel',w:1}, {k:'jelly',w:1} ],
  temple:  [ {k:'eel',w:1}, {k:'puffer',w:1} ],
};

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
    case 'piranha': {
      const [lo, hi] = CREATURES.piranha.count;
      const count = lo + Math.floor(rng() * (hi - lo + 1));
      const units = [];
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 40;
        units.push(new Piranha(x + Math.cos(a) * r, y + Math.sin(a) * r));
      }
      return units;
    }
    default: return null;
  }
}
