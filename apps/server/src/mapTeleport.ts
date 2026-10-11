import type { Room } from 'colyseus';
import { findGround, type MovementWorld, type PlayerCorrection } from '@race/shared';
import type { RaceState } from './state.ts';

export function registerMapTeleport(room: Room<{state: RaceState}>, world: MovementWorld,
 lastMoves: Map<string, number>, canPlay: (id:string)=>boolean, busy: (id:string)=>boolean) {
 room.onMessage('debugMapTeleport', (client, data:unknown) => {
  const d=data as {x?:unknown;z?:unknown;roundStartedAt?:unknown}|null, p=room.state.players.get(client.sessionId);
  if (!room.state.devMode || !room.state.mapTeleport || room.state.hostId!==client.sessionId || !canPlay(client.sessionId) || !p || p.vehicleId || busy(client.sessionId) || p.moodleSitUntil>Date.now() ||
   !d || d.roundStartedAt!==room.state.startedAt || typeof d.x!=='number' || typeof d.z!=='number' || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
  const b=world.bounds;
  if(d.x<b.minX||d.x>b.maxX||d.z<b.minZ||d.z>b.maxZ)return;
  const target=findGround(world,d.x,d.z);if(!target)return;
  const from={x:p.x,y:p.y,z:p.z};
  Object.assign(p,target,{vx:0,vy:0,vz:0,anim:0,grounded:true,knockdownUntil:0,emoteId:'',emoteStartedAt:0,simTime:Date.now()});
  lastMoves.set(client.sessionId,p.simTime);
  client.send('mapTeleportResult',{from,target,roundStartedAt:room.state.startedAt});
  client.send('playerCorrection',{...target,vx:0,vy:0,vz:0,grounded:true,vehicleId:'',vehicleKind:-1,seat:-1,knockdownUntil:0} satisfies PlayerCorrection & {knockdownUntil:number});
 });
}
