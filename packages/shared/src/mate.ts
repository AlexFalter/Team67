import type { MovementWorld } from "./world.ts";

// Pavement in front of Coop at Bahnhofbrücke; controls face the bridge (-Z).
export const MATE_POSITION = { x: -130, z: 83 };
export const MATE_LOADING_MS = 1400, MATE_DROP_MS = 950;
export const MATE_BOOST_MS = 15000, MATE_SPEED_MULTIPLIER = 1.5;
export const MATE_FLAVORS = ["Basic", "Light", "Mint", "Ginger", "Ginger"] as const;
export type MatePhase = "idle" | "payment" | "loading" | "failure" | "dropping" | "collect" | "success";
export interface MateState {
  phase: string; selected: number; tried: number; attempts: number;
  readyAt: number; retryAt: number; dropStartedAt: number;
}
export interface MateCommand { action: "select" | "pay" | "collect" | "close" | "use"; flavor?: number; roundStartedAt: number }
export interface MateResult { action: string; ok: boolean; message: string }
export function mateSite(world: MovementWorld) {
  const point = world.name === "flat" ? { x: 0, z: -12 } : MATE_POSITION;
  return { ...point, y: world.height(point.x, point.z) ?? world.spawn.y };
}
export function nearMate(p: { x: number; y: number; z: number }, world: MovementWorld) {
  const site = mateSite(world);
  // Controls and the dispenser face -Z. Never interact through the back wall.
  return Math.abs(p.y - site.y) < .65 && p.z <= site.z - .5 && Math.hypot(p.x - site.x, p.z - site.z) <= 2.8;
}
export function mateBlocked(x: number, y: number, z: number, radius: number, height: number, ground: number) {
  return y < ground + 2.7 && y + height > ground &&
    Math.abs(x - MATE_POSITION.x) < 1.025 + radius && Math.abs(z - MATE_POSITION.z) < .75 + radius;
}
export function mateCanDropPose(age: number) {
  const t = Math.max(0, Math.min(.95, age)), after = Math.max(0, t - .28);
  const fallen = Math.min(1, t / .28), roll = 1 - (1 - Math.min(t / .75, 1)) ** 3;
  return { x: .34, y: .341 + .079 * (1 - fallen * fallen) + (t < .95 ? .023 * Math.exp(-8 * after) * Math.abs(Math.sin(after * 19)) : 0),
    z: -.11 - .31 * roll, tilt: t < .95 ? .025 * Math.sin(after * 22) * Math.exp(-9 * after) : 0,
    roll: t < .95 ? Math.sin(Math.PI * t / .95) * .14 : 0 };
}
