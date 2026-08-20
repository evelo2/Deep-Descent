// Generate-and-test wrapper gate. Run: node tests/stage/stagegen.test.mjs
// Key check: makeStageRooms() NEVER returns an unsolvable room, across every
// theme x reef 1..13 x several seeds — assert the guarantee hard (every room,
// not a rate) — and generated rooms parse under the real Stage engine.
import { THEMES } from '../../src/stage/themes.js';
import { makeStageRooms, mulberry32 } from '../../src/stage/chunkgen.js';
import { solvable } from '../../src/stage/solver.js';
import { Stage } from '../../src/stage/stage.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const ROWS = 20, COLS = 30;
const SEEDS = [1, 2, 3, 42, 1337, 999999];
const REEFS = Array.from({ length: 13 }, (_, i) => i + 1);

let totalRooms = 0, totalSolvable = 0;

for (const theme of THEMES) {
  for (const reef of REEFS) {
    for (const seed of SEEDS) {
      const rooms = makeStageRooms(theme, reef, mulberry32(seed));

      // 1. exact count + shape
      check(
        `${theme.key} reef${reef} seed${seed}: room count`,
        rooms.length === theme.rooms.length
      );
      rooms.forEach((room, i) => {
        check(`${theme.key} reef${reef} seed${seed} room${i}: ${ROWS} rows`, room.length === ROWS);
        check(
          `${theme.key} reef${reef} seed${seed} room${i}: ${COLS} cols each`,
          room.every((r) => r.length === COLS)
        );
      });

      // 2. the generate-and-test guarantee: EVERY room solvable
      rooms.forEach((room, i) => {
        totalRooms++;
        const res = solvable(room);
        if (res.ok) totalSolvable++;
        check(`${theme.key} reef${reef} seed${seed} room${i}: solvable().ok`, res.ok === true);
        if (!res.ok) {
          console.error(`    -> unsolvable room: theme=${theme.key} reef=${reef} seed=${seed} room=${i}`);
        }
      });

      // 3. exactly one S, one >, per room; exactly one $ total, on the last room
      rooms.forEach((room, i) => {
        const countGlyph = (ch) => room.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
        check(`${theme.key} reef${reef} seed${seed} room${i}: exactly one S`, countGlyph('S') === 1);
        check(`${theme.key} reef${reef} seed${seed} room${i}: exactly one >`, countGlyph('>') === 1);
      });
      const dollarCounts = rooms.map((room) => room.reduce((n, r) => n + [...r].filter((c) => c === '$').length, 0));
      const totalDollars = dollarCounts.reduce((a, b) => a + b, 0);
      check(`${theme.key} reef${reef} seed${seed}: exactly one $ total`, totalDollars === 1);
      check(
        `${theme.key} reef${reef} seed${seed}: $ is on the last room`,
        dollarCounts[dollarCounts.length - 1] === 1
      );

      // 4. real-engine smoke: Stage constructs from generated rooms
      let stage = null, threw = null;
      try {
        stage = new Stage({ ...theme, rooms, decor: undefined });
      } catch (e) {
        threw = e;
      }
      check(`${theme.key} reef${reef} seed${seed}: Stage constructs without throwing`, threw === null);
      if (stage) {
        check(`${theme.key} reef${reef} seed${seed}: stage.rooms.length matches`, stage.rooms.length === rooms.length);
        check(`${theme.key} reef${reef} seed${seed}: stage.roomIndex === 0`, stage.roomIndex === 0);
      }
    }
  }
}

// 5. Difficulty mapping spot-check: reef 1 vs reef 5 both succeed, all solvable.
for (const theme of THEMES) {
  for (const seed of SEEDS) {
    const roomsLow = makeStageRooms(theme, 1, mulberry32(seed));
    const roomsHigh = makeStageRooms(theme, 5, mulberry32(seed));
    check(
      `${theme.key} seed${seed}: reef1 all solvable`,
      roomsLow.every((room) => solvable(room).ok === true)
    );
    check(
      `${theme.key} seed${seed}: reef5 all solvable`,
      roomsHigh.every((room) => solvable(room).ok === true)
    );
  }
}

console.log(`stagegen: ${passed} passed, ${failed} failed (rooms checked: ${totalRooms}, solvable: ${totalSolvable})`);
if (failed > 0) process.exit(1);
