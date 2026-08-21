// Main-process Steam integration (CommonJS). Wraps steamworks.js so the rest of
// the app can call unlock()/isRunning() without caring whether Steam, the native
// module, or a valid app id are actually present. Every failure degrades to a
// no-op so `npm start` works on a dev machine with no Steam at all.

const fs = require('node:fs');
const path = require('node:path');

let client = null;   // steamworks.js client, or null when Steam is unavailable
let ready = false;   // init() has run (success or not)
const validIds = new Set(loadAchievementIds());

function loadAchievementIds() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'achievements.json'), 'utf8'));
    return Array.isArray(j.ids) ? j.ids : [];
  } catch {
    return [];
  }
}

function readAppId() {
  try {
    return parseInt(fs.readFileSync(path.join(__dirname, 'steam_appid.txt'), 'utf8').trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// Attempt to bring up Steam. Safe to call once at app-ready; idempotent.
function init() {
  if (ready) return client;
  ready = true;

  const appId = readAppId();
  if (!appId) {
    console.warn('[steam] no steam_appid.txt — Steam disabled');
    return null;
  }

  let steamworks;
  try {
    steamworks = require('steamworks.js');
  } catch {
    console.warn('[steam] steamworks.js not installed — Steam disabled');
    return null;
  }

  try {
    client = steamworks.init(appId);
    console.log('[steam] initialized for app', appId);
  } catch (e) {
    console.warn('[steam] init failed — Steam disabled:', e && e.message);
    client = null;
  }
  return client;
}

function isRunning() {
  return !!client;
}

// Unlock a Steam achievement by its API name (== badge id). Unknown ids are
// rejected loudly so a badge added without a matching Steam achievement is caught
// in dev rather than silently swallowed.
function unlock(id) {
  if (!client || typeof id !== 'string') return false;
  if (validIds.size && !validIds.has(id)) {
    console.warn('[steam] unknown achievement id (not in achievements.json):', id);
    return false;
  }
  try {
    client.achievement.activate(id);
    return true;
  } catch (e) {
    console.warn('[steam] unlock failed:', id, e && e.message);
    return false;
  }
}

module.exports = { init, isRunning, unlock };
