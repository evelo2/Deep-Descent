// `capabilities` is enforced, not documentation: Core builds each minigame's
// Host from its manifest, so an undeclared service is simply absent. This
// also pins the REAL wiring in main.js — a minigame constructed with the
// unrestricted `host` (rather than a `restrictHost(...)` result) would defeat
// enforcement even if Core itself is correct, because both real minigames
// capture the host they were built with and ignore the one enter() hands them.
import { Core } from '../../src/core/core.js';
import { makeHost, restrictHost } from '../../src/core/host.js';
import legacyManifest from '../../src/minigames/legacy/manifest.js';
import match3Manifest from '../../src/minigames/match3/manifest.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const services = {
  audio: {}, input: {}, particles: {}, viewport: { W: 100, H: 100 }, rng: () => 0.5,
  economy: { earn() {} }, progression: { recordRun() {} }, achievements: { unlock() {} },
  world: { diver: 'yes' },
};

// --- restrictHost ---
const full = makeHost(services);
const narrow = restrictHost(full, ['economy']);
check(narrow.economy === full.economy, 'a declared capability is passed through by reference');
check(narrow.world === undefined, 'an undeclared capability is absent');
check(narrow.progression === undefined, 'progression is gated too');
for (const k of ['audio', 'input', 'particles', 'viewport', 'rng']) {
  check(narrow[k] === full[k], `${k} is ungated shell infrastructure, always present`);
}
check(typeof narrow.open === 'function' && typeof narrow.close === 'function',
  'open/close survive restriction');

// --- Core hands each minigame its own restricted host ---
const seen = {};
const stub = (id) => ({ id, enter(host) { seen[id] = host; }, update() {}, render() {} });

const core = new Core({ host: full });
core.register(stub('legacy'), legacyManifest);
core.register(stub('match3'), match3Manifest);

core.boot('legacy');
check(seen.legacy.world === services.world, 'legacy declared world, so it gets world');

core.open('match3');
core.update(0.016);                       // open is applied at the frame boundary
check(seen.match3 !== undefined, 'match3 entered');
check(seen.match3.world === undefined, 'match3 did not declare world, so world is absent');
check(seen.match3.economy === services.economy, 'match3 declared economy, so it gets economy');

// --- manifest storage + validation ---
check(core.manifestFor('match3') === match3Manifest, 'Core stores the registered manifest');
check(core.manifestFor('nope') === undefined, 'manifestFor is undefined for an unknown id');

let threw = false;
try {
  core.register(stub('bad'), { id: 'bad', contract: 99, name: 'Bad', version: '1.0.0',
    capabilities: [], entries: [{ id: 'e', kind: 'menu', label: 'E' }],
    goals: {}, module: () => Promise.resolve({}) });
} catch (e) { threw = /contract/.test(e.message); }
check(threw, 'registering a manifest with the wrong contract version throws loudly');

let mismatch = false;
try { core.register(stub('legacy'), match3Manifest); } catch (e) { mismatch = /id/.test(e.message); }
check(mismatch, "registering a manifest whose id differs from the minigame's throws");

// --- back-compat: an unmanifested minigame still works and gets the full host ---
const bare = stub('bare');
core.register(bare);
check(core.manifestFor('bare') === undefined, 'an unmanifested minigame has no manifest');
core.open('bare');
core.update(0.016);
check(seen.bare === full, 'an unmanifested minigame receives the unrestricted host');

// --- real wiring: main.js must construct each minigame with a RESTRICTED
// host, not the full one, because both real minigames ignore the host that
// enter() hands them (they close over the host they were constructed with).
// A source-grep is the only thing that can catch this: no unit test can
// import main.js (it boots a browser page on import).
const mainSrc = await (await import('node:fs/promises')).readFile(
  new URL('../../src/main.js', import.meta.url), 'utf8');
check(/restrictHost\(/.test(mainSrc), 'main.js calls restrictHost to build per-minigame hosts');
check(!/makeMatch3\(\{\s*host\s*\}\)/.test(mainSrc),
  'match3 is no longer constructed with the raw, unrestricted host');
check(!/createLegacyMiniGame\(\{[^}]*\bhost\s*,/.test(mainSrc)
  && !/createLegacyMiniGame\(\{[^}]*\bhost:\s*host\b/.test(mainSrc),
  'legacy is no longer constructed with the raw, unrestricted host');

console.log(`ok capabilities.test.mjs (${pass} checks)`);
