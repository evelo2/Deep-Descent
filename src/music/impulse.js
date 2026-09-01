// @ts-check
// A generated impulse response: stereo noise under an exponential decay. Cheap
// to build, no asset, and it is what gives the score its space. Shared by the
// score and the sea-life bed, which needs its own reverb because it hangs off
// the master gain rather than the music bus.
export function makeImpulse(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      d[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buf;
}
