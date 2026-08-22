// The Steam achievement manifest (desktop/achievements.json) must stay in exact
// 1:1 sync with the game's achievement ids — the 14 one-shot badge ids plus the
// 30 progressive tier ids. Add/rename either without updating the manifest (and
// the Steamworks backend) and this fails loudly.
// Run: node tests/desktop/achievements.test.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGES } from '../../src/meta/badges.js';
import { PROGRESSIVE_IDS } from '../../src/meta/progressive.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '../../desktop/achievements.json'), 'utf8'));
const achIds = manifest.ids || [];
const wantIds = [...BADGES.map((b) => b.id), ...PROGRESSIVE_IDS];

check('manifest has an ids array', Array.isArray(manifest.ids));
check('no duplicate achievement ids', new Set(achIds).size === achIds.length);
check(`same count as badges + progressive (${wantIds.length})`, achIds.length === wantIds.length);

const achSet = new Set(achIds), wantSet = new Set(wantIds);
const missing = wantIds.filter((id) => !achSet.has(id));   // game ids with no Steam achievement
const extra = achIds.filter((id) => !wantSet.has(id));     // achievements with no game id
check(`every game id has an achievement (missing: ${missing.join(', ') || 'none'})`, missing.length === 0);
check(`no orphan achievements (extra: ${extra.join(', ') || 'none'})`, extra.length === 0);

console.log(`achievements: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
