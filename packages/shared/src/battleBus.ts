import { CAPSULE_HEIGHT, CAPSULE_RADIUS } from "./constants.ts";
import type { GroundPoint, MovementWorld } from "./world.ts";
import type { WorldState } from "./types.ts";
import { RoomPhase } from "./room.ts";

// mini-games/public/gameplay/feature-placements.json, player.spawn / shuttle.
export const BATTLE_BUS_START = { x: -191.642, z: 11.025 } as const;
export const BATTLE_BUS_HEADING = 2.514579388516376;
export const BATTLE_BUS_ARRIVAL_MS = 7000;
export const BATTLE_BUS_DURATION_MS = 13350;
export const BATTLE_BUS_LEAD_MS = 1000;

export function inBattleBusIntro(state: Pick<WorldState, "phase" | "introComplete">) {
  return state.phase === RoomPhase.Running && !state.introComplete;
}

// Absolute server time, rather than accumulated frame time, also handles hidden tabs.
export function battleBusElapsed(state: Pick<WorldState, "introStartedAt" | "startedAt">, now: number) {
  const duration = state.startedAt - state.introStartedAt;
  return duration > 0 ? Math.max(0, Math.min(BATTLE_BUS_DURATION_MS,
    (now - state.introStartedAt) / duration * BATTLE_BUS_DURATION_MS)) / 1000 : BATTLE_BUS_DURATION_MS / 1000;
}

export function battleBusDropoffs(world: MovementWorld, count: number): GroundPoint[] {
  const points: GroundPoint[] = [];
  const start = world.name === "flat" ? world.spawn : BATTLE_BUS_START;
  for (let ring = 0; ring <= 20 && points.length < count; ring++) {
    for (let dx = -ring; dx <= ring && points.length < count; dx++) {
      for (let dz = -ring; dz <= ring && points.length < count; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = start.x + dx * 1.1, z = start.z + dz * 1.1, y = world.height(x, z);
        if (y === undefined || world.blocked(x, y, z, CAPSULE_RADIUS, CAPSULE_HEIGHT)) continue;
        points.push({ x, y, z });
      }
    }
  }
  if (points.length !== count) throw new Error("Not enough clear battle bus drop-off positions.");
  return points;
}

const startPoints = new Map<MovementWorld, GroundPoint[]>();
/**
 * Where a player starts the round: the drop-off point of their battle bus seat (the same spot the
 * server puts them on in arriveFromBus()). Drowned players respawn here too. Undefined without a seat.
 */
export function roundStartPoint(world: MovementWorld, seat: number): GroundPoint | undefined {
  if (seat < 0 || seat >= 40) return undefined;
  let points = startPoints.get(world);
  if (!points) startPoints.set(world, points = battleBusDropoffs(world, 40));
  return points[seat];
}

// The prototype's twelve seats, followed by standing places for larger existing rooms.
export function battleBusSeat(slot: number) {
  const seated = slot < 12;
  return {
    seated,
    x: seated ? (slot % 2 === 0 ? -0.82 : 0.82) : 0,
    y: seated ? 0.68 : 0.78,
    z: seated ? [-4.45, -0.85, 0.4, 3.9, 5.2, 6.5][Math.floor(slot / 2)] : -6.6 + (slot - 12) * 0.45,
    eyeY: seated ? 2.005 : 2.32,
  };
}
