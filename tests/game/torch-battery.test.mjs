// Test the torch's battery economics. The torch is a standalone shop item that
// shares the shock-rod battery (SHOCK.batteryMax): lit, it drains TORCH.drain/s
// and auto-cuts out at empty; off, the battery recharges at SHOCK.recharge/s.
// This models game.update()'s battery block with the real config values so the
// tuning (burn time, auto-off, recharge) stays sane. Run: node tests/game/torch-battery.test.mjs

import { TORCH, SHOCK } from '../../src/config.js';

let passed = 0, failed = 0;
const check = (name, cond) => cond ? passed++ : (failed++, console.error(`  FAIL: ${name}`));

// --- Config invariants: standalone battery light for dark caves. --------------
check('torch has a drain rate', TORCH.drain > 0);
check('torch litRadius sits between unlit and flare', TORCH.litRadius > 52 && TORCH.litRadius < 300);
check('torch is a real cost', TORCH.cost >= 200);
check('torch shares the shock battery ceiling', SHOCK.batteryMax > 0);

// Mirror of update()'s battery block.
function stepBattery(state, dt) {
  if (state.torchOn) {
    state.shockBattery = Math.max(0, state.shockBattery - TORCH.drain * dt);
    if (state.shockBattery <= 0) state.torchOn = false;   // auto-off when flat
  } else {
    state.shockBattery = Math.min(SHOCK.batteryMax, state.shockBattery + SHOCK.recharge * dt);
  }
}

// --- Burning drains the battery and auto-offs when empty. ---------------------
{
  const s = { torchOn: true, shockBattery: SHOCK.batteryMax };
  let t = 0; const dt = 1 / 60;
  while (s.torchOn && t < 60) { stepBattery(s, dt); t += dt; }
  const expected = SHOCK.batteryMax / TORCH.drain;   // seconds of light on a full battery
  check('torch auto-offs when the battery is spent', s.torchOn === false);
  check('battery is empty at cutout', s.shockBattery <= 0.0001);
  check('burn time matches battery/drain (~' + expected.toFixed(1) + 's)', Math.abs(t - expected) < 0.5);
  check('a full battery gives a usable burn (>=8s)', expected >= 8);
}

// --- Off, the battery recharges back up to the ceiling. -----------------------
{
  const s = { torchOn: false, shockBattery: 0 };
  let t = 0; const dt = 1 / 60;
  while (s.shockBattery < SHOCK.batteryMax && t < 60) { stepBattery(s, dt); t += dt; }
  check('battery recharges to full when idle', Math.abs(s.shockBattery - SHOCK.batteryMax) < 0.0001);
  check('recharge never overshoots the ceiling', s.shockBattery <= SHOCK.batteryMax);
}

// --- Toggling the torch off mid-burn stops the drain. ------------------------
{
  const s = { torchOn: true, shockBattery: 50 };
  stepBattery(s, 1);            // ~1s of drain
  const afterOneSec = s.shockBattery;
  check('one second of light drained the battery', afterOneSec < 50);
  s.torchOn = false;
  stepBattery(s, 1);            // now recharging
  check('switching off reverses to recharge', s.shockBattery > afterOneSec);
}

console.log(`torch-battery: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
