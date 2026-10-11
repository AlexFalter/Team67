import * as C from '@race/shared';
import {Bag,Player,type RaceState} from './state.ts';
interface Sender {sessionId:string;send(type:string,data:unknown):void}
export class BagManager {
 private pending=new Map<string,{x:number;y:number;z:number}>();
 private pickupAt=new Map<string,number>();
 private lastTick=0;
 private dummyHomes=new Map<string,{x:number;y:number;z:number}>();
 constructor(private state:RaceState,private world:C.MovementWorld,private onHit:(from:string,target:string,bag:C.BagState,practice:boolean)=>boolean,private busy:(id:string)=>boolean=()=>false){this.reset();}
 private playable(){return this.state.phase===C.RoomPhase.Running&&this.state.introComplete;}
 private eligible(id:string,now:number){const p=this.state.players.get(id);return p&&this.playable()&&!p.vehicleId&&p.knockdownUntil<=now&&p.moodleSitUntil<=now&&!this.busy(id)?p:undefined;}
 command(client:Sender,data:unknown,now:number){
  const d=data as {action?:unknown;id?:unknown;aim?:unknown;roundStartedAt?:unknown}|null,p=this.eligible(client.sessionId,now);
  let ok=false;
  if(d&&d.roundStartedAt===this.state.startedAt&&p){
   if(d.action==='pickup'&&typeof d.id==='string'&&!p.bagId){const b=this.state.bags.get(d.id);if(b&&!b.flying&&!b.throwAt&&(!b.owner||this.state.dummies.has(b.owner))&&Math.hypot(p.x-b.x,p.z-b.z)<2.4&&Math.abs(p.y-b.y)<1.5&&this.clearLine({x:p.x,y:p.y+1,z:p.z},{x:b.x,y:b.y+.25,z:b.z})){
    const dummy=this.state.dummies.get(b.owner);if(dummy)dummy.bagId='';b.owner=client.sessionId;b.thrower='';p.bagId=d.id;this.pickupAt.set(d.id,now);ok=true;
   }}else if(d.action==='throw'&&p.bagId){const b=this.state.bags.get(p.bagId),a=d.aim;if(b?.owner===client.sessionId&&!b.throwAt&&now-(this.pickupAt.get(p.bagId)??0)>=680&&Array.isArray(a)&&a.length===3&&a.every(v=>typeof v==='number'&&Number.isFinite(v))){const length=Math.hypot(...a);if(length>.5&&length<1.5){this.pending.set(p.bagId,{x:a[0]/length,y:a[1]/length,z:a[2]/length});b.throwAt=now;b.thrower=client.sessionId;ok=true;}}}
  }
  client.send('bagResult',{ok,action:typeof d?.action==='string'?d.action:'',message:ok?'':"Stay close to a bag with empty hands, or wait until you’re ready to throw.",roundStartedAt:this.state.startedAt});
 }
 private clearLine(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number}){const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/.12));for(let i=1;i<=n;i++){const t=i/n;if(this.world.blocked(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t,from.z+(to.z-from.z)*t,.16,.35))return false;}return true;}
 setDummies(client:Sender,value:unknown){if(!this.state.devMode||client.sessionId!==this.state.hostId||typeof value!=='boolean')return false;const points=this.world.name==='flat'?[-1,0,1].map(i=>[this.world.spawn.x+10,this.world.spawn.z+i*3]):C.BAG_HILL.dummyPoints;this.state.debugDummies=value&&points.length>0;
  if(!this.state.debugDummies){for(const id of this.state.dummies.keys())this.leave(id);this.state.dummies.clear();this.dummyHomes.clear();return true;}
  if(!this.state.dummies.size)points.forEach(([x,z],i)=>{const y=this.world.height(x,z);if(y===undefined||this.world.blocked(x,y,z,.3,1.8))return;const id=`bag-dummy-${i+1}`,home={x,y,z};this.dummyHomes.set(id,home);this.state.dummies.set(id,new Player({...home,color:'#e5a440',character:0,grounded:true,rotY:Math.PI,simTime:Date.now()}));});return true;
 }
 tick(now:number){const dt=this.lastTick?Math.min(.1,Math.max(0,(now-this.lastTick)/1000)):.05;this.lastTick=now;if(!this.playable())return;
  for(const [id,p] of this.state.dummies){const home=this.dummyHomes.get(id)!;if(p.knockdownUntil>now){const body=C.createBody();C.snapshot<C.PlayerState>(p,body);C.stepPlayer(body,C.IDLE_INPUT,dt,this.world);Object.assign(p,{x:body.x,y:body.y,z:body.z,vx:body.vx,vy:body.vy,vz:body.vz,anim:body.anim,grounded:body.grounded,simTime:now});}else{Object.assign(p,home,{vx:0,vy:0,vz:0,anim:0,grounded:true,simTime:now});}}
  for(const [id,b] of this.state.bags){
   if(b.owner){const p=this.state.players.get(b.owner)??this.state.dummies.get(b.owner);if(!p||p.vehicleId){this.drop(id,b);continue;}b.x=p.x;b.y=p.y+.6;b.z=p.z;
    if(b.throwAt&&now-b.throwAt>=C.BAG_THROW_RELEASE_MS){const a=this.pending.get(id);if(!a||!this.eligible(b.owner,now)){b.throwAt=0;this.pending.delete(id);continue;}p.bagId='';b.owner='';b.flying=true;b.releasedAt=now;Object.assign(b,C.bagLaunch(p,a));this.pending.delete(id);}else continue;
   }
   if(!b.flying)continue;
   for(let t=0;t<dt&&b.flying;t+=.01){const step=Math.min(.01,dt-t),from={x:b.x,y:b.y+.25,z:b.z};b.vy-=C.BAG_GRAVITY*step;let x=b.x+b.vx*step,y=b.y+b.vy*step,z=b.z+b.vz*step;
    const bounds=this.world.bounds;
    if(!this.clearLine(from,{x,y:y+.25,z})||x<bounds.minX+.3||x>bounds.maxX-.3||z<bounds.minZ+.3||z>bounds.maxZ-.3){b.vx*=-.3;b.vz*=-.3;x=b.x;z=b.z;}
    else{const targets=[...this.state.players].map(([target,p])=>({target,p,practice:false})).concat([...this.state.dummies].map(([target,p])=>({target,p,practice:true})));
     for(const {target,p,practice} of targets){if(target===b.thrower||p.vehicleId||p.knockdownUntil>now||!C.bagHitsPlayer(from,{x,y:y+.25,z},p)||!this.clearLine(from,{x:p.x,y:p.y+.9,z:p.z}))continue;
      if(this.onHit(b.thrower,target,b,practice)){b.flying=false;b.throwAt=0;b.vx=b.vy=b.vz=0;if(!p.bagId){b.owner=target;p.bagId=id;b.x=p.x;b.y=p.y+.6;b.z=p.z;this.pickupAt.set(id,now);}else{b.x=x;b.z=z;b.y=(this.world.height(x,z)??p.y)+.015;}break;}
     }
    }
    if(!b.flying)break;
    const floor=this.world.height(x,z);
    if(floor===undefined||now-b.releasedAt>8000){this.home(id,b);break;}
    if(y<=floor+.015){y=floor+.015;if(Math.abs(b.vy)>2){b.vy=Math.abs(b.vy)*.22;b.vx*=.55;b.vz*=.55;}else{b.flying=false;b.vx=b.vy=b.vz=0;b.throwAt=0;}}
    b.x=x;b.y=y;b.z=z;b.spin+=step*3.5;
   }
  }
  // Pick up loose bags by walking over them. Ownership is granted once,
  // by the server, with the same encounter and line-of-sight gates as E.
  for(const [id,p] of this.state.players){
   if(p.bagId||!this.eligible(id,now))continue;
   for(const [bagId,b] of this.state.bags){
    if(b.owner||b.flying||b.throwAt||Math.hypot(p.x-b.x,p.z-b.z)>.9||Math.abs(p.y-b.y)>1.5)continue;
    if(b.thrower===id&&now-b.releasedAt<1000)continue;
    if(!this.clearLine({x:p.x,y:p.y+1,z:p.z},{x:b.x,y:b.y+.25,z:b.z}))continue;
    b.owner=id;b.thrower='';p.bagId=bagId;this.pickupAt.set(bagId,now);break;
   }
  }
 }
 private drop(id:string,b:Bag){const owner=this.state.players.get(b.owner)??this.state.dummies.get(b.owner);if(owner?.bagId===id)owner.bagId='';b.owner='';b.flying=false;b.throwAt=0;b.vx=b.vy=b.vz=0;b.y=(this.world.height(b.x,b.z)??this.world.spawn.y)+.015;this.pending.delete(id);}
 private home(id:string,b:Bag){const home=C.bagHomes(this.world)[Number(id.split('-').at(-1))-1];this.drop(id,b);if(home)Object.assign(b,home);b.thrower='';b.spin=0;}
 leave(id:string){for(const [bagId,b] of this.state.bags)if(b.owner===id)this.drop(bagId,b);}
 reset(){this.pending.clear();this.pickupAt.clear();this.lastTick=0;this.state.bags.clear();this.state.dummies.clear();this.state.debugDummies=false;this.dummyHomes.clear();C.bagHomes(this.world).forEach((home,i)=>this.state.bags.set(`ersti-${i+1}`,new Bag(home)));}
}
