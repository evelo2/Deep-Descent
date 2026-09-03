// Benchmark, not a test — measures Cave generation at each Deep Reefs tier size.
// Named .bench.mjs so the test runner (find tests -name "*.test.mjs") skips it.
// Run: node tests/game/cave-perf.bench.mjs
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      fillRect() {}, clearRect() {}, save() {}, restore() {}, beginPath() {},
      arc() {}, fill() {}, stroke() {}, drawImage() {}, translate() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
      textAlign: '', textBaseline: '',
    }),
  }),
};

const { WORLD } = await import('../../src/config.js');
const { Cave } = await import('../../src/systems/cave.js');

// The four tier sizes from the spec, with the reef number each is measured at.
const TIERS = [
  { name: 'tier 1 (reef 1)',  reef: 1,  WW: 2760, WH: 4200 },
  { name: 'tier 2 (reef 10)', reef: 10, WW: 3600, WH: 7090 },
  { name: 'tier 3 (reef 20)', reef: 20, WW: 4200, WH: 11590 },
  { name: 'tier 4 (reef 40)', reef: 40, WW: 4800, WH: 18090 },
];

for (const t of TIERS) {
  WORLD.WW = t.WW; WORLD.WH = t.WH;
  const cells = Math.ceil(t.WW / WORLD.CELL) * Math.ceil(t.WH / WORLD.CELL);
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    new Cave('reef', t.reef);
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  console.log(`${t.name.padEnd(18)} ${String(cells).padStart(7)} cells   median ${runs[2].toFixed(0)} ms   worst ${runs[4].toFixed(0)} ms`);
}
