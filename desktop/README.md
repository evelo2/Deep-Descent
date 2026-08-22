# Deep Descent — Desktop / Steam build

An Electron wrapper that ships the **unmodified** web game as a standalone
Windows app for Steam. The game source in `../src` is never transpiled — the
"build" is a file copy (`sync`) plus packaging (`dist`).

```
../index.html, ../src, ../assets   ← source of truth (also deploys to GitHub Pages)
        │  npm run sync             ← recursive copy, no transpile
        ▼
   app/                            ← frozen snapshot (git-ignored)
        │  npm run dist            ← electron-builder
        ▼
   dist/Deep Descent Setup *.exe  ← upload to Steam
```

## Develop

```bash
cd desktop
npm install
npm start        # sync + launch the game in Electron (fullscreen)
npm test         # shim + achievement-manifest tests (run from repo root too)
```

`npm start` works with **no Steam installed** — Steam simply stays disabled and
achievements no-op. The game is served over a custom `app://` scheme (not
`file://`) so ES-module imports and Web Audio load exactly as on the web.

## Package for Steam

Cross-platform. `npm run dist` builds for whatever OS you run it on; the
explicit variants force a target:

```bash
npm run dist        # host OS (Windows .exe on Win, .dmg/.zip on Mac)
npm run dist:mac    # macOS → dist/*.dmg + *.zip, both x64 and arm64
npm run dist:win    # Windows → dist/Deep Descent Setup <version>.exe (NSIS)
```

`steamworks.js` is a native module and is kept unpacked from the asar
(`asarUnpack` in package.json). Each platform must be built on (or targeted
from) a matching toolchain — build the Mac app on a Mac.

### macOS signing / notarization

The Mac config ships **unsigned** (`"mac": { "identity": null }`) so
`npm run dist:mac` works on any Mac with no Apple cert — the resulting `.app`
runs locally (first launch: right-click → Open to clear Gatekeeper).

For a **distributable** Mac build (Steam's Mac depot, or direct download):
1. Get an Apple Developer ID ($99/yr).
2. Remove the `"identity": null` line so electron-builder auto-discovers your
   Developer ID cert from the keychain (or set `CSC_LINK`/`CSC_KEY_PASSWORD`).
3. Add hardened-runtime entitlements + a `notarize` step (Apple ID +
   app-specific password, or an API key) so Gatekeeper clears it on other Macs.

None of this is needed to test locally — only to ship.

## Steam achievements

Each badge in `../src/meta/badges.js` maps 1:1 to a Steam achievement, using the
**badge id verbatim as the achievement API Name**. The list lives in
`achievements.json`; `tests/desktop/achievements.test.mjs` fails if it ever
drifts from the badges. At game-over, `src/platform/steam.js` calls
`window.steam.unlock(<badgeId>)`, which IPCs to `steam.js` →
`client.achievement.activate(...)`.

### Your account work (can't be automated)

1. Register a Steamworks account and pay the **$100 Steam Direct fee** for this title.
2. Complete tax / bank / identity verification (30-day hold before release).
3. Put the real **App ID** in `steam_appid.txt` (currently `480`, Valve's test app).
4. In the Steamworks partner backend, create **14 achievements**, one per id in
   `achievements.json`, using each id **exactly** as the API Name. Add
   display name / description / icons there (Steam owns achievement art, not the game).
5. Upload the `dist/` build via the Steamworks SDK / SteamPipe.
6. Build a store page (capsule art, screenshots, trailer, description).

Steps 1–2, 5–6 are Steam account actions; the code side (1–4's wiring) is done.
