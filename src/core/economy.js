// @ts-check
// Economy — the Core-owned wallet, promoted from meta/salvage.js. This is a
// THIN service: it does not reimplement anything, it just loads the salvage bag
// once (through the existing storage-injectable meta module, so the localStorage
// key + format are byte-identical to baseline), OWNS that loaded `state`, and
// exposes earn/balance/save plus the reef-skip-relic helpers.
//
// Why "own the state": the legacy Game and every future minigame reach the SAME
// `state` object via `host.economy.state`, so a salvage banked in one place is
// visible everywhere — one shared wallet, the product's moat. The legacy game
// keeps mutating `state` directly (unchanged internals); this service is simply
// where that state now lives and how new minigames credit it.

import {
  loadSalvage, saveSalvage,
  bankReefRelic, consumeReefRelic, availableSkips,
} from '../meta/salvage.js';

/**
 * @param {Object} [opts]
 * @param {Storage} [opts.store]  localStorage-shaped store; defaults inside
 *        meta/salvage.js to the real localStorage in the browser.
 * @returns {{
 *   state: object,
 *   balance: () => number,
 *   save: () => void,
 *   earn: (reward: {salvage?: number}) => number,
 *   bankReefRelic: (reef: number) => void,
 *   consumeReefRelic: (reef: number) => boolean,
 *   availableSkips: () => number[],
 * }}
 */
export function makeEconomy({ store } = {}) {
  const state = loadSalvage(store);

  const save = () => saveSalvage(state, store);

  return {
    state,
    balance: () => state.salvage,
    save,

    // Credit the shared wallet and persist. Returns the new balance. Only the
    // persistent `salvage` currency lives here; run-local gold/pearls stay with
    // the minigame (pearls are converted to salvage at bank time by the game).
    earn({ salvage = 0 } = {}) {
      if (salvage) { state.salvage += salvage; save(); }
      return state.salvage;
    },

    // Reef-skip relics: thin passthroughs bound to the owned state. (They mutate
    // state; the caller persists via save() exactly as game.js does today.)
    bankReefRelic(reef) { bankReefRelic(state, reef); },
    consumeReefRelic(reef) { return consumeReefRelic(state, reef); },
    availableSkips() { return availableSkips(state); },
  };
}
