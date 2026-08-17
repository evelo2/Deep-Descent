// A sunken shipwreck — evocative scenery seated in a cave chamber. Purely
// decorative for collision (you swim over/through it); the treasure the Game
// scatters around it is what rewards exploring it.
import { drawWreck } from '../render/props.js';

export class Wreck {
  constructor(x, y) { this.x = x; this.y = y; }
  draw(ctx, camY, t) {
    const sy = this.y - camY;
    ctx.save();
    ctx.translate(this.x, sy);
    drawWreck(ctx, t);
    ctx.restore();
  }
}
