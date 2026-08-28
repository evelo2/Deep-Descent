// @ts-check
// makeHost — assembles the Host facade a MiniGame receives (see
// core/contract.js for the shape). It is a thin bundle: services are exposed
// by reference, never copied or wrapped, so a MiniGame holding `host.economy`
// holds the Core's real economy. The DiverWorld engine (`world`) is opt-in and
// included ONLY when provided, keeping bring-your-own-engine modes free of it.

import { GATED_CAPABILITIES } from './manifest.js';

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
 * declared. Everything in GATED_CAPABILITIES is opt-in, so an undeclared
 * gated service is simply absent rather than quietly available (spec §3.1).
 * Every OTHER PUBLIC own key of `host` — audio/input/particles/viewport/rng/
 * open/close today — is ungated shell infrastructure and always passes
 * through. This loop is inverted on purpose: it copies every key EXCEPT the
 * undeclared gated ones, rather than maintaining a second hardcoded allowlist
 * that has to be kept in sync with makeHost by hand. A new ungated service
 * added to makeHost later is therefore included automatically, instead of
 * being silently dropped because someone forgot to add it to a list here.
 *
 * Keys starting with `_` are ALWAYS omitted, regardless of gating — they are
 * internal rebinding infrastructure (currently just `_bindCore`), not Host
 * surface for a minigame. This is a real capability boundary, not tidiness:
 * every copy `restrictHost` produces closes over the SAME `core` variable
 * inside makeHost, so a minigame that could reach `_bindCore` on its
 * "restricted" host could rebind Core for every OTHER minigame too — the
 * doc comment on the result calling it capability-restricted would be a lie
 * otherwise. Only `main.js` calls `_bindCore`, and only once, on the
 * original unrestricted `host` returned by makeHost.
 *
 * Services are copied by REFERENCE, never wrapped: a minigame holding
 * `host.economy` still holds the Core's real economy. `open`/`close` are
 * copied by reference too, and both close over the SAME `core` variable
 * inside makeHost, so binding the core via the original host (see above)
 * makes open/close work on every restricted copy as well — order of
 * construction vs. binding doesn't matter.
 *
 * @param {*} host          The full Host from makeHost.
 * @param {string[]} [capabilities]  Declared capability names.
 * @returns {import('./contract.js').Host}
 */
export function restrictHost(host, capabilities = []) {
  const declared = new Set(capabilities);
  const out = /** @type {*} */ ({});
  for (const k of Object.keys(host)) {
    if (k.startsWith('_')) continue;                                   // internal rebinding infra: never expose
    if (GATED_CAPABILITIES.includes(k) && !declared.has(k)) continue;   // undeclared gated capability: omit
    out[k] = host[k];
  }
  return out;
}
