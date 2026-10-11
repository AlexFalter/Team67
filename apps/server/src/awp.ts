import * as C from '@race/shared';
import type {RaceState} from './state.ts';
export class AwpManager {
 private scans=new Map<string,number>();
 private cooldown=new Map<string,number>();
 constructor(private state:RaceState,private world:C.MovementWorld,private canPlay:(id:string,now:number)=>boolean,private busy:(id:string)=>boolean,private hit:(target:string,impulse:C.Impulse)=>boolean|void,private broadcast:(shot:C.AwpShot)=>void,private confirmed:(shot:C.AwpShot,practice:boolean)=>void=()=>{},private scan:(id:string,scan:C.DroneScan)=>void=()=>{}){}
 command(id:string,data:unknown,now:number){
  const d=data as {action?:string;aim?:unknown;roundStartedAt?:number}|null,p=this.state.players.get(id);
  if(!p||!d||d.roundStartedAt!==this.state.startedAt||!this.canPlay(id,now))return;
  if(d.action==='holster'){p.awpEquipped=false;return;}
  if(p.vehicleId||p.bagId||p.knockdownUntil>now||p.moodleSitUntil>now||this.busy(id)||p.emoteId)return;
  if(d.action==='drone'){if(p.droneReady&&p.droneScanUntil<=now&&p.awpInspectUntil<=now&&!p.awpReloadUntil&&now>=(this.cooldown.get(id)??0)){p.droneReady=false;p.awpEquipped=false;p.droneCallUntil=now+C.DRONE_CALL_MS;p.droneScanUntil=p.droneCallUntil+C.DRONE_SCAN_MS;this.scans.delete(id);}return;}
  if(p.droneCallUntil>now)return;
  if(d.action==='pickup'){
   if(p.awpOwned)return;const approach=C.awpRackPlacement(this.world).approach;if(Math.hypot(p.x-approach[0],p.y-approach[1],p.z-approach[2])>1.7)return;const position=[approach[0],approach[1]+1.6,approach[2]],origin=[p.x,p.y+1.6,p.z],delta=position.map((v,i)=>v-origin[i]),distance=Math.hypot(...delta);
   if(C.awpWallDistance(this.world,origin,delta.map(v=>v/(distance||1)))<distance-.12)return;
   p.awpOwned=true;p.awpAmmo=C.AWP_MAGAZINE;p.awpReserve=C.AWP_RESERVE;p.awpEquipped=true;p.awpInspectUntil=now+C.AWP_INSPECT_MS;return;
  }
  if(!p.awpOwned)return;
  if(d.action==='equip'){p.awpEquipped=true;return;}
  if(p.awpInspectUntil>now)return;
  this.tick(now);
  if(d.action==='reload'){if(now>=(this.cooldown.get(id)??0)&&p.awpEquipped&&p.awpAmmo<C.AWP_MAGAZINE&&p.awpReserve>0&&!p.awpReloadUntil)p.awpReloadUntil=now+C.AWP_RELOAD_MS;return;}
  if(d.action!=='fire'||!p.awpEquipped||p.awpAmmo<=0||p.awpReloadUntil>now||now<(this.cooldown.get(id)??0)||!Array.isArray(d.aim)||d.aim.length!==3||!d.aim.every(v=>typeof v==='number'&&Number.isFinite(v)))return;
  const length=Math.hypot(...d.aim as number[]);if(length<.99||length>1.01)return;
  const aim=(d.aim as number[]).map(v=>v/length),start=[p.x,p.y+1.6,p.z];
  let distance=C.awpWallDistance(this.world,start,aim),target='';
  for(const [other,q] of this.state.players){if(other===id||q.vehicleId||!this.canPlay(other,now)||this.busy(other))continue;const t=C.awpCapsuleDistance(start,aim,q);if(t<distance){distance=t;target=other;}}
  for(const [other,q] of this.state.dummies){const t=C.awpCapsuleDistance(start,aim,q);if(t<distance){distance=t;target=other;}}
  p.awpAmmo--;this.cooldown.set(id,now+C.AWP_COOLDOWN_MS);
  const impulse:C.Impulse={from:id,ix:aim[0]*C.AWP_KNOCKBACK,iy:Math.max(C.AWP_LIFT,aim[1]*C.AWP_KNOCKBACK),iz:aim[2]*C.AWP_KNOCKBACK,knockdown:true,durationMs:1800,at:now};
  const dummy=this.state.dummies.get(target);let hit=false;
  if(dummy){if(now>=dummy.invincibleUntil){dummy.simTime=now;C.applyImpulse(dummy,impulse,now);hit=true;}}else if(target)hit=this.hit(target,impulse)===true;
  const end=start.map((v,i)=>v+aim[i]*distance),body=this.state.players.get(target)??dummy;
  const part:'head'|'body'=end[1]-(body?.y??0)>=1.35?'head':'body';
  const rot=body?.rotY??0,c=Math.cos(rot),s=Math.sin(rot),x=end[0]-(body?.x??0),z=end[2]-(body?.z??0);
  const attachment=hit&&body?{part,offset:[x*c-z*s,end[1]-body.y-(part==='head'?1.57:1.03),x*s+z*c],direction:[aim[0]*c-aim[2]*s,aim[1],aim[0]*s+aim[2]*c]}:undefined;
  let droneEarned=false;if(hit&&!p.droneReady){p.droneStreak++;if(p.droneStreak>=C.DRONE_STREAK_HITS){p.droneReady=true;p.droneStreak=0;droneEarned=true;}}
  const shot:C.AwpShot={roundStartedAt:this.state.startedAt,from:id,start,end,target,hit,droneEarned,attachment};this.broadcast(shot);if(hit)this.confirmed(shot,!!dummy);
 }
 tick(now:number){for(const [id,p] of this.state.players){
  if(p.knockdownUntil>now){p.droneStreak=0;}
  if(p.awpReloadUntil&&p.awpReloadUntil<=now){const transfer=Math.min(C.AWP_MAGAZINE-p.awpAmmo,p.awpReserve);p.awpAmmo+=transfer;p.awpReserve-=transfer;p.awpReloadUntil=0;}
  if(p.droneScanUntil>now&&now>=p.droneCallUntil&&this.canPlay(id,now)){const sweep=Math.floor((now-p.droneCallUntil)/C.DRONE_SWEEP_MS);if(this.scans.get(id)!==sweep){this.scans.set(id,sweep);this.scan(id,{roundStartedAt:this.state.startedAt,startedAt:p.droneCallUntil,endsAt:p.droneScanUntil,at:now,players:[...this.state.players].filter(([other])=>other!==id&&this.canPlay(other,now)).map(([id,q])=>({id,x:q.x,y:q.y,z:q.z}))});}}
 }}
 leave(id:string){this.cooldown.delete(id);this.scans.delete(id);}
 reset(){this.cooldown.clear();this.scans.clear();for(const p of this.state.players.values())Object.assign(p,{droneReady:false,droneStreak:0,droneCallUntil:0,droneScanUntil:0,awpOwned:false,awpEquipped:false,awpAmmo:C.AWP_MAGAZINE,awpReserve:C.AWP_RESERVE,awpInspectUntil:0,awpReloadUntil:0});}
}
