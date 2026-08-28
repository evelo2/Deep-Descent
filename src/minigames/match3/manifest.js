// Salvage Match (Treasure Chest Madness). PURE DATA: no imports, and `module`
// is the only function (contract v1, spec §1 decision #6).
//
// The bare ids below shipped before P11.1 and are pinned by
// src/core/grandfathered-ids.js. New goals must be namespaced 'match3:<key>'.
export default {
  id: 'match3',
  contract: 1,
  name: 'Treasure Chest Madness',
  version: '1.1.0',
  icon: '💰',
  blurb: 'Swap tiles, pop chests, bank salvage.',
  capabilities: ['economy', 'progression', 'achievements'],

  entries: [
    // Found in the world first: the reef's Guardian Chest opens straight into
    // the board (reef/index.js calls host.open('match3', { source: 'chest' })).
    { id: 'chest', kind: 'world', label: 'Guardian Hoard',
      ctx: { source: 'chest' }, discovers: true },
    // Menu access is earned or bought — the ladder is wired up in P11.3; the
    // requirement is declared here now so the Library can render it.
    { id: 'arcade', kind: 'menu', label: 'Play Treasure Chest Madness',
      requires: { discovered: true }, cost: { salvage: 250 } },
  ],

  controls: {
    pointer: true,
    actions: [
      { id: 'cursor',  label: 'Move cursor', keys: ['Arrows'],          pad: 'D-pad', touch: 'drag' },
      { id: 'swap',    label: 'Swap tiles',  keys: ['Space', 'Enter'],  pad: 'A',     touch: 'tap two tiles' },
      { id: 'quit',    label: 'Bank & quit', keys: ['Esc'],             pad: 'Start', touch: '✕' },
    ],
  },

  help: [
    { title: 'HOW TO PLAY', lines: [
      'Swap two adjacent tiles to line up three or more.',
      'Clear the level objective before you run out of moves.',
      'Every level you clear banks salvage into your one shared wallet.',
    ] },
  ],

  goals: {
    stats: [
      { key: 'm3Pearls',     label: 'Pearls matched' },
      { key: 'm3Gems',       label: 'Gems matched' },
      { key: 'm3Coins',      label: 'Coins matched' },
      { key: 'm3Explosions', label: 'Chests detonated' },
    ],
    // Copied VERBATIM from meta/badges.js / meta/progressive.js — the manifests
    // test asserts every field matches, so the two can never drift.
    badges: [
      { id: 'comboartist',  name: 'Combo Artist',  glyph: '🎇', desc: 'Detonate a special-on-special combo.' },
      { id: 'hoardcleared', name: 'Hoard Cleared', glyph: '🏆', desc: 'Clear every level of a chest run.' },
    ],
    tracks: [
      { id: 'm3pearls', stat: 'm3Pearls',     tiers: [100, 500, 2000] },
      { id: 'm3gems',   stat: 'm3Gems',       tiers: [100, 500, 2000] },
      { id: 'm3coins',  stat: 'm3Coins',      tiers: [100, 500, 2000] },
      { id: 'm3boom',   stat: 'm3Explosions', tiers: [25, 150, 600] },
    ],
  },

  module: () => import('./index.js'),
};
