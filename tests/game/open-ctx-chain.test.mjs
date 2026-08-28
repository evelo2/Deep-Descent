// End-to-end: a launch context handed in at the reef's call site must survive the
// WHOLE chain — reef → the shell's host wrapper in game.js → Host.open →
// Core.open → the target minigame's enter(host, ctx).
//
// The `hoardcleared` achievement rides on this seam: match-3 only ever sets
// hoardCleared when it was entered with { source: 'chest' }, and the shell's
// wrapper (game.js) used to drop enter's second argument — so a chest run looked
// like a menu run and a shipped Steam achievement was unobtainable (dead since P9).
// tests/core/open-context.test.mjs covers Core.open alone; nothing covered the
// wrapper, which is why it went unseen. Run: node tests/game/open-ctx-chain.test.mjs

const mkCtx = () => new Proxy({}, { get: (t, p) => {
  if (p === 'canvas') return { width: 900, height: 600 };
  if (p === 'measureText') return () => ({ width: 10 });
  if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
  if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  return () => {};
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => mkCtx() }) };

import { Game } from '../../src/game.js';
import { WORLD } from '../../src/config.js';
import { Core } from '../../src/core/core.js';
import { makeHost } from '../../src/core/host.js';
import { makeDiverWorld } from '../../src/core/world/index.js';
import { makeMatch3 } from '../../src/minigames/match3/index.js';
import { manifestById } from '../../src/minigames/catalogue.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ctx = mkCtx();
const input = { poll() {}, endFrame() {}, pressed: () => false, consumeStart: () => false, consumeButton: () => false, consumeTapFire: () => false, fireHeld: () => false, fireDown: () => false, vector: () => ({ x: 0, y: 0 }), aimVector: () => null, isTouch: false, hitButtonAt: () => null, pressButton() {}, _btnTouch: false };
const audio = new Proxy({}, { get: () => () => {} });
const particles = { update() {}, draw() {}, bubble() {}, sparkle() {}, burst() {}, ring() {}, spawn() {} };
const economy = { state: { salvage: 0, loadout: [] }, earn({ salvage = 0 } = {}) { this.state.salvage += salvage; return this.state.salvage; } };
const progression = { badges: {}, stats: {}, progress: {} };
const achievements = { unlock() {} };
const world = makeDiverWorld({ viewport: WORLD });

// The real platform wiring, in main.js's order: Host → Core → bind → register.
const host = makeHost({ audio, input, particles, viewport: WORLD, rng: Math.random, economy, progression, achievements, world });
const core = new Core({ host });
host._bindCore(core);

// The shell, built with the real Host — this is the object whose `open` wrapper
// the reef is handed (game.js builds the reef's host literal from it).
const game = new Game(ctx, input, audio, particles, { draw() {} }, { economy, progression, achievements }, world, host);
const reef = game._reef;
check('the shell built the reef with a host that can open siblings', !!reef && typeof reef.host.open === 'function');

// A stand-in for the running legacy game underneath (the reef lives inside it);
// match3 is the real minigame, so this asserts the real enter(), not a spy's.
const seen = [];
core.register({ id: 'legacy', enter() {}, update() {}, render() {} });
const match3 = makeMatch3({ host });
const realEnter = match3.enter.bind(match3);
match3.enter = function (h, c) { seen.push(c); return realEnter(h, c); };
core.register(match3, manifestById('match3'));
core.boot('legacy');

// Exactly what reef/index.js does when the diver swims into an opened chest.
reef.host.open('match3', { source: 'chest' });
core.update(0);   // applies the queued open → enter(host, ctx)

check('ctx survives reef → game.js wrapper → Host.open → Core.open → enter',
  seen.length === 1 && !!seen[0] && seen[0].source === 'chest');
check('match-3 entered as a chest run (the hoardCleared precondition)', match3.source === 'chest');
check('the chest run starts with hoardCleared unset', match3.hoardCleared === false);

// The manifest DESCRIBES this launch context ('chest' world entry). The shell
// must actually deliver what the manifest advertises, or the catalogue is lying
// about how the minigame gets entered.
const chestEntry = manifestById('match3').entries.find((e) => e.id === 'chest');
check('match3 manifest declares the chest world entry with its ctx',
  !!chestEntry && chestEntry.kind === 'world' && !!chestEntry.ctx);
check('the ctx the shell delivered matches the manifest entry verbatim',
  JSON.stringify(seen[0]) === JSON.stringify(chestEntry && chestEntry.ctx));

if (failed) { console.error(`FAILED ${failed} check(s)`); process.exit(1); }
console.log(`ok open-ctx-chain.test.mjs (${passed} checks)`);
