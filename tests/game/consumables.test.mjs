// Timed consumable shop buffs: config integrity, the m:ss HUD formatter, and
// the _shopBuy purchase branch (deduct gold → set the buff timer to its full
// duration). The effect application (air-drain / swim / magnet) is inline in
// update() and covered by playtest; here we lock the data + purchase logic.
// Run: node tests/game/consumables.test.mjs

// Cave's constructor touches the DOM; _shopBuy here uses a hand-built stub, so
// no world-gen runs — but importing game.js still needs a document stub for the
// module-level side effects other tests rely on. Mirror abyss-air's stub.
globalThis.document = {
  createElement: () => {
    const ctx = {
      fillRect() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      translate() {}, scale() {}, rotate() {}, drawImage() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {}, quadraticCurveTo() {}, strokeRect() {},
    };
    return { width: 0, height: 0, getContext: () => ctx };
  },
};

import { Game } from '../../src/game.js';
import { CONSUMABLE, CONSUMABLE_BY_ID } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Config integrity ---
{
  check('there are consumables defined', Array.isArray(CONSUMABLE) && CONSUMABLE.length >= 1);
  const ids = CONSUMABLE.map((c) => c.id);
  check('consumable ids are unique', new Set(ids).size === ids.length);
  check('every consumable has a positive cost and duration',
    CONSUMABLE.every((c) => c.cost > 0 && c.dur > 0 && c.name && c.glyph && c.desc));
  check('CONSUMABLE_BY_ID indexes every entry', CONSUMABLE.every((c) => CONSUMABLE_BY_ID[c.id] === c));
  check('suit carries an air-drain multiplier < 1', CONSUMABLE_BY_ID.suit && CONSUMABLE_BY_ID.suit.airMult < 1);
  check('fins carries a swim multiplier > 1', CONSUMABLE_BY_ID.fins && CONSUMABLE_BY_ID.fins.swimMult > 1);
  check('lantern flags a magnet effect', CONSUMABLE_BY_ID.lantern && CONSUMABLE_BY_ID.lantern.magnet === true);
}

// --- m:ss formatter ---
{
  const f = Game.prototype._mmss.bind({});
  check('_mmss(0) is 0:00', f(0) === '0:00');
  check('_mmss(5) rounds up to 0:05', f(5) === '0:05');
  check('_mmss(65) is 1:05', f(65) === '1:05');
  check('_mmss(900) is 15:00', f(900) === '15:00');
  check('_mmss(-3) floors at 0:00', f(-3) === '0:00');
}

// --- Purchase branch: deduct gold, set the timer to full duration ---
{
  const c = CONSUMABLE_BY_ID.suit;
  const stub = {
    _shopItems: () => [{ kind: 'consumable', id: 'suit', cost: c.cost }],
    shopSel: 0, gold: c.cost + 500, buffT: { suit: 0, fins: 0, lantern: 0 },
    diver: { x: 0, y: 0 }, particles: { sparkle() {} }, audio: { bank() {}, gasp() {} },
  };
  Game.prototype._shopBuy.call(stub);
  check('buying a consumable deducts its gold cost', stub.gold === 500);
  check('buying sets the buff timer to its full duration', stub.buffT.suit === c.dur);

  // Re-buy refreshes (sets, not stacks) the timer even when partly spent.
  stub.gold = c.cost + 10; stub.buffT.suit = 12;
  Game.prototype._shopBuy.call(stub);
  check('re-buying refreshes the timer to full (does not stack)', stub.buffT.suit === c.dur);

  // Can't afford → no change, no timer set.
  const broke = {
    _shopItems: () => [{ kind: 'consumable', id: 'fins', cost: 9999 }],
    shopSel: 0, gold: 100, buffT: { suit: 0, fins: 0, lantern: 0 },
    diver: { x: 0, y: 0 }, particles: { sparkle() {} }, audio: { bank() {}, gasp() {} },
    shopDeny: 0,
  };
  Game.prototype._shopBuy.call(broke);
  check('cannot buy without enough gold (timer stays 0, gold unchanged)', broke.buffT.fins === 0 && broke.gold === 100);
}

console.log(`consumables: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
