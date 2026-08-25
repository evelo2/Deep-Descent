// Single source of truth for the build's identity.
//
// KNOWN-GOOD BASELINE: `pre-platform` marks the last verified-good state of the
// monolithic game BEFORE the platform refactor (see docs/platform/) began. That
// exact commit is also the git tag `baseline/v1.0-pre-platform`. During the
// strangler-fig migration, any regression can be diffed or reverted against it:
//
//     git diff baseline/v1.0-pre-platform -- src/game.js
//     git checkout baseline/v1.0-pre-platform   # to reproduce the known-good build
//
// BUILD is a per-deploy stamp so the running build self-identifies — shown in
// the boot console banner AND on the About screen. Bump it every deploy (the
// migration-phase era ended at platform-p9) so a stale-cache vs fresh-load can
// be told apart on a device: if the About/console build tag doesn't match the
// latest deploy, the browser is serving cached scripts. VERSION is the
// player-facing release number.
export const VERSION = '1.0.0';
export const BUILD = 'p9.5-2026-08-24';
export const KNOWN_GOOD_BASELINE = 'baseline/v1.0-pre-platform';

// ENGINE_VERSION is the Core/platform (shell + shared economy + minigame stack)
// version, shown on the About screen alongside each minigame's own version.
// Bump it when the Core contract / shared systems change; individual minigames
// carry their own `version` field (see each minigame module) and bump
// independently.
export const ENGINE_VERSION = '1.0.0';
