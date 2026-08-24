// tests/core/stack.test.mjs
import { Core } from '../../src/core/core.js';

let pass = 0;
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } pass++; };

function fakeMG(id, log) {
  return {
    id,
    enter() { log.push(`enter:${id}`); },
    update() { log.push(`update:${id}`); },
    render() { log.push(`render:${id}`); },
    exit() { log.push(`exit:${id}`); return { salvage: id === 'match3' ? 7 : 0, credited: true }; },
  };
}

// open pushes + enters; only the top updates/renders
{
  const log = [];
  const credited = [];
  const core = new Core({ host: {}, creditResult: (r) => credited.push(r) });
  core.register(fakeMG('home', log)).register(fakeMG('match3', log));
  core.boot('home');
  check(core.activeId() === 'home', 'base is home after boot');

  core.open('match3');
  check(core.activeId() === 'home', 'open is deferred until next update');
  core.update(0.016);                       // applies pending, then updates top
  check(core.activeId() === 'match3', 'match3 is top after update boundary');
  check(log.includes('enter:match3'), 'match3 entered');
  log.length = 0;
  core.update(0.016); core.render({});
  check(log.join(',') === 'update:match3,render:match3', 'only top drives the frame');

  // close pops + credits + resumes home (no re-enter)
  core.close({ salvage: 7, credited: true });
  core.update(0.016);
  check(core.activeId() === 'home', 'home resumes after close');
  check(log.includes('exit:match3'), 'match3 exited on close');
  check(!log.includes('enter:home'), 'home is NOT re-entered on resume');
  check(credited.length === 1 && credited[0].salvage === 7, 'close routed result to creditResult');

  // close on the base is a no-op (never pop the home)
  core.close();
  core.update(0.016);
  check(core.activeId() === 'home', 'base is never popped');
}

console.log(`ok stack.test.mjs (${pass} checks)`);
