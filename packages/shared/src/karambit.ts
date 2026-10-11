import { ATTACK_COOLDOWN_MS } from './constants.ts';
import layout from './npc-layout.json' with { type: 'json' };
import type { PlayerState } from './types.ts';
import type { MovementWorld } from './world.ts';

export const KARAMBIT_COOLDOWN_MS = 1000;
export function attackCooldown(karambit: boolean) {
  return karambit ? KARAMBIT_COOLDOWN_MS : ATTACK_COOLDOWN_MS;
}
// The riders can chase up to 24 m from home; allow their talking distance too.
export function canCollectKarambit(p: PlayerState, world: MovementWorld) {
  const [x,z] = layout.scooter.ridePoints.at(-1)!;
  const y = world.height(x,z);
  return world.name === 'zurich' && y !== undefined && !p.karambitOwned && !p.vehicleId && !p.bagId &&
    Math.hypot(p.x-x,p.z-z) <= 27 && Math.abs(p.y-y) < 3;
}
