// Preload bridge (CommonJS, runs with contextIsolation). Exposes a minimal, safe
// window.steam to the game — the ONLY interface the web code sees. All real work
// happens in the main process (steam.js) over IPC; the renderer gets no Node/Steam
// access. If anything here is absent, the game's shim (src/platform/steam.js)
// no-ops, so this never has to be defensive about the game's behaviour.

const { contextBridge, ipcRenderer } = require('electron');

// Cache the Steam-running state once, so the game's synchronous isRunning() has an
// answer. It settles well before the first game-over.
let running = false;
ipcRenderer
  .invoke('steam:isRunning')
  .then((v) => { running = !!v; })
  .catch(() => {});

contextBridge.exposeInMainWorld('steam', {
  // Fire-and-forget: game-over must never block on Steam.
  unlock: (id) => { ipcRenderer.invoke('steam:unlock', id).catch(() => {}); },
  isRunning: () => running,
});
