import type { Room } from 'colyseus';
import { CAPSULE_HEIGHT, CAPSULE_RADIUS, examDebugPosition, examPortalPosition, type MovementWorld, type PlayerCorrection } from '@race/shared';
import type { RaceState } from './state.ts';
/** Temporary dev-only teleport, applied on the server so movement validation stays intact. */
export function registerExamDebug(room: Room<{ state: RaceState }>, world: MovementWorld,
  lastMoves: Map<string, number>, canPlay: (id: string) => boolean) {
  if (process.env.NODE_ENV === 'production' || process.argv.includes('--production')) return;
  room.onMessage('debugTeleportToPolyterrasse', (client, destination: unknown) => {
    const p = room.state.players.get(client.sessionId);
    if (world.name !== 'zurich' || !canPlay(client.sessionId) || !p || p.vehicleId) return;
    const { x, z } = destination === 'portal' ? examPortalPosition : examDebugPosition, y = world.height(x, z);
    if (y === undefined || world.blocked(x, y, z, CAPSULE_RADIUS, CAPSULE_HEIGHT)) return;
    Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0, anim: 0, grounded: true, knockdownUntil: 0, simTime: Date.now() });
    lastMoves.set(client.sessionId, p.simTime);
    client.send('playerCorrection', { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true,
      vehicleId: '', vehicleKind: -1, seat: -1, knockdownUntil: 0 } satisfies PlayerCorrection & { knockdownUntil: number });
  });
}
