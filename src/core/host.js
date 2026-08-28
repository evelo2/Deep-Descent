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

/**
 * Build a narrowed view of a Host exposing only the capabilities a minigame
 * declared. The ungated services below are the shell itself — every minigame
 * gets them. Everything in GATED_CAPABILITIES is opt-in, so an undeclared
 * service is simply absent rather than quietly available (spec §3.1).
 *
 * Services are copied by REFERENCE, never wrapped: a minigame holding
 * `host.economy` still holds the Core's real economy. `open`/`close`/
 * `_bindCore` are copied by reference too, and all close over the SAME
 * `core` variable inside makeHost, so binding the core via any one of these
 * host objects (typically the original, unrestricted one) makes open/close
 * work on every restricted copy as well — order of construction vs. binding
 * doesn't matter.
 *
 * @param {*} host          The full Host from makeHost.
 * @param {string[]} [capabilities]  Declared capability names.
 * @returns {import('./contract.js').Host}
 */
export function restrictHost(host, capabilities = []) {
  const UNGATED = ['audio', 'input', 'particles', 'viewport', 'rng', 'open', 'close', '_bindCore'];
  const out = /** @type {*} */ ({});
  for (const k of UNGATED) if (host[k] !== undefined) out[k] = host[k];
  for (const c of capabilities) if (host[c] !== undefined) out[c] = host[c];
  return out;
}
