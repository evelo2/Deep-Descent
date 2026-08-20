// The Salvage Log — relic model (Phase 2). Data-driven passives, unlocked with
// Salvage and equipped into the loadout (Phase 3 UI). Each relic's `apply` sets
// a small flag/modifier on the Game so the hook in game.js stays tiny and
// localized. Pure logic — Node-testable on a plain stub object, no DOM.

export const RELICS = [
  { id: 'lungs', name: 'Reinforced Lungs', desc: '+30 max air for the run.', cost: 120,
    apply: g => { g._relicAirBonus += 30; } },
  { id: 'fins', name: 'Ballast Fins', desc: '+18% swim speed.', cost: 150,
    apply: g => { g._relicSwimMult *= 1.18; } },
  { id: 'plating', name: 'Pressure Plating', desc: 'Negates the first hit each dive; recharges at the boat.', cost: 220,
    apply: g => { g._relicPlating = true; } },
  { id: 'bellrig', name: 'Bell Rigging', desc: 'Dive bells bank your haul at full value.', cost: 260,
    apply: g => { g._relicBellFull = true; } },
  { id: 'sonar', name: 'Sonar', desc: 'Treasure & Black Pearls blip on the minimap.', cost: 170,
    apply: g => { g._relicSonar = true; } },
  { id: 'barbs', name: 'Barbed Harpoon', desc: 'Harpoon & charge hits deal +1 damage (chews through mini-bosses).', cost: 240,
    apply: g => { g._relicBarbs = true; } },
  { id: 'secondwind', name: 'Second Wind', desc: 'After a hit your air floors higher.', cost: 200,
    apply: g => { g._relicSecondWind = true; } },
  { id: 'eye', name: "Salvager's Eye", desc: '+1 Black Pearl per reef; pearls always blip on the minimap.', cost: 280,
    apply: g => { g._relicEye = true; } },
  { id: 'chart', name: "Prospector's Chart", desc: 'Start each reef with more of the map revealed.', cost: 150,
    apply: g => { g._relicChart = true; } },
  { id: 'magnet', name: 'Magnet Core', desc: 'A permanent, gentle treasure magnet.', cost: 230,
    apply: g => { g._relicMagnet = true; } },
];

export function getRelic(id) {
  return RELICS.find(r => r.id === id) || null;
}

// Reset the per-run relic flags to their defaults. Called at the start of
// `applyLoadout` so every run starts clean regardless of what a prior run left
// behind, and is also the canonical place these flags are initialized.
export function resetRelicFlags(game) {
  game._relicAirBonus = 0;
  game._relicSwimMult = 1;
  game._relicPlating = false;
  game._relicBellFull = false;
  game._platingReady = false;
  game._relicSonar = false;
  game._relicBarbs = false;
  game._relicSecondWind = false;
  game._relicEye = false;
  game._relicChart = false;
  game._relicMagnet = false;
}

export function applyLoadout(game, loadoutIds = []) {
  resetRelicFlags(game);
  for (const id of loadoutIds) {
    const r = getRelic(id);
    if (r) r.apply(game);
  }
  game._platingReady = game._relicPlating;
}
