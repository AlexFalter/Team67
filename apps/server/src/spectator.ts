import type {RaceState} from './state.ts';
export function enterSpectator(state:RaceState,id:string,data:unknown,canPlay:()=>boolean,release:()=>void){
 const d=data as {roundStartedAt?:unknown}|null,p=state.players.get(id),member=state.members.get(id);
 if(!d||d.roundStartedAt!==state.startedAt||!canPlay()||!p||!member||p.vehicleId)return false;
 release();state.players.delete(id);member.spectator=true;return true;
}
