// About-screen version data: version.js exports an engine version, Core.versions()
// enumerates registered minigames' {id, name, version} (with fallbacks), and the
// real match-3 module carries its own name + version.
import { Core } from '../../src/core/core.js';
import { ENGINE_VERSION, VERSION } from '../../src/version.js';
import { makeMatch3 } from '../../src/minigames/match3/index.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };
const semver = (s) => typeof s === 'string' && /^\d+\.\d+\.\d+$/.test(s);

check(semver(ENGINE_VERSION), 'ENGINE_VERSION is a semver string');
check(semver(VERSION), 'VERSION is a semver string');

// Core.versions() maps the registry, falling back to id / '—' when omitted.
const core = new Core({ host: {} });
core.register({ id: 'legacy', name: 'Reef Dive', version: '1.0.0', enter() {}, update() {}, render() {} });
core.register({ id: 'match3', name: 'Treasure Chest Madness', version: '1.1.0', enter() {}, update() {}, render() {} });
core.register({ id: 'bare', enter() {}, update() {}, render() {} });   // no name/version

const v = core.versions();
check(v.length === 3, 'versions() lists every registered minigame');
const m3 = v.find((x) => x.id === 'match3');
check(m3 && m3.name === 'Treasure Chest Madness' && m3.version === '1.1.0', 'match3 name + version reported');
const reef = v.find((x) => x.id === 'legacy');
check(reef && reef.name === 'Reef Dive' && reef.version === '1.0.0', 'reef name + version reported');
const bare = v.find((x) => x.id === 'bare');
check(bare && bare.name === 'bare' && bare.version === '—', 'missing name/version fall back to id / —');

// The real match-3 module object carries its own identity (object creation does
// not touch the host, so a stub is fine).
const mod = makeMatch3({ host: {} });
check(mod.id === 'match3' && mod.name === 'Treasure Chest Madness' && semver(mod.version),
  'the match-3 module declares id/name/version');

console.log(`ok versions.test.mjs (${pass} checks)`);
