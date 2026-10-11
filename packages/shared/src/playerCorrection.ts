import type { PlayerCorrection } from './types.ts';

/** Corrections are frequent: encode values once, without repeating object keys. */
export type PackedPlayerCorrection = [
  x: number, y: number, z: number, vx: number, vy: number, vz: number,
  grounded: boolean, vehicleId: string, vehicleKind: number, seat: number,
];
export type PlayerCorrectionMessage = PlayerCorrection | PackedPlayerCorrection;
export function packPlayerCorrection(p: PlayerCorrection): PackedPlayerCorrection {
  return [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.grounded, p.vehicleId, p.vehicleKind, p.seat];
}
export function unpackPlayerCorrection(message: PlayerCorrectionMessage): PlayerCorrection {
  // Object corrections remain supported for offline encounters and debug teleports.
  if (!Array.isArray(message)) return message;
  const [x, y, z, vx, vy, vz, grounded, vehicleId, vehicleKind, seat] = message;
  return { x, y, z, vx, vy, vz, grounded, vehicleId, vehicleKind, seat };
}
