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
// BUILD is a coarse phase marker — bump it as migration phases land (e.g.
// 'platform-p1', 'platform-p3') so the deployed build self-identifies. VERSION
// is the player-facing release number.
export const VERSION = '1.0.0';
export const BUILD = 'platform-p1';
export const KNOWN_GOOD_BASELINE = 'baseline/v1.0-pre-platform';
