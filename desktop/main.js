// Electron main process (CommonJS). Serves the frozen web game from desktop/app
// over a custom app:// scheme (file:// breaks ES-module <script> imports and
// fetch), opens it fullscreen, and bridges Steam achievements over IPC.

const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const steam = require('./steam.js');

const APP_DIR = path.join(__dirname, 'app');

// Must run before app 'ready': give app:// a real, secure origin so module
// scripts, fetch, and Web Audio asset loads behave exactly as on the web.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#02101f',
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://local/index.html');
  return win;
}

// Resolve an app:// request to a file inside APP_DIR, refusing anything that
// escapes it (path traversal via ../).
function resolveInApp(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  const resolved = path.resolve(APP_DIR, rel);
  if (resolved !== APP_DIR && !resolved.startsWith(APP_DIR + path.sep)) return null;
  return resolved;
}

app.whenReady().then(() => {
  steam.init();

  ipcMain.handle('steam:unlock', (_e, id) => steam.unlock(id));
  ipcMain.handle('steam:isRunning', () => steam.isRunning());

  protocol.handle('app', (request) => {
    const filePath = resolveInApp(new URL(request.url).pathname);
    if (!filePath) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
