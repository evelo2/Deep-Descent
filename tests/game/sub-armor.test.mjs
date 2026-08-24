// The Deep round 2: sub hull armor soaks several hits then ejects (forfeiting
// the trench haul), the net is the only weapon while piloting, and surfacing
// from any special level tops the tank up. Stub-driven unit tests.
// Run: node tests/game/sub-armor.test.mjs

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

import { Reef } from '../../src/minigames/reef/index.js';
import { SUB, GAME } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

const weaponGet = Object.getOwnPropertyDescriptor(Reef.prototype, 'weapon').get;

// --- Net is the only weapon in the sub ---
{
  check('in the sub, the weapon is always the net', weaponGet.call({ inSub: true, weapons: ['harpoon', 'net'], weaponIdx: 0 }) === 'net');
  check('out of the sub, the selected weapon is used', weaponGet.call({ inSub: false, weapons: ['harpoon', 'net'], weaponIdx: 0 }) === 'harpoon');

  // Cycling is blocked while piloting.
  const s = { inSub: true, weapons: ['harpoon', 'net'], weaponIdx: 0, weaponSwapT: 0, audio: { select() {} } };
  Reef.prototype._cycleWeapon.call(s, 1);
  check('cannot switch weapons in the sub', s.weaponIdx === 0);
}

// --- Hull armor soaks hits, then the next hit ejects ---
{
  const mk = () => ({
    _platingReady: false, inSub: true, subArmor: SUB.armor,
    flash: 0, shake: 0, puName: '', puCol: '', puT: 0,
    audio: { hit() {}, gasp() {} }, ejected: false,
    _ejectFromAbyss() { this.ejected = true; },
  });
  const s = mk();
  const start = SUB.armor;
  for (let i = 0; i < start; i++) Reef.prototype._hit.call(s);
  check('armored hits do NOT eject', s.ejected === false && s.subArmor === 0);
  check(`armor drained over ${start} hits`, s.subArmor === 0);
  Reef.prototype._hit.call(s);   // armor spent → the next hit ejects
  check('the hit after armor is gone ejects the diver', s.ejected === true);
}

// --- Ejection forfeits the trench haul (restores carried to entry) ---
{
  const s = {
    carried: 900, carriedPearls: 3, _abyssEntryCarried: 200, _abyssEntryPearls: 1,
    flash: 0, shake: 0, puName: '', puCol: '', puT: 0, audio: { gasp() {} },
    _exitAbyss() { this.exited = true; },
  };
  Reef.prototype._ejectFromAbyss.call(s);
  check('ejection restores carried loot to the entry value', s.carried === 200);
  check('ejection restores carried pearls to the entry value', s.carriedPearls === 1);
  check('ejection surfaces via _exitAbyss', s.exited === true);
}

// --- Surfacing from a special level tops up air (up to exitAirRefillFrac) ---
{
  const KEYS_UNDEF = {};   // savedReef needs the snapshot keys; undefined is fine on a stub
  const s = {
    savedReef: { returnX: 0, returnY: 0, ...KEYS_UNDEF },
    air: 10, airMax: 100, zoneFade: 0, reentryT: 0,
    _placeDiver() {}, audio: { bank() {} },
  };
  Reef.prototype._restoreReef.call(s);
  check('exiting refills air by exitAirRefillFrac of the tank', Math.abs(s.air - (10 + 100 * GAME.exitAirRefillFrac)) < 1e-9);

  // Never overfills past the tank.
  const full = { savedReef: { returnX: 0, returnY: 0 }, air: 80, airMax: 100, zoneFade: 0, reentryT: 0, _placeDiver() {}, audio: { bank() {} } };
  Reef.prototype._restoreReef.call(full);
  check('the air top-up is capped at airMax', full.air === 100);
}

// --- Config sanity ---
{
  check('SUB.armor is a positive integer', Number.isInteger(SUB.armor) && SUB.armor >= 1);
  check('exitAirRefillFrac is a fraction in (0,1]', GAME.exitAirRefillFrac > 0 && GAME.exitAirRefillFrac <= 1);
}

console.log(`sub-armor: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
