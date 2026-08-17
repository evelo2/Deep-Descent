// A sunken shipwreck — evocative scenery seated in a cave chamber. Purely
// decorative for collision (you swim over/through it); the treasure the Game
// scatters around it is what rewards exploring it.
import { drawWreck } from '../render/props.js';

export class Wreck {
  constructor(x, y) { this.x = x; this.y = y; }
  draw(ctx, camX, camY, t) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    drawWreck(ctx, t);
    ctx.restore();
  }
}
