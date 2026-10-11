import {DRONE_CALL_MS} from '@race/shared';
export type DroneSound='ready'|'request'|'tablet'|'online'|'scan'|'end';
export interface DroneAudioState {round:number;ready:boolean;callUntil:number;scanUntil:number;sweepAt:number}
/** Server timestamps identify one call; crossed cues never replay after pause or repeated patches. */
export class DroneSoundCues {
 private previous?:DroneAudioState;private previousNow=0;
 update(state:DroneAudioState,now:number,enabled:boolean):DroneSound[]{
  const old=this.previous?.round===state.round?this.previous:undefined,previousNow=old?this.previousNow:now-120;
  this.previous={...state};this.previousNow=now;
  if(!enabled)return [];
  const cues:DroneSound[]=[];
  if(state.ready&&!old?.ready)cues.push('ready');
  if(state.callUntil){
   const start=state.callUntil-DRONE_CALL_MS;
   for(const [offset,sound] of [[0,'request'],[816,'tablet'],[1248,'tablet'],[1680,'tablet'],[DRONE_CALL_MS,'online']] as const){
    const at=start+offset,from=old?.callUntil===state.callUntil?previousNow:Math.min(previousNow,start-1);if(at>from&&at<=now&&now-at<300)cues.push(sound);
   }
  }
  if(state.sweepAt&&state.sweepAt!==old?.sweepAt&&now-state.sweepAt<400&&state.scanUntil>now)cues.push('scan');
  if(old&&old.scanUntil===state.scanUntil&&state.scanUntil>previousNow&&state.scanUntil<=now&&now-state.scanUntil<300)cues.push('end');
  return cues;
 }
}
