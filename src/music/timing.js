// @ts-check
// Scheduling maths shared by the score and the tension layer. Kept in its own
// module so tension.js can use it without importing index.js, which imports
// tension.js back.

// The event times inside [from, to) that follow `prev` at `interval` spacing.
// Pure, and the reason scheduling never drifts: callers advance a window against
// ctx.currentTime instead of chaining setTimeout.
export function eventTimes(prev, interval, from, to) {
  const out = [];
  if (interval <= 0) return out;
  for (let t = prev + interval; t < to; t += interval) if (t >= from) out.push(t);
  return out;
}
