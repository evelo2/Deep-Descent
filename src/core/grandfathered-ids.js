// @ts-check
// FROZEN. These are the goal ids that shipped before the P11.1 manifest layer.
// They live under BARE keys in `deepdescent.badges.v1` and
// `deepdescent.stats.v1`, and the badge + track-tier ids are registered as
// Steam achievement ids on the partner site. Renaming or namespacing any of
// them would orphan live player progress, so contract v1 exempts exactly this
// list from the `<minigameId>:<key>` namespacing rule (spec §3.4 decision #8).
//
// NOTHING MAY BE ADDED HERE. Every goal declared from P11.1 onward — including
// new match-3 goals — must be namespaced. tests/core/grandfathered-ids.test.mjs
// pins this list against the live tables in meta/.

/** The 18 one-shot badges from meta/badges.js. */
const BADGE_IDS = [
  'firstblood', 'krakenslayer', 'pacifist', 'conservationist', 'untouchable',
  'beachcomber', 'pearldiver', 'highroller', 'deepdiver', 'abyssal',
  'marathon', 'waterlogged', 'oneanddone', 'emptyhanded', 'firsttreasure',
  'guardiandown', 'comboartist', 'hoardcleared',
];

/** The 16 lifetime counters from meta/stats.js (STAT_KEYS). */
const STAT_IDS = [
  'sharkKills', 'metersDived', 'diveSeconds', 'subLoot', 'netted', 'dives',
  'salvageEarned', 'pearlsBanked', 'bossesFelled', 'careerScore',
  'm3Pearls', 'm3Gems', 'm3Coins', 'm3Explosions', 'chestsOpened', 'guardiansFelled',
];

/** The 16 progressive tracks from meta/progressive.js (TRACKS). */
const TRACK_IDS = [
  'shark', 'depth', 'time', 'subloot', 'net', 'dives', 'salvage', 'pearls',
  'bosses', 'score', 'm3pearls', 'm3gems', 'm3coins', 'm3boom', 'chests', 'guardian',
];

/** A Set that refuses additions, so the freeze is enforced at runtime too. */
function frozenSet(ids) {
  const s = new Set(ids);
  s.add = () => { throw new Error('GRANDFATHERED is frozen: new goal ids must be namespaced'); };
  return s;
}

export const GRANDFATHERED = Object.freeze({
  badges: frozenSet(BADGE_IDS),
  stats: frozenSet(STAT_IDS),
  tracks: frozenSet(TRACK_IDS),
});
