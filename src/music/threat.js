// @ts-check
// Turns "what is chasing me" into one number for the music layer. Pure, so it
// tests under plain Node with plain objects and no Web Audio.
//
// The count, not the distance, drives the level: a graded-by-proximity value
// jitters as a creature oscillates around its pursuit radius. All smoothing
// lives in Tension (rise 0.35s, fall 2.5s), so this stays a dumb reporter and
// the long release absorbs any boundary flicker.

const BASE = 0.55;   // one pursuer is already a chase
const STEP = 0.15;   // each additional one leans on it harder

// `creatures` report their own `pursuing` flag. Krakens and the chest Guardian
// are boss encounters — being alive is the same thing as hunting you.
export function tensionLevel(creatures, krakens, guardian) {
  let n = 0;
  if (creatures) for (const c of creatures) if (c && c.pursuing && !c.dead) n++;
  if (krakens) for (const k of krakens) if (k && !k.dead) n++;
  if (guardian && !guardian.dead && guardian.hp > 0) n++;
  return n === 0 ? 0 : Math.min(1, BASE + STEP * n);
}
