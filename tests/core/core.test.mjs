// Core lifecycle contract. Run: node tests/core/core.test.mjs
// The Core registers MiniGames, boots one (handing it the Host via enter),
// delegates update/render to the active mode, and on exit routes the returned
// result through creditResult. In Phase 1 creditResult is a no-op-with-hook.
import { Core } from '../../src/core/core.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// A fake MiniGame that records how the Core drove it.
function fakeMiniGame(id, result) {
  return {
    id,
    log: [],
    enteredHost: null,
    enter(host) { this.enteredHost = host; this.log.push('enter'); },
    update(dt) { this.log.push(`update:${dt}`); },
    render(ctx) { this.log.push(`render:${ctx}`); },
    exit() { this.log.push('exit'); return result; },
  };
}

const host = { _k: 'host' };

// --- 1. boot(id) activates the registered mode and calls enter(host) ---
{
  const core = new Core({ host });
  const mg = fakeMiniGame('fake');
  core.register(mg);
  core.boot('fake');
  check('active is the booted mode', core.active === mg);
  check('enter was called', mg.log[0] === 'enter');
  check('enter received the host', mg.enteredHost === host);
}

// --- 2. update/render delegate to the active mode ---
{
  const core = new Core({ host });
  const mg = fakeMiniGame('fake');
  core.register(mg);
  core.boot('fake');
  core.update(0.016);
  core.render('CTX');
  check('update delegated', mg.log.includes('update:0.016'));
  check('render delegated', mg.log.includes('render:CTX'));
}

// --- 3. exit routes its result through creditResult ---
{
  const credited = [];
  const core = new Core({ host, creditResult: (r) => credited.push(r) });
  const result = { outcome: 'gameover', salvage: 7 };
  const mg = fakeMiniGame('fake', result);
  core.register(mg);
  core.boot('fake');
  const returned = core.exitActive();
  check('exit() was called', mg.log.includes('exit'));
  check('result credited', credited.length === 1 && credited[0] === result);
  check('exitActive returns the result', returned === result);
}

// --- 4. default creditResult is a safe no-op (Phase 1) ---
{
  const core = new Core({ host });               // no creditResult injected
  const mg = fakeMiniGame('fake', { outcome: 'quit' });
  core.register(mg);
  core.boot('fake');
  let threw = false;
  try { core.exitActive(); } catch { threw = true; }
  check('default creditResult does not throw', !threw);
}

// --- 5. booting an unknown id throws (fail fast, not silent) ---
{
  const core = new Core({ host });
  let threw = false;
  try { core.boot('nope'); } catch { threw = true; }
  check('unknown boot id throws', threw);
}

// --- 6. update/render before boot are safe no-ops ---
{
  const core = new Core({ host });
  let threw = false;
  try { core.update(0.016); core.render('CTX'); } catch { threw = true; }
  check('update/render with no active mode do not throw', !threw);
}

console.log(`core: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
