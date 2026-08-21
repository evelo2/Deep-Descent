// The Steam achievement manifest (desktop/achievements.json) must stay in exact
// 1:1 sync with the game's badge ids. If a badge is added or renamed without
// updating the manifest (and the Steamworks backend), this fails loudly.
// Run: node tests/desktop/achievements.test.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGES } from '../../src/meta/badges.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '../../desktop/achievements.json'), 'utf8'));
const achIds = manifest.ids || [];
const badgeIds = BADGES.map((b) => b.id);

check('manifest has an ids array', Array.isArray(manifest.ids));
check('no duplicate achievement ids', new Set(achIds).size === achIds.length);
check('same count as badges', achIds.length === badgeIds.length);

const achSet = new Set(achIds), badgeSet = new Set(badgeIds);
const missing = badgeIds.filter((id) => !achSet.has(id));   // badges with no Steam achievement
const extra = achIds.filter((id) => !badgeSet.has(id));     // achievements with no badge
check(`every badge has an achievement (missing: ${missing.join(', ') || 'none'})`, missing.length === 0);
check(`no orphan achievements (extra: ${extra.join(', ') || 'none'})`, extra.length === 0);

console.log(`achievements: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
