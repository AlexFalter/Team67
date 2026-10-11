import { CAPSULE_HEIGHT, CAPSULE_RADIUS } from "./constants.ts";
import type { GroundPoint, MovementWorld } from "./world.ts";
import type { WorldState } from "./types.ts";
import { RoomPhase } from "./room.ts";

// Cabin ground contact and nearby passenger drop-off move together.
export const BATTLE_BUS_LANDING = { x: -178.04, y: 8.25, z: 61.25 } as const;
export const BATTLE_BUS_START = { x: -173.23488193895338, z: 61.52081436336322 } as const;
export const BATTLE_BUS_HEADING = 2.514579388516376;
export const BATTLE_BUS_ARRIVAL_MS = 7000;
export const BATTLE_BUS_EXIT_WALK_MS = 1800;
export const BATTLE_BUS_CAMERA_MS = 850;
export const BATTLE_BUS_COUNTDOWN_MS = 3000;

export function battleBusExitStartMs(slot: number) {
  return slot === 0 ? 550 : 650 + (slot - 1) * 70;
}

// Snapshot the passenger count at departure: late spectators and disconnects
// must not change the shared start deadline halfway through the cinematic.
export function battleBusTiming(passengers: number) {
  const count = Math.max(1, Math.min(40, Math.floor(passengers)));
  const exitEndMs = BATTLE_BUS_ARRIVAL_MS + battleBusExitStartMs(count - 1) + BATTLE_BUS_EXIT_WALK_MS;
  const countdownAtMs = exitEndMs + BATTLE_BUS_CAMERA_MS;
  return { exitEndMs, countdownAtMs, durationMs: countdownAtMs + BATTLE_BUS_COUNTDOWN_MS };
}
export const BATTLE_BUS_DURATION_MS = battleBusTiming(40).durationMs;
export const BATTLE_BUS_LEAD_MS = 1000;

export function inBattleBusIntro(state: Pick<WorldState, "phase" | "introComplete">) {
  return state.phase === RoomPhase.Running && !state.introComplete;
}

export function battleBusThanksVisible(state: Pick<WorldState, "phase" | "introStartedAt" | "introComplete" | "startedAt" | "skipIntro">, now: number) {
  return state.phase === RoomPhase.Running && !state.skipIntro && state.introStartedAt > 0 &&
    (!state.introComplete || now < state.startedAt + 10000);
}

// Absolute server time, rather than accumulated frame time, also handles hidden tabs.
export function battleBusElapsed(state: Pick<WorldState, "introStartedAt" | "startedAt" | "introPassengerCount">, now: number) {
  const duration = state.startedAt - state.introStartedAt;
  const cinematicMs = battleBusTiming(state.introPassengerCount ?? 40).durationMs;
  return duration > 0 ? Math.max(0, Math.min(cinematicMs,
    (now - state.introStartedAt) / duration * cinematicMs)) / 1000 : cinematicMs / 1000;
}

export function battleBusCountdown(passengers: number, elapsedMs: number) {
  const { countdownAtMs, durationMs } = battleBusTiming(passengers);
  return elapsedMs < countdownAtMs || elapsedMs >= durationMs ? 0 : Math.ceil((durationMs - elapsedMs) / 1000);
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

/** The race's common respawn is the first safe bus drop-off. */
export function raceSpawnPoint(world: MovementWorld): GroundPoint {
  return world.name === 'flat' ? { ...world.spawn } : battleBusDropoffs(world, 1)[0];
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
