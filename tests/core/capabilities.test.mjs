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

// A restricted host must NOT expose _bindCore: every restricted copy closes
// over the SAME `core` variable inside makeHost (see host.js), so a minigame
// holding one could call host._bindCore(fakeCore) and hijack open/close for
// every OTHER minigame too. _bindCore is rebinding infrastructure for main.js
// to wire up the Core once, on the ORIGINAL host — not something any minigame,
// restricted or not, should be able to reach.
check(narrow._bindCore === undefined, 'a restricted host does not expose _bindCore');
check(typeof full._bindCore === 'function', 'sanity: the full host does expose _bindCore');

// Dropping _bindCore from restricted copies must not break open/close: they
// close over the SAME `core` variable inside makeHost as the original host,
// so binding via the original (main.js's only call site) still wires every
// restricted copy — including ones built BEFORE the bind, as main.js does for
// `legacy` (restrictHost'd, then `host._bindCore(core)` runs after).
{
  const bindServices = { ...services };
  const bindHost = makeHost(bindServices);
  const bindNarrow = restrictHost(bindHost, []);   // built BEFORE _bindCore, like legacy in main.js
  const bindCore = new Core({ host: bindHost });
  const bindStub = (id) => ({ id, enter() {}, update() {}, render() {} });
  bindCore.register(bindStub('legacy'));
  bindCore.register(bindStub('match3'));
  bindHost._bindCore(bindCore);                    // only the ORIGINAL host can do this
  bindCore.boot('legacy');
  bindNarrow.open('match3');
  bindCore.update(0.016);
  check(bindCore.activeId() === 'match3',
    'open() on a restricted host (without _bindCore) still reaches Core, once bound via the original host');
  bindNarrow.close();
  bindCore.update(0.016);
  check(bindCore.activeId() === 'legacy',
    'close() on a restricted host (without _bindCore) still reaches Core');
}

// --- restrictHost must derive its ungated set from GATED_CAPABILITIES, not a
// second hardcoded list — a manifest declaring every gated capability should
// get back something bit-for-bit lossless against the full host FOR EVERY
// PUBLIC (non-`_`-prefixed) key, and a brand new ungated service added to
// makeHost later must survive automatically (this is what would have
// silently broken under the old UNGATED literal). Internal keys (currently
// just `_bindCore`) are excluded on purpose — see the _bindCore check above.
const allCaps = restrictHost(full, ['economy', 'progression', 'achievements', 'world']);
const publicKeysOfFull = Object.keys(full).filter((k) => !k.startsWith('_'));
check(Object.keys(allCaps).length === publicKeysOfFull.length,
  'declaring every gated capability yields the same public-key count as the full host');
for (const k of publicKeysOfFull) {
  check(allCaps[k] === full[k], `restrictHost is lossless for key '${k}' when every capability is declared`);
}
check(allCaps._bindCore === undefined,
  'restrictHost drops _bindCore even when every gated capability is declared');

const hostWithNewService = makeHost(services);
hostWithNewService.newThing = { ok: true };   // simulates a future ungated service added to makeHost
const restrictedWithNewService = restrictHost(hostWithNewService, []);
check(restrictedWithNewService.newThing === hostWithNewService.newThing,
  'a new ungated service added to the host survives restriction without touching restrictHost');

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
check(!/makeMatch3\(\{\s*host\s*\}\)/.test(mainSrc)
  && !/makeMatch3\(\{\s*host:\s*host\b/.test(mainSrc),
  'match3 is no longer constructed with the raw, unrestricted host (shorthand or `host: host`)');
check(!/createLegacyMiniGame\(\{[^}]*\bhost\s*,/.test(mainSrc)
  && !/createLegacyMiniGame\(\{[^}]*\bhost:\s*host\b/.test(mainSrc),
  'legacy is no longer constructed with the raw, unrestricted host');

console.log(`ok capabilities.test.mjs (${pass} checks)`);
