import { LIME_KIND } from "./constants.ts";
import type { WorldState, VehicleState } from "./types.ts";

// One switch disables input, server acceptance and animation together.
export const LIME_TAILWHIP_ENABLED = true;
export const LIME_TAILWHIP_MS = 750;
export const LIME_TAILWHIP_COOLDOWN_MS = 1000;

export function startLimeTailwhip(state: Pick<WorldState, "players" | "vehicles" | "startedAt">, id: string, round: unknown, now: number) {
  if (!LIME_TAILWHIP_ENABLED || round !== state.startedAt) return false;
  const player = state.players.get(id), vehicle = state.vehicles.get(player?.vehicleId ?? "");
  if (!player || !vehicle || vehicle.kind !== LIME_KIND || vehicle.driver !== id || player.seat !== 0 ||
      now < player.knockdownUntil || now < (player.moodleSitUntil ?? 0) ||
      (vehicle.tailwhipStartedAt > 0 && now < vehicle.tailwhipStartedAt + LIME_TAILWHIP_COOLDOWN_MS)) return false;
  vehicle.tailwhipStartedAt = now;
  return true;
}

/** Cosmetic only: the road position and collision body remain unchanged. */
export function limeTailwhipPose(vehicle: Pick<VehicleState, "kind" | "tailwhipStartedAt"> | undefined, now: number) {
  const age = now - (vehicle?.tailwhipStartedAt ?? 0);
  if (!LIME_TAILWHIP_ENABLED || vehicle?.kind !== LIME_KIND || !vehicle.tailwhipStartedAt || age < 0 || age >= LIME_TAILWHIP_MS)
    return { height: 0, rotation: 0 };
  const progress = age / LIME_TAILWHIP_MS;
  const spin = Math.max(0, Math.min(1, (progress - .12) / .76));
  return { height: .65 * Math.sin(progress * Math.PI), rotation: Math.PI * 2 * spin * spin * (3 - 2 * spin) };
}
