// Every shipped manifest must satisfy contract v1, and its module thunk must
// actually resolve — a path typo is caught here, at P11.1, rather than at
// P11.3 when the Library first tries to launch from it.
import legacy from '../../src/minigames/legacy/manifest.js';
import match3 from '../../src/minigames/match3/manifest.js';
import { validateManifest } from '../../src/core/manifest.js';
import { GRANDFATHERED } from '../../src/core/grandfathered-ids.js';
import { BADGE_BY_ID } from '../../src/meta/badges.js';
import { TRACKS } from '../../src/meta/progressive.js';
import { STAT_KEYS } from '../../src/meta/stats.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const opts = { grandfathered: GRANDFATHERED };

for (const m of [legacy, match3]) {
  const errs = validateManifest(m, opts);
  check(errs.length === 0, `${m && m.id} manifest is valid contract v1 (${errs.join('; ')})`);
}

check(legacy.id === 'legacy', 'the base game manifest is id "legacy", not "reef"');
check(match3.id === 'match3', 'the match-3 manifest is id "match3"');

// Capabilities are enforced by Core, so they must be accurate.
check(legacy.capabilities.includes('world'), 'legacy declares the world capability');
check(!match3.capabilities.includes('world'),
  'match3 does NOT declare world — it runs its own board');
for (const c of ['economy', 'progression', 'achievements']) {
  check(match3.capabilities.includes(c), `match3 declares ${c}`);
}

// The Guardian Chest is a world entry that discovers match-3 (spec §3.2).
const chest = match3.entries.find((e) => e.id === 'chest');
check(chest && chest.kind === 'world', 'match3 has a world entry for the Guardian Chest');
check(chest.discovers === true, 'playing the chest entry discovers match-3');
check(chest.ctx && chest.ctx.source === 'chest',
  "the chest entry declares ctx { source: 'chest' }, matching reef/index.js");

// legacy is the front door: always available, never discovered, never gated.
const front = legacy.entries.find((e) => e.kind === 'menu');
check(front && front.alwaysAvailable === true, 'the legacy menu entry is alwaysAvailable');

// Goal ownership: no id is claimed by two manifests.
const ids = (m) => [
  ...(m.goals.badges || []).map((b) => b.id),
  ...(m.goals.stats || []).map((s) => s.key),
  ...(m.goals.tracks || []).map((t) => t.id),
];
const overlap = ids(legacy).filter((i) => ids(match3).includes(i));
check(overlap.length === 0, `legacy and match3 claim no id twice (got ${overlap.join(', ')})`);

// ANTI-DRIFT: in P11.1 the runtime source of truth is still meta/, so a
// grandfathered goal described in a manifest must match the live table field
// for field. This is what lets the manifests be copied by hand safely — any
// typo or later edit to meta/ fails here and names the field that drifted.
for (const m of [legacy, match3]) {
  for (const b of m.goals.badges || []) {
    const live = BADGE_BY_ID[b.id];
    if (!GRANDFATHERED.badges.has(b.id)) continue;      // new badges have no live row
    check(!!live, `${b.id}: grandfathered badge exists in meta/badges.js`);
    check(b.name === live.name, `${b.id}: name matches meta/badges.js (${b.name} vs ${live.name})`);
    check(b.glyph === live.glyph, `${b.id}: glyph matches meta/badges.js`);
    check(b.desc === live.desc, `${b.id}: desc matches meta/badges.js`);
  }
  for (const t of m.goals.tracks || []) {
    if (!GRANDFATHERED.tracks.has(t.id)) continue;
    const live = TRACKS.find((x) => x.id === t.id);
    check(!!live, `${t.id}: grandfathered track exists in meta/progressive.js`);
    check(t.stat === live.stat, `${t.id}: stat key matches meta/progressive.js`);
    check(t.tiers.join(',') === live.tiers.join(','),
      `${t.id}: tiers match meta/progressive.js (${t.tiers} vs ${live.tiers})`);
  }
  for (const st of m.goals.stats || []) {
    if (!GRANDFATHERED.stats.has(st.key)) continue;
    check(STAT_KEYS.includes(st.key), `${st.key}: grandfathered stat exists in meta/stats.js`);
  }
}

// COVERAGE: between them, the manifests must describe every live goal. A badge
// or track in meta/ that no manifest claims would vanish from the P11.4 Trophy
// Wall without anyone noticing.
const allBadgeIds = [...(legacy.goals.badges || []), ...(match3.goals.badges || [])].map((b) => b.id);
const allTrackIds = [...(legacy.goals.tracks || []), ...(match3.goals.tracks || [])].map((t) => t.id);
const allStatKeys = [...(legacy.goals.stats || []), ...(match3.goals.stats || [])].map((s) => s.key);
for (const id of GRANDFATHERED.badges) {
  check(allBadgeIds.includes(id), `badge '${id}' is claimed by a manifest`);
}
for (const id of GRANDFATHERED.tracks) {
  check(allTrackIds.includes(id), `track '${id}' is claimed by a manifest`);
}
for (const k of GRANDFATHERED.stats) {
  check(allStatKeys.includes(k), `stat '${k}' is claimed by a manifest`);
}

// The module thunks resolve to real modules exporting their factories.
const legacyMod = await legacy.module();
check(typeof legacyMod.createLegacyMiniGame === 'function',
  'the legacy module thunk resolves to a module exporting createLegacyMiniGame');
const m3Mod = await match3.module();
check(typeof m3Mod.makeMatch3 === 'function',
  'the match3 module thunk resolves to a module exporting makeMatch3');

// Identity must not drift from the runtime modules (About screen consistency).
const m3 = m3Mod.makeMatch3({ host: {} });
check(m3.id === match3.id && m3.name === match3.name && m3.version === match3.version,
  'the match3 manifest identity matches its runtime module');

console.log(`ok manifests.test.mjs (${pass} checks)`);
