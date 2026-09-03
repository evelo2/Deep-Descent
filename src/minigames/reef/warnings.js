// @ts-check
// Which one-time depth warning (if any) is due right now. Pure and split into
// its own module so the decision is asserted without a canvas or a reef.
import { DEPTH, crushDepthM } from '../../config.js';

export const WARN_COPY = {
  oxygenLine: {
    title: '⚠  OXYGEN LINE',
    lines: [
      `Below ${DEPTH.oxygenLineM} m the water takes your air far faster.`,
      'A bigger Air Tank buys you the time to work down here.',
      'The gauge shows the line in amber.',
    ],
  },
  crushLine: {
    title: '☠  CRUSH DEPTH',
    lines: [
      'Below the red line the pressure will kill you.',
      `You have ${DEPTH.crushTimer} seconds to climb back above it.`,
      'A deeper Depth Valve moves the line down. Nothing else will.',
    ],
  },
};

// depthM: the diver's depth. valveLevel: 0-3. seen: { oxygenLine, crushLine }.
// Returns the warning to show, or null. The crush warning outranks the oxygen
// one — it is the lethal one. Pure and total: a missing/null/undefined `seen`
// (or missing keys within it) is treated as nothing seen yet, never thrown.
export function warnKindFor(depthM, valveLevel, seen) {
  const s = seen || {};
  if (!s.crushLine && depthM > crushDepthM(valveLevel) - DEPTH.approachWarnM) return 'crushLine';
  if (!s.oxygenLine && depthM > DEPTH.oxygenLineM - DEPTH.approachWarnM) return 'oxygenLine';
  return null;
}
