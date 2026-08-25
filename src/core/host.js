// @ts-check
// makeHost — assembles the Host facade a MiniGame receives (see
// core/contract.js for the shape). It is a thin bundle: services are exposed
// by reference, never copied or wrapped, so a MiniGame holding `host.economy`
// holds the Core's real economy. The DiverWorld engine (`world`) is opt-in and
// included ONLY when provided, keeping bring-your-own-engine modes free of it.

/**
 * @param {Object} services
 * @param {*} services.audio
 * @param {*} services.input
 * @param {*} services.particles
 * @param {*} services.viewport
 * @param {() => number} services.rng
 * @param {*} services.economy
 * @param {*} services.progression
 * @param {*} services.achievements
 * @param {*} [services.world]  Optional DiverWorld engine (opt-in capability).
 * @param {*} [services.core]   Core back-reference, wired in after construction
 *                              via host._bindCore(core) (see below).
 * @returns {import('./contract.js').Host}
 */
export function makeHost({
  audio, input, particles, viewport, rng,
  economy, progression, achievements, world, core,
}) {
  const host = {
    audio, input, particles, viewport, rng, economy, progression, achievements,
    // Mode switching: minigames request open/close through the Host, never the
    // Core directly (facade discipline). `core` is wired in after Core is built.
    open: (id, ctx) => core && core.open(id, ctx),
    close: (result) => core && core.close(result),
  };
  if (world !== undefined) host.world = world;
  host._bindCore = (c) => { core = c; };
  return host;
}
