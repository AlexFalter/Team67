import type { MovementWorld } from './world.ts';
import type { Body } from './types.ts';

export const BRIDGE_COWS = Array.from({ length: 13 }, (_, id) => ({ id, x: -140 + Math.floor(id / 2) * 11, z: 63 + Math.floor(id / 2) * 11 / 7 + (id % 2) * 5 }));
export const COW_RADIUS = .43, COW_HALF_LENGTH = 1.05, COW_HEIGHT = 1.5;
const random = (id: number, tick: number) => {
  const n = Math.sin(id * 127.1 + tick * 311.7 + 19.3) * 43758.5453;
  return n - Math.floor(n);
};
const target = (id: number, tick: number) => {
  const angle = random(id, tick * 2) * Math.PI * 2, radius = 2.2 + random(id, tick * 2 + 1) * .8;
  const x = Math.cos(angle) * radius;
  return { x, z: Math.sin(angle) * radius * .55 + x / 7 };
};
// Project wander targets onto the bridge interior, leaving clearance for the
// whole cow. This is an invisible boundary, shared by rendering and collisions.
function onBridge(x: number, z: number) {
  x = Math.max(-142, Math.min(-70, x));
  const center = 65.5 + (x + 140) / 7;
  return { x, z: Math.max(center - 4.1, Math.min(center + 4.1, z)) };
}
// Identical shared-clock wandering on every client and the server; impacts never alter cows.
function wanderingPose(id: number, now: number, world: MovementWorld) {
  const home = BRIDGE_COWS[id], seconds = now / 1000 + id * 2.7;
  const tick = Math.floor(seconds / 12), age = seconds - tick * 12;
  const waypoint = (tick: number) => { const offset = target(id, tick); return onBridge(home.x + offset.x, home.z + offset.z); };
  const from = waypoint(tick - 1), to = waypoint(tick);
  const t = Math.max(0, Math.min(1, (age - 1.5) / 6));
  const blend = t * t * (3 - 2 * t);
  const x = from.x + (to.x - from.x) * blend;
  const z = from.z + (to.z - from.z) * blend;
  const previous = waypoint(tick - 2);
  const before = Math.atan2(from.x - previous.x, from.z - previous.z), heading = Math.atan2(to.x - from.x, to.z - from.z);
  const turn = Math.atan2(Math.sin(heading - before), Math.cos(heading - before));
  const turning = Math.min(1, age / 1.5), turnBlend = turning * turning * (3 - 2 * turning), distance = Math.hypot(to.x - from.x, to.z - from.z);
  const speed = distance * t * (1 - t); // derivative of the six-second smoothstep
  return { x, z, y: world.height(x, z) ?? 8.5, rotY: before + turn * turnBlend, turnSpeed: Math.abs(turn) * 4 * turning * (1 - turning), walking: age > 1.5 && age < 7.5, speed, phase: id * .17 + (.18 * Math.abs(turn) * turnBlend + distance * blend) / .8 };
}
let cachedNow = NaN, cachedWorld: MovementWorld | undefined, cachedPoses: ReturnType<typeof wanderingPose>[] = [];
export function bridgeCowPose(id: number, now: number, world: MovementWorld) {
  if (now !== cachedNow || world !== cachedWorld) {
    cachedNow = now; cachedWorld = world;
    cachedPoses = BRIDGE_COWS.map(cow => wanderingPose(cow.id, now, world));
    // Gentle herd separation also keeps sideways routes from crossing bodies.
    for (let pass = 0; pass < 5; pass++) for (let a = 0; a < cachedPoses.length; a++) for (let b = a + 1; b < cachedPoses.length; b++) {
      const left = cachedPoses[a], right = cachedPoses[b], dx = left.x - right.x, dz = left.z - right.z, gap = Math.hypot(dx, dz);
      if (gap >= 3.2) continue;
      const push = (3.2 - gap) / (2 * Math.max(gap, .00001));
      Object.assign(left, onBridge(left.x + dx * push, left.z + dz * push));
      Object.assign(right, onBridge(right.x - dx * push, right.z - dz * push));
    }
    for (const pose of cachedPoses) pose.y = world.height(pose.x, pose.z) ?? 8.5;
  }
  return { ...cachedPoses[id] };
}
// Eight voices spaced across each half-minute; jitter keeps calls natural
// without allowing the 1.7-second recording to become a simultaneous chorus.
export const MOOING_COW_IDS = [0, 2, 3, 5, 7, 8, 10, 12] as const;
export function cowMooStart(id: number, slot: number) {
  const voice = MOOING_COW_IDS.indexOf(id as typeof MOOING_COW_IDS[number]);
  return voice < 0 ? Infinity : slot * 30000 + voice * 3750 + random(id + 80, slot) * 800;
}
export function cowMooAge(id: number, now: number) {
  let slot = Math.floor(now / 30000);
  if (!Number.isFinite(cowMooStart(id, slot))) return { slot: -1, age: Infinity };
  if (cowMooStart(id, slot) > now) slot--;
  return { slot, age: now - cowMooStart(id, slot) };
}
function cowContact(p: { x: number; y: number; z: number }, cow: ReturnType<typeof bridgeCowPose>, height: number) {
  if (p.y >= cow.y + COW_HEIGHT || p.y + height <= cow.y) return;
  const fx = Math.sin(cow.rotY), fz = Math.cos(cow.rotY);
  const along = Math.max(-COW_HALF_LENGTH, Math.min(COW_HALF_LENGTH, (p.x - cow.x) * fx + (p.z - cow.z) * fz));
  const dx = p.x - cow.x - fx * along, dz = p.z - cow.z - fz * along;
  return { dx, dz, distance: Math.hypot(dx, dz) };
}
export function bridgeCowBlocked(x: number, y: number, z: number, radius: number, height: number, now: number, world: MovementWorld) {
  if (world.name !== 'zurich' || x < -145 || x > -64 || z < 58 || z > 80) return false;
  return BRIDGE_COWS.some(({ id }) => {
    const contact = cowContact({ x, y, z }, bridgeCowPose(id, now, world), height);
    return contact && contact.distance < radius + COW_RADIUS;
  });
}
export function resolveBridgeCows(p: Pick<Body, 'x' | 'y' | 'z' | 'vx' | 'vz'>, now: number, world: MovementWorld, radius: number, height: number) {
  if (world.name !== 'zurich' || p.x < -145 || p.x > -64 || p.z < 58 || p.z > 80) return;
  for (const { id } of BRIDGE_COWS) {
    const cow = bridgeCowPose(id, now, world), contact = cowContact(p, cow, height);
    if (!contact || contact.distance >= radius + COW_RADIUS) continue;
    const nx = contact.distance > .00001 ? contact.dx / contact.distance : Math.cos(cow.rotY);
    const nz = contact.distance > .00001 ? contact.dz / contact.distance : -Math.sin(cow.rotY);
    const depth = radius + COW_RADIUS - contact.distance + .001;
    const x = p.x + nx * depth, z = p.z + nz * depth;
    if (world.blocked(x, p.y, z, radius, height)) continue;
    p.x = x; p.z = z;
    const inward = Math.min(0, p.vx * nx + p.vz * nz);
    p.vx -= nx * inward; p.vz -= nz * inward;
  }
}

export function bridgeCowSweepBlocked(from: { x: number; y: number; z: number }, x: number, z: number, radius: number, height: number, now: number, world: MovementWorld) {
  if (world.name !== 'zurich' || Math.max(from.x, x) < -145 || Math.min(from.x, x) > -64 || Math.max(from.z, z) < 58 || Math.min(from.z, z) > 80) return false;
  const steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / .3);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    if (bridgeCowBlocked(from.x + (x - from.x) * t, from.y, from.z + (z - from.z) * t, radius, height, now, world)) return true;
  }
  return false;
}
