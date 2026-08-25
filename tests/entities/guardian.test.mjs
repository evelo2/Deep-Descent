// The Guardian mirrors the Kraken's combat interface: harpoon/charge chip its
// hp; at 0 it plays a short death animation then flags `dead`. Body contact
// with the diver returns true while alive.
import { Guardian } from '../../src/entities/guardian.js';
import { GUARDIAN } from '../../src/config.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

const g = new Guardian(100, 100);
check(g.hp === GUARDIAN.hp && g.maxHp === GUARDIAN.hp, 'spawns at full hp');
check(g.dead === false, 'not dead at spawn');

g.takeDamage(1);
check(g.hp === GUARDIAN.hp - 1, 'takeDamage chips one hp');
check(g.hurtT > 0, 'takeDamage sets a hurt flash');

g.takeDamage(GUARDIAN.hp);             // overkill floors at 0, never negative
check(g.hp === 0, 'hp floors at 0');
check(g.dead === false, 'not dead the instant hp hits 0 (death anim first)');

for (let i = 0; i < 200; i++) g.update(1 / 60, i / 60, { x: 9999, y: 9999, radius: 8 }, null);
check(g.dead === true, 'dead after the death animation elapses');

// Body contact while alive.
const live = new Guardian(0, 0);
check(live.hits({ x: 0, y: 0, radius: 8 }) === true, 'body contact hits the diver');
check(live.hits({ x: 5000, y: 5000, radius: 8 }) === false, 'far diver is not hit');

// Harpoon tip on the body registers.
const near = { tip: () => ({ x: 0, y: 0 }) };
const far = { tip: () => ({ x: 5000, y: 5000 }) };
check(live.harpoonHit(near) === true, 'harpoon on body hits');
check(live.harpoonHit(far) === false, 'harpoon miss does not hit');
console.log(`ok guardian.test.mjs (${pass} checks)`);
