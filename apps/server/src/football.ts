import * as C from '@race/shared';
import {Football, type RaceState} from './state.ts';
interface Sender {sessionId:string;send(type:string,data:unknown):void}
export class FootballManager {
 private earned=new Set<string>();
 private flights=new Map<string,{started:number;hit:boolean}>();
 private lastTick=0;
 constructor(private state:RaceState,private world:C.MovementWorld,private hit:(from:string,target:string,b:C.FootballState)=>boolean,private busy:(id:string)=>boolean=()=>false){}
 command(client:Sender,data:unknown,now:number){
  const d=data as {action?:unknown;id?:unknown;aim?:unknown;roundStartedAt?:unknown}|null,p=this.state.players.get(client.sessionId);
  if(!d||d.roundStartedAt!==this.state.startedAt||!p||this.state.phase!==C.RoomPhase.Running||!this.state.introComplete||p.vehicleId||p.knockdownUntil>now||p.moodleSitUntil>now||this.busy(client.sessionId))return;
  if(d.action!=='reward'&&p.bagId)return;
  if(d.action==='reward'&&!this.earned.has(client.sessionId)){
   const site=C.NPC_LAYOUT.football.position;
   if(Math.hypot(p.x-site[0],p.z-site[2])>3.5||Math.abs(p.y-site[1])>2)return;
   this.earned.add(client.sessionId);this.state.footballs.set(`football-${client.sessionId}`,new Football({owner:client.sessionId,x:p.x,y:p.y+.22,z:p.z}));
  }else if(d.action==='pickup'&&typeof d.id==='string'){
   const b=this.state.footballs.get(d.id);
   if(b&&!b.owner&&!b.flying&&![...this.state.footballs.values()].some(ball=>ball.owner===client.sessionId)&&Math.hypot(p.x-b.x,p.z-b.z)<1.5&&Math.abs(p.y+.22-b.y)<1&&this.clear({x:p.x,y:p.y+.5,z:p.z},b))b.owner=client.sessionId;
  }else if(d.action==='kick'){
   const entry=[...this.state.footballs].find(([,b])=>b.owner===client.sessionId),a=d.aim;
   if(!entry||!Array.isArray(a)||a.length!==3||!a.every(v=>typeof v==='number'&&Number.isFinite(v)))return;
   const length=Math.hypot(...a);if(length<.5||length>1.5)return;
   const [id,b]=entry,dx=a[0]/length,dz=a[2]/length,dy=Math.max(.12,Math.min(.6,a[1]/length+.22)),scale=19/Math.hypot(dx,dy,dz);
   const origin={x:p.x+dx*.65,y:p.y+.3,z:p.z+dz*.65};if(!this.clear({x:p.x,y:p.y+.3,z:p.z},origin))return;
   Object.assign(b,origin,{owner:'',kicker:client.sessionId,flying:true,vx:dx*scale,vy:dy*scale,vz:dz*scale});this.flights.set(id,{started:now,hit:false});
  }
 }
 private clear(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number}){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.1));for(let i=1;i<=steps;i++){const t=i/steps;if(this.world.blocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t,.22,.44))return false;}return true;}
 tick(now:number){const dt=this.lastTick?Math.min(.1,Math.max(0,(now-this.lastTick)/1000)):.05;this.lastTick=now;
  if(this.state.phase!==C.RoomPhase.Running||!this.state.introComplete)return;
  for(const [id,b] of this.state.footballs){
   if(b.owner){const p=this.state.players.get(b.owner);if(p){b.x=p.x;b.y=p.y+.22;b.z=p.z;continue;}b.owner='';}
   const flight=this.flights.get(id);if(!flight)continue;
   for(let t=0;t<dt;t+=.01){const step=Math.min(.01,dt-t),from={x:b.x,y:b.y,z:b.z},to={x:b.x+b.vx*step,y:b.y+b.vy*step,z:b.z+b.vz*step};
    b.vy-=12*step;const floor=this.world.height(to.x,to.z),bounds=this.world.bounds;
    if(floor===undefined||to.x<bounds.minX||to.x>bounds.maxX||to.z<bounds.minZ||to.z>bounds.maxZ){b.vx*=-.4;b.vz*=-.4;to.x=b.x;to.z=b.z;}
    else if(!this.clear(from,to)){b.vx*=-.4;b.vz*=-.4;to.x=b.x;to.z=b.z;}
    else if(!flight.hit&&Math.hypot(b.vx,b.vz)>3){for(const [target,p] of this.state.players){if(target===b.kicker||p.vehicleId||p.knockdownUntil>now||this.busy(target)||!C.bagHitsPlayer(from,to,p))continue;if(this.hit(b.kicker,target,b)){flight.hit=true;b.vx*=.3;b.vz*=.3;break;}}}
    const ground=this.world.height(to.x,to.z)??this.world.height(b.x,b.z)??this.world.spawn.y;
    if(to.y<ground+.22){to.y=ground+.22;b.vy=Math.abs(b.vy)>.8?Math.abs(b.vy)*.35:0;b.vx*=.94;b.vz*=.94;}
    Object.assign(b,to);
   }
   if(now-flight.started>5000||Math.hypot(b.vx,b.vy,b.vz)<.65){b.flying=false;b.vx=b.vy=b.vz=0;b.y=(this.world.height(b.x,b.z)??this.world.spawn.y)+.22;this.flights.delete(id);}
  }
 }
 leave(id:string){this.earned.delete(id);for(const b of this.state.footballs.values())if(b.owner===id){b.owner='';b.y=(this.world.height(b.x,b.z)??this.world.spawn.y)+.22;}}
 reset(){this.earned.clear();this.flights.clear();this.state.footballs.clear();this.lastTick=0;}
}
