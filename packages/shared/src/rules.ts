import * as C from "./constants.ts";
import type { Point, World } from "./world.ts";

export const LOBBY = "Lobby", RUNNING = "Running", FINISHED = "Finished";
export type Phase = typeof LOBBY | typeof RUNNING | typeof FINISHED;

export const CHARACTERS = ["CS Student", "Student Athlete", "Albert Einstein"] as const;

export function playerName(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter your name to join a room.");
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (!name || [...name].length > C.MAX_NAME_LENGTH) throw new Error(`Use a name with 1–${C.MAX_NAME_LENGTH} characters.`);
  return name;
}

export function roomCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{4,12}$/.test(code)) throw new Error("Use 4–12 letters, numbers or hyphens for the room code.");
  return code;
}

/** Punch cone: in front (yaw), within range and height, and no building column in between. */
export function inPunchCone(a: Point & { yaw: number }, b: Point, world: World) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  if (d > C.PUNCH_RANGE || Math.abs(b.y - a.y) > C.PUNCH_HEIGHT) return false;
  if (d > 1e-3 && (-dx * Math.sin(a.yaw) - dz * Math.cos(a.yaw)) / d < Math.cos(C.PUNCH_HALF_ANGLE)) return false;
  const steps = Math.ceil(d / 0.5);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    if (world.blocked(a.x + dx * f, a.y + 0.8, a.z + dz * f, 0.1, 0.2)) return false;
  }
  return true;
}

/** Results ranking: most hits landed first, then by name. */
export function rankResults<T extends { name: string; hits: number }>(rows: T[]) {
  return rows.sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name));
}
