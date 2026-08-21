// Freeze a snapshot of the web game into desktop/app/ so electron-builder can
// package a self-contained app. This is a *copy*, never a transpile — the game
// ships as the same untranspiled ES modules that run on the web.
//
// Run from desktop/:  node scripts/sync-web.mjs   (also `npm run sync`)

import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');   // desktop/scripts -> repo root
const appDir = join(here, '..', 'app');    // desktop/app

// The web game's entire footprint. assets/ is optional (currently empty — the
// game is fully procedural), copied anyway so future art ships automatically.
const ENTRIES = ['index.html', 'src', 'assets'];

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

let copied = 0;
for (const name of ENTRIES) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) {
    console.warn(`  skip (missing): ${name}`);
    continue;
  }
  cpSync(from, join(appDir, name), { recursive: true });
  copied++;
  console.log(`  copied: ${name}`);
}

if (!existsSync(join(appDir, 'index.html'))) {
  console.error('sync failed: app/index.html is missing');
  process.exit(1);
}
console.log(`sync complete — ${copied} entr${copied === 1 ? 'y' : 'ies'} -> desktop/app/`);
