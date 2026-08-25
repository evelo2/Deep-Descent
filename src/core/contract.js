// @ts-check
// The platform contract — the small, stable surface every MiniGame speaks to
// the Core through. Doc-only in Phase 1: these are JSDoc typedefs, NOT runtime
// code (this module intentionally exports nothing executable). They exist so the
// boundary has one authoritative shape that later phases can lock with `tsc`
// (Phase 8) without a build step today. See docs/platform/architecture.md.

/**
 * A MiniGame is a self-contained mode plugged into the Core. The Core owns the
 * lifecycle and calls these; the MiniGame never reaches around the Host.
 *
 * @typedef {Object} MiniGame
 * @property {string} id                 Stable unique key used by Core.boot(id).
 * @property {string} [name]             Player-facing display name (About screen).
 * @property {string} [version]          Semver, bumped per-minigame (About screen).
 * @property {(host: Host, ctx?: any) => void} enter Called once when the Core activates it;
 *                                        receives the Host facade (its only door
 *                                        to shared services) and an optional context.
 * @property {(dt: number) => void} update Advance one frame (seconds).
 * @property {(ctx: CanvasRenderingContext2D) => void} render Draw one frame.
 * @property {() => (MiniGameResult|void)} [exit] Called when the mode ends; may
 *                                        return rewards to credit. Optional.
 */

/**
 * The Host is the single facade a MiniGame receives — shared services owned by
 * the Core. `world` (the DiverWorld engine) is an OPT-IN capability, present
 * only for diver-world modes; bring-your-own-engine modes omit it.
 *
 * @typedef {Object} Host
 * @property {*} audio         Sound service.
 * @property {*} input         Input service.
 * @property {*} particles     Particle system.
 * @property {*} viewport      Live logical viewport (W/H).
 * @property {() => number} rng Random source (0..1).
 * @property {*} economy       Shared salvage/currency economy (real in Phase 2).
 * @property {*} progression   Badges/ranks/stats (real in Phase 2).
 * @property {*} achievements  Achievement/Steam bridge (real in Phase 2).
 * @property {*} [world]       DiverWorld engine — present only when opted in.
 * @property {(id: string, ctx?: any) => void} open   Push+activate a registered MiniGame by id, with optional context.
 * @property {(result?: MiniGameResult) => void} close  Exit+pop the active MiniGame, resume the one beneath.
 */

/**
 * What a MiniGame hands back on exit so the Core can credit the shared spine
 * (see Core.creditResult). Every field is optional; the Core credits only what
 * is present.
 *
 * @typedef {Object} MiniGameResult
 * @property {'won'|'lost'|'bailed'|string} [outcome] How the run ended.
 * @property {number} [salvage]  Persistent currency to add via economy.earn.
 * @property {number} [score]    Run score (informational; the diver-world game
 *                               already folds score into its own progression).
 * @property {{delta?: object, summary?: object}} [stats] Run stats for
 *                               progression.recordRun — `delta` folds into
 *                               lifetime counters, `summary` drives one-shot badges.
 * @property {string[]} [achievements] Achievement/badge ids to unlock.
 * @property {boolean} [credited] Set when the mode ALREADY self-credited during
 *                               play (e.g. the legacy game, which persists
 *                               mid-run); Core.creditResult then skips it so
 *                               nothing is double-counted.
 */

export {};
