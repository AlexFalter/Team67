import type { Impulse, PlayerState } from "./types.ts";

export type ImpactKind = "character" | "bike" | "vehicle";
// Velocity change is the common force measure for every collision source.
export function collisionImpact(from: string, ix: number, iy: number, iz: number, kind: ImpactKind = "character", knockdown = true): Impulse {
  const strength = Math.hypot(ix, iy, iz), scale = strength > 25 ? 25 / strength : 1;
  const durationMs = kind === "character" ? Math.min(2000, 1200 + strength * 35)
    : kind === "bike" ? Math.min(3200, 1900 + strength * 60) : Math.min(4200, 2300 + strength * 90);
  return { from, ix: ix * scale, iy: Math.max(0, Math.min(5, iy * scale)), iz: iz * scale, knockdown, durationMs, recoveryProtectionMs: kind === "bike" ? 2000 : kind === "character" ? 1000 : 3000 };
}

const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
// All views share this server-timed fall, floor pause and supported get-up.
export function impactPose(p: Pick<PlayerState, "simTime" | "knockdownUntil" | "impactStartedAt" | "impactStrength" | "grounded">) {
  if (!p.impactStrength || p.impactStartedAt === undefined || p.knockdownUntil <= p.impactStartedAt) return { fall: 0, rise: 0, recoil: 0, active: false };
  const age = p.simTime - p.impactStartedAt;
  const rise = p.grounded ? smooth((p.simTime - (p.knockdownUntil - 650)) / 650) : 0;
  const fall = smooth(age / 320) * (1 - rise);
  return { fall, rise, recoil: age < 0 ? 0 : Math.max(0, 1 - age / 240), active: age >= 0 && p.simTime < p.knockdownUntil };
}
