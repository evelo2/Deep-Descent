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
}

export function applyLoadout(game, loadoutIds = []) {
  resetRelicFlags(game);
  for (const id of loadoutIds) {
    const r = getRelic(id);
    if (r) r.apply(game);
  }
  game._platingReady = game._relicPlating;
}
