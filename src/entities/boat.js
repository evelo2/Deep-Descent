// The surface boat — dock here (swim up to it) to refill air and bank treasure.
import { WORLD, PAL } from '../config.js';

export class Boat {
  constructor() { this.x = WORLD.W / 2; }

  // The dock zone is a band just under the surface, centred on the boat.
  contains(diver) {
    return diver.y <= WORLD.SURFACE + 55 && Math.abs(diver.x - this.x) < 90;
  }

  draw(ctx, camY, t) {
    const sy = WORLD.SURFACE - camY;
    if (sy > WORLD.H + 60 || sy < -80) return;
    ctx.save();
    ctx.translate(this.x, sy);
    const bob = Math.sin(t * 1.5) * 3;
    ctx.translate(0, bob);
    // hull
    ctx.fillStyle = '#b5482f';
    ctx.beginPath();
    ctx.moveTo(-70, -18); ctx.lineTo(70, -18);
    ctx.lineTo(52, 6); ctx.lineTo(-52, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8f3623';
    ctx.beginPath(); ctx.moveTo(-52, 6); ctx.lineTo(52, 6); ctx.lineTo(44, 14); ctx.lineTo(-44, 14); ctx.fill();
    // cabin
    ctx.fillStyle = '#e8e2d0';
    ctx.beginPath(); ctx.roundRect(-20, -40, 40, 24, 4); ctx.fill();
    ctx.fillStyle = PAL.diverGlass;
    ctx.beginPath(); ctx.roundRect(-14, -34, 12, 12, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(4, -34, 12, 12, 2); ctx.fill();
    // dive-line down into the water
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 120); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
