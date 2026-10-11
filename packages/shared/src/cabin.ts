import type { PlayerState, Input, VehicleState } from "./types.ts";
import { POLYBAHN_KIND, railSeat, tramDerailFrame } from "./transit.ts";

export const CABIN_SPEED = 1.6;
// Keep feet in the centre aisle, clear of benches and the two seated NPCs.
export function cabinBounds(x: number, z: number) {
  z = Math.max(-2, Math.min(2, z));
  const min = Math.abs(z + 1.2) < .45 ? -.02 : -.22;
  const max = Math.abs(z - 1.35) < .45 ? .02 : .22;
  return { x: Math.max(min, Math.min(max, x)), z };
}
export function standInCabin(p: PlayerState, v: VehicleState) {
  if (p.cabinStanding) return;
  p.cabinStanding = true;
  Object.assign(p, { cabinX: 0, cabinZ: railSeat(v, p.seat).z, cabinYaw: railSeat(v, p.seat).yaw });
}
export function stepCabin(p: PlayerState, input: Input, dt: number, v: VehicleState) {
  if (v.kind !== POLYBAHN_KIND || !p.vehicleId) return;
  const speed = Math.hypot(input.x, input.z);
  if (speed > 0) {
    standInCabin(p, v);
    const c = Math.cos(v.rotY), s = Math.sin(v.rotY), scale = CABIN_SPEED * dt / Math.max(1, speed);
    const next = cabinBounds((p.cabinX ?? 0) + (input.x*c-input.z*s)*scale,
      (p.cabinZ ?? 0) + (input.x*s+input.z*c)*scale);
    p.cabinX = next.x; p.cabinZ = next.z;
    p.cabinYaw = Math.atan2(input.x, input.z) - v.rotY;
  }
  p.anim = p.cabinStanding && speed > 0 ? 1 : 0;
}
export function cabinPosition(v: VehicleState, p: PlayerState) {
  const f = tramDerailFrame(v, 0), x = p.cabinX ?? 0, z = p.cabinZ ?? 0, floor = .54;
  const y = floor*Math.cos(f.pitch)-z*Math.sin(f.pitch), forward = floor*Math.sin(f.pitch)+z*Math.cos(f.pitch);
  p.x = f.x+x*Math.cos(f.rotY)+forward*Math.sin(f.rotY);
  p.y = f.y+y; p.z = f.z-x*Math.sin(f.rotY)+forward*Math.cos(f.rotY);
  p.rotY = f.rotY+(p.cabinYaw ?? 0); p.grounded = true;
}
