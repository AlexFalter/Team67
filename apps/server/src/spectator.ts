import {RoomPhase} from '@race/shared';
import type {RaceState} from './state.ts';
export function enterSpectator(state:RaceState,id:string,data:unknown,canPlay:()=>boolean,release:()=>void){
 const d=data as {roundStartedAt?:unknown}|null,p=state.players.get(id),member=state.members.get(id);
 const finishedExam=state.phase===RoomPhase.Finished&&(state.results.get(id)?.examStartedAt??0)>0;
 if(!d||d.roundStartedAt!==state.startedAt||(!canPlay()&&!finishedExam)||!p||!member||p.vehicleId)return false;
 release();state.players.delete(id);member.spectator=true;return true;
}
