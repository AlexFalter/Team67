import * as C from "@race/shared";
import { Peel, type RaceState } from "./state.ts";

export class PeelManager {
  private next = 0;
  constructor(private state: RaceState, private world: C.MovementWorld = C.flatWorld) {}
  drop(owner: string, thrown: boolean, now: number) {
    const p = this.state.players.get(owner);
    if (!p || this.state.peels.size >= 32) return;
    const distance = thrown ? 4 : -1.3;
    const bounds = this.world.bounds;
    let x = Math.max(bounds.minX + 1, Math.min(bounds.maxX - 1, p.x + Math.sin(p.rotY) * distance));
    let z = Math.max(bounds.minZ + 1, Math.min(bounds.maxZ - 1, p.z + Math.cos(p.rotY) * distance));
    if ((this.world.name === "flat" && C.blockedByHouse(p, { x, y: p.y, z })) || this.world.height(x, z) === undefined || this.world.blocked(x, this.world.height(x, z) ?? p.y, z, 0.3, 0.1)) { x = p.x; z = p.z; }
    const landingAt = now + (thrown ? 500 : 0);
    this.state.peels.set(`peel-${++this.next}`, new Peel({
      x: thrown ? p.x : x, y: p.y, z: thrown ? p.z : z,
      fromX: p.x, fromZ: p.z, toX: x, toZ: z,
      bornAt: now, landingAt, armedAt: landingAt + 500,
      expiresAt: now + C.PEEL_LIFETIME_MS, owner,
    }));
  }
  tick(now: number, slip: (owner: string, target: string) => void) {
    for (const [id, peel] of this.state.peels) {
      if (now >= peel.expiresAt) { this.state.peels.delete(id); continue; }
      if (peel.landingAt > peel.bornAt) {
        const f = Math.max(0, Math.min(1, (now - peel.bornAt) / (peel.landingAt - peel.bornAt)));
        peel.x = peel.fromX + (peel.toX - peel.fromX) * f;
        peel.z = peel.fromZ + (peel.toZ - peel.fromZ) * f;
        peel.y = (this.world.height(peel.x, peel.z) ?? this.world.spawn.y) + 4 * f * (1 - f);
      }
      if (now < peel.armedAt) continue;
      for (const [target, p] of this.state.players) if (!p.vehicleId && p.grounded &&
        Math.abs(p.y - peel.y) < 0.2 && Math.hypot(p.x - peel.x, p.z - peel.z) < C.PEEL_RADIUS) {
        slip(peel.owner, target); this.state.peels.delete(id); break;
      }
    }
  }
}
