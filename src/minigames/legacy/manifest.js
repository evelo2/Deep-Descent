// The base game — the reef dive and every zone inside it. PURE DATA: no
// imports, and `module` is the only function (contract v1, spec §1 decision #6).
//
// Ids here are BARE on purpose: they shipped before P11.1 and are pinned by
// src/core/grandfathered-ids.js. New goals must be namespaced 'legacy:<key>'.
//
// The chest/guardian counters live here rather than in match3's manifest
// because the REEF records them (reef/index.js), not the board.
export default {
  id: 'legacy',
  contract: 1,
  name: 'Reef Dive',
  version: '1.0.0',
  icon: '🤿',
  blurb: 'Dive the reef, spear what bites, bank the salvage before your air runs out.',
  capabilities: ['economy', 'progression', 'achievements', 'world'],

  entries: [
    { id: 'dive', kind: 'menu', label: 'Dive', alwaysAvailable: true },
  ],

  controls: {
    pointer: false,
    actions: [
      { id: 'swim',    label: 'Swim',        keys: ['Arrows', 'WASD'], pad: 'Left stick', touch: 'drag' },
      { id: 'spear',   label: 'Spear',       keys: ['Space'],          pad: 'A',          touch: 'tap' },
      { id: 'surface', label: 'Surface',     keys: ['Esc'],            pad: 'Start',      touch: '✕' },
    ],
  },

  help: [
    { title: 'HOW TO PLAY', lines: [
      'Swim down, collect treasure, and surface before your air runs out.',
      'Bank what you carry at the surface — drown and you lose the haul.',
      'Spear creatures to clear a path; some are better left alone.',
    ] },
  ],

  goals: {
    stats: [
      { key: 'sharkKills',      label: 'Sharks culled' },
      { key: 'metersDived',     label: 'Metres dived' },
      { key: 'diveSeconds',     label: 'Time underwater' },
      { key: 'subLoot',         label: 'Trench loot' },
      { key: 'netted',          label: 'Creatures netted' },
      { key: 'dives',           label: 'Dives made' },
      { key: 'salvageEarned',   label: 'Salvage earned' },
      { key: 'pearlsBanked',    label: 'Pearls banked' },
      { key: 'bossesFelled',    label: 'Bosses felled' },
      { key: 'careerScore',     label: 'Career score' },
      { key: 'chestsOpened',    label: 'Chests opened' },
      { key: 'guardiansFelled', label: 'Guardians felled' },
      // Diagnostic counters, not player goals: no track binds them, so they
      // mint no Steam achievement ids and draw nothing on the Trophy Wall.
      { key: 'legacy:valveOffered', label: 'Runs offered a Depth Valve' },
      { key: 'legacy:valveBought',  label: 'Depth Valves bought' },
    ],
    // Copied VERBATIM from meta/badges.js — the manifests test asserts every
    // field matches, so the two can never drift.
    badges: [
      { id: 'firstblood',      name: 'First Blood',     glyph: '⚔️', desc: 'Spear your first creature.' },
      { id: 'krakenslayer',    name: 'Kraken Slayer',   glyph: '🦑', desc: 'Fell the Kraken.' },
      { id: 'pacifist',        name: 'Pacifist',        glyph: '🌿', desc: 'Clear a reef without a single kill.' },
      { id: 'conservationist', name: 'Conservationist', glyph: '🕊️', desc: 'Win having killed under 30% of the creatures you met.' },
      { id: 'untouchable',     name: 'Untouchable',     glyph: '🛡️', desc: 'Win a run without losing a life.' },
      { id: 'beachcomber',     name: 'Beachcomber',     glyph: '🧹', desc: "Collect 100% of a reef's treasure." },
      { id: 'pearldiver',      name: 'Pearl Diver',     glyph: '⚫', desc: 'Bank 3 Black Pearls in one run.' },
      { id: 'highroller',      name: 'High Roller',     glyph: '🎰', desc: 'Score 50,000 in a single run.' },
      { id: 'deepdiver',       name: 'Deep Diver',      glyph: '🌊', desc: 'Reach Reef 5.' },
      { id: 'abyssal',         name: 'Abyssal',         glyph: '🕳️', desc: 'Reach Reef 8.' },
      { id: 'marathon',        name: 'Marathon Diver',  glyph: '🏊', desc: 'Descend past 3000m in one run.' },
      { id: 'waterlogged',     name: 'Waterlogged',     glyph: '💀', desc: 'Run out of air.' },
      { id: 'oneanddone',      name: 'One and Done',    glyph: '🪦', desc: 'Die on Reef 1.' },
      { id: 'emptyhanded',     name: 'Empty-Handed',    glyph: '🫙', desc: 'End a run with a score of nothing.' },
      { id: 'firsttreasure',   name: 'First Treasure',  glyph: '🧰', desc: 'Open a guarded reef chest.' },
      { id: 'guardiandown',    name: 'Guardian Down',   glyph: '🐉', desc: 'Fell a chest guardian.' },
    ],
    tracks: [
      { id: 'shark',    stat: 'sharkKills',      tiers: [5, 50, 300] },
      { id: 'depth',    stat: 'metersDived',     tiers: [2000, 25000, 150000] },
      { id: 'time',     stat: 'diveSeconds',     tiers: [900, 7200, 43200] },
      { id: 'subloot',  stat: 'subLoot',         tiers: [500, 10000, 60000] },
      { id: 'net',      stat: 'netted',          tiers: [10, 150, 750] },
      { id: 'dives',    stat: 'dives',           tiers: [5, 50, 300] },
      { id: 'salvage',  stat: 'salvageEarned',   tiers: [500, 5000, 30000] },
      { id: 'pearls',   stat: 'pearlsBanked',    tiers: [3, 25, 100] },
      { id: 'bosses',   stat: 'bossesFelled',    tiers: [1, 10, 40] },
      { id: 'score',    stat: 'careerScore',     tiers: [50000, 500000, 5000000] },
      { id: 'chests',   stat: 'chestsOpened',    tiers: [1, 10, 50] },
      { id: 'guardian', stat: 'guardiansFelled', tiers: [1, 10, 50] },
    ],
  },

  module: () => import('./index.js'),
};
