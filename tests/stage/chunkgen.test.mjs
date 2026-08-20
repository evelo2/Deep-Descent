// Chunk generator structural/contract/solvability gate.
// Run: node tests/stage/chunkgen.test.mjs
import { mulberry32, generateRoom } from '../../src/stage/chunkgen.js';
import { solvable } from '../../src/stage/solver.js';

let passed = 0, failed = 0;
const check = (name, cond) => (cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`)));

const ROWS = 20, COLS = 30;
const LEGAL = new Set(['.', '#', 'H', '^', '>', 'S', 'o', '$', 'x', 'E']);
const SEEDS = 200;
const DIFFICULTIES = [1, 2, 3];

function countGlyph(rows, g) {
  let n = 0;
  for (const row of rows) for (const ch of row) if (ch === g) n++;
  return n;
}

// --- 1 & 2: structural + contract checks over the full sample ---
const samples = []; // { seed, difficulty, hasCache, rows }
for (let seed = 0; seed < SEEDS; seed++) {
  for (const difficulty of DIFFICULTIES) {
    const hasCache = seed % 2 === 0;
    const rng = mulberry32(seed * 7919 + difficulty); // decorrelate seed/difficulty streams
    const rows = generateRoom({ rng, difficulty, hasCache });
    samples.push({ seed, difficulty, hasCache, rows });
  }
}

check('generated sample size', samples.length === SEEDS * DIFFICULTIES.length);

for (const { seed, difficulty, hasCache, rows } of samples) {
  const tag = `seed=${seed} diff=${difficulty} cache=${hasCache}`;

  check(`${tag}: exactly 20 rows`, rows.length === ROWS);
  check(`${tag}: every row exactly 30 chars`, rows.every((r) => r.length === COLS));

  let onlyLegal = true;
  for (const row of rows) for (const ch of row) if (!LEGAL.has(ch)) onlyLegal = false;
  check(`${tag}: only legal glyphs`, onlyLegal);

  check(`${tag}: exactly one S`, countGlyph(rows, 'S') === 1);
  check(`${tag}: exactly one >`, countGlyph(rows, '>') === 1);
  check(`${tag}: row 19 all solid`, rows[19] === '#'.repeat(COLS));
  check(`${tag}: $ count matches hasCache`, countGlyph(rows, '$') === (hasCache ? 1 : 0));

  // --- contract ---
  const spawnRow = rows.findIndex((r) => r.includes('S'));
  const spawnCol = spawnRow >= 0 ? rows[spawnRow].indexOf('S') : -1;
  check(`${tag}: S found`, spawnRow >= 0 && spawnCol >= 0);
  if (spawnRow >= 0 && spawnRow + 1 < ROWS) {
    check(`${tag}: # directly below S`, rows[spawnRow + 1][spawnCol] === '#');
  }

  const exitRow = 18;
  const exitCol = rows[exitRow].indexOf('>');
  check(`${tag}: > is on row 18`, exitCol >= 0);
  if (exitCol >= 0) {
    check(`${tag}: # directly below >`, rows[19][exitCol] === '#');
  }

  // spine column: the H sharing spawnRow with S (its top rung)
  const spineCol = spawnRow >= 0 ? rows[spawnRow].indexOf('H') : -1;
  check(`${tag}: spine top rung found on spawn row`, spineCol >= 0);
  if (spineCol >= 0) {
    let continuous = true;
    for (let r = spawnRow; r <= 18; r++) if (rows[r][spineCol] !== 'H') continuous = false;
    check(`${tag}: continuous H spine from spawn row to row 18`, continuous);
  }
}

// --- 3: solvability (chained with Phase 1's solver) ---
let ok = 0;
const failures = [];
for (const { seed, difficulty, hasCache, rows } of samples) {
  const res = solvable(rows);
  if (res.ok) ok++;
  else failures.push({ seed, difficulty, hasCache, res });
}
const rate = ok / samples.length;
console.log(`chunkgen: solvability ok-rate = ${ok}/${samples.length} = ${rate.toFixed(4)}`);
if (failures.length) {
  console.log('chunkgen: unsolvable samples:');
  for (const f of failures) {
    console.log(`  seed=${f.seed} difficulty=${f.difficulty} hasCache=${f.hasCache} reachExit=${f.res.reachExit} reachCache=${f.res.reachCache}`);
  }
}
check('solvability ok-rate >= 0.98', rate >= 0.98);

console.log(`chunkgen: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
