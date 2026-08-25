// Core.open(id, ctx) forwards the optional context to the mode's enter(host, ctx).
// Backward-compatible: opening with no ctx passes undefined.
import { Core } from '../../src/core/core.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const host = {};
const seen = [];
const base = { id: 'base', enter() {}, update() {}, render() {} };
const modal = { id: 'modal', enter(h, ctx) { seen.push(ctx); }, update() {}, render() {} };
const core = new Core({ host, creditResult() {} });
core.register(base).register(modal);
core.boot('base');

core.open('modal', { source: 'chest' });
core.update(0);                       // applies the queued open → enter(host, ctx)
check(seen.length === 1 && seen[0] && seen[0].source === 'chest', 'ctx forwarded to enter');

core.close();
core.update(0);
core.open('modal');                   // no ctx → enter(host, undefined)
core.update(0);
check(seen.length === 2 && seen[1] === undefined, 'opening without ctx passes undefined');
console.log(`ok open-context.test.mjs (${pass} checks)`);
