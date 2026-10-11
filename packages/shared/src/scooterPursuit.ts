import type { MovementWorld } from './world.ts';

export interface ScooterPursuit {
  x: number; y: number; z: number; heading: number; speed: number;
  homeX: number; homeZ: number; chasing: boolean; returning: boolean; lean: number;
}
// Each player's story encounter approaches them independently, like its dialogue.
// Nearby pursuit stays in the plaza, stops short of the player and never crosses
// missing terrain, walls or steep drops. Conversation pauses are owned by the caller.
export function stepScooterPursuit(s: ScooterPursuit, player: { x: number; y: number; z: number }, dt: number, world: Pick<MovementWorld, 'height' | 'blocked'>) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  const gap = Math.hypot(player.x - s.x, player.z - s.z), fromHome = Math.hypot(player.x - s.homeX, player.z - s.homeZ);
  const nearby = Math.abs(player.y - s.y) < 3 && fromHome < 24;
  s.chasing = nearby && gap < (s.chasing ? 16 : 11);
  s.returning = !s.chasing && Math.hypot(s.x - s.homeX, s.z - s.homeZ) > .3;
  const tx = s.chasing ? player.x : s.homeX, tz = s.chasing ? player.z : s.homeZ;
  const dx = tx - s.x, dz = tz - s.z, distance = Math.hypot(dx, dz), stop = s.chasing ? 2.65 : .2;
  const targetSpeed = s.chasing || s.returning ? Math.min(s.chasing ? 4.3 : 3, Math.max(0, distance - stop) * 2.5) : 0;
  s.speed += Math.max(-9 * dt, Math.min(6 * dt, targetSpeed - s.speed));
  if (distance <= stop) s.speed = 0;
  const targetHeading = Math.atan2(-dx, -dz), turn = Math.atan2(Math.sin(targetHeading - s.heading), Math.cos(targetHeading - s.heading));
  const rotation = (s.chasing || s.returning) && distance > .1 ? turn * (1 - Math.exp(-7 * dt)) : 0;
  s.heading += rotation; s.lean += (Math.max(-.15, Math.min(.15, -rotation / dt * .07)) - s.lean) * (1 - Math.exp(-8 * dt));
  const travel = Math.min(Math.max(0, distance - stop), s.speed * dt * Math.max(0, Math.cos(turn)));
  if (travel < .00001) return;
  const x = s.x + dx / distance * travel, z = s.z + dz / distance * travel;
  const samples = Math.ceil(travel / .15);
  let y = s.y;
  for (let i = 1; i <= samples; i++) {
    const xx = s.x + (x - s.x) * i / samples, zz = s.z + (z - s.z) * i / samples, ground = world.height(xx, zz);
    if (ground === undefined || Math.abs(ground - y) > .4 || world.blocked(xx, ground + .15, zz, .65, 3)) { s.speed = 0; return; }
    y = ground;
  }
  s.x = x; s.y = y; s.z = z;
}
