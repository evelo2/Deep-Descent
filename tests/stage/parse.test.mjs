import { STAGE } from '../../src/config.js';
import { THEMES, getTheme } from '../../src/stage/themes.js';

let failed = 0, passed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`ok   - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}`); }
}
function done() { console.log(`\n${passed} passed, ${failed} failed`); if (failed) process.exit(1); }

assert('two themes ship+lair', THEMES.length === 2 && THEMES[0].key === 'ship' && THEMES[1].key === 'lair');
assert('getTheme returns lair', getTheme('lair').name === 'THE LAIR');
assert('getTheme falls back', getTheme('nope') === THEMES[0]);
for (const th of THEMES) {
  assert(`${th.key} has 3 rooms`, th.rooms.length === 3);
  for (let i = 0; i < th.rooms.length; i++) {
    const room = th.rooms[i];
    assert(`${th.key} room ${i} has ${STAGE.rows} rows`, room.length === STAGE.rows);
    const badRow = room.findIndex((r) => r.length !== STAGE.cols);
    assert(`${th.key} room ${i} all rows are ${STAGE.cols} chars`, badRow === -1);
    assert(`${th.key} room ${i} has exactly one S`, room.join('').split('S').length - 1 === 1);
    assert(`${th.key} room ${i} has an exit >`, room.join('').includes('>'));
  }
  const last = th.rooms[th.rooms.length - 1];
  assert(`${th.key} final room has a cache $`, last.join('').includes('$'));
}
done();
