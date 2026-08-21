// Optional Steam bridge for the desktop (Electron) build.
//
// On the web — GitHub Pages, or any plain browser — `window.steam` is undefined,
// so every call here is a no-op and the game behaves EXACTLY as it always has.
// Under the desktop wrapper, desktop/preload.js installs
//   window.steam = { unlock(id), isRunning() }
// backed by steamworks.js in the Electron main process.
//
// The game never imports Electron or Steam directly; this shim is the only seam.

function bridge() {
  return (typeof window !== 'undefined' && window.steam) || null;
}

// True only when running inside the desktop build with a live Steam client.
export function steamAvailable() {
  const b = bridge();
  try {
    return !!(b && typeof b.isRunning === 'function' && b.isRunning());
  } catch {
    return false;
  }
}

// Unlock a Steam achievement by its API name. We use the badge id verbatim as the
// achievement API name (see desktop/achievements.json), so callers pass a badge id.
// Returns true if the unlock was handed to Steam, false on the web / any failure.
// Never throws — a broken bridge must not break game-over.
export function unlockAchievement(id) {
  const b = bridge();
  if (!b || typeof b.unlock !== 'function' || !id) return false;
  try {
    b.unlock(id);
    return true;
  } catch {
    return false;
  }
}
