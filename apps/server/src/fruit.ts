import * as C from '@race/shared';
import type {RaceState} from './state.ts';
interface Sender {sessionId:string;send(type:string,data:unknown):void}
export class FruitManager {
 private stock=new Map<string,number>();private cooldown=new Map<string,number>();private covered=new Set<string>();
 private projectiles=new Map<number,C.TomatoProjectile>();private serial=0;private last=0;
 constructor(private state:RaceState,private world:C.MovementWorld,private send:(id:string,event:C.TomatoEvent)=>void,private broadcast:(event:C.TomatoEvent)=>void,private canPlay:(id:string,now:number)=>boolean,private busy:(id:string)=>boolean=()=>false){}
 private event(event:Omit<C.TomatoEvent,'roundStartedAt'>):C.TomatoEvent{return {...event,roundStartedAt:this.state.startedAt};}
 private clear(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number}){const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.12);for(let i=1;i<=n;i++){const t=i/n;if(this.world.blocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t,.08,.16))return false;}return true;}
 command(client:Sender,data:unknown,now:number){
  const d=data as {action?:string;aim?:unknown;roundStartedAt?:number}|null,id=client.sessionId,p=this.state.players.get(id);
  if(!d||d.roundStartedAt!==this.state.startedAt||!p||!this.canPlay(id,now))return;
  if(d.action==='wipe'){this.covered.delete(id);this.send(id,this.event({kind:'wipe'}));return;}
  if(p.vehicleId||p.bagId||p.knockdownUntil>now||p.moodleSitUntil>now||this.busy(id))return;
  if(d.action==='take'){
   const [x,y,z]=C.FRUIT_STAND.position;if(this.world.name!=='zurich'||Math.hypot(p.x-x,p.y-y,p.z-z)>3.4||!this.clear({x:p.x,y:p.y+1.6,z:p.z},{x,y:y+1.6,z}))return;
   const held=this.stock.get(id)??0,taken=Math.min(1,C.TOMATO_CAPACITY-held,this.state.fruitStock);
   this.state.fruitStock-=taken;this.stock.set(id,held+taken);this.send(id,this.event({kind:'stock',count:held+taken}));return;
  }
  if(d.action!=='throw'||!this.stock.get(id)||now<(this.cooldown.get(id)??0)||this.covered.has(id)||!Array.isArray(d.aim)||d.aim.length!==3||!d.aim.every(v=>typeof v==='number'&&Number.isFinite(v)))return;
  const [ax,ay,az]=d.aim as number[],length=Math.hypot(ax,ay,az);if(length<.5||length>1.5)return;
  const a={x:ax/length,y:ay/length,z:az/length},origin={x:p.x,y:p.y+1.25,z:p.z},start={x:origin.x+a.x*.6,y:origin.y+a.y*.6,z:origin.z+a.z*.6};
  if(!this.clear(origin,start))return;
  const projectile={id:++this.serial,from:id,...start,vx:a.x*C.TOMATO_SPEED+p.vx*.4,vy:a.y*C.TOMATO_SPEED+1.5,vz:a.z*C.TOMATO_SPEED+p.vz*.4,born:now};
  this.projectiles.set(projectile.id,projectile);this.cooldown.set(id,now+C.TOMATO_COOLDOWN_MS);const count=this.stock.get(id)!-1;this.stock.set(id,count);
  this.send(id,this.event({kind:'stock',count}));this.broadcast(this.event({kind:'launch',projectile:{...projectile}}));
 }
 tick(now:number){const dt=this.last?Math.min(.1,Math.max(0,(now-this.last)/1000)):.05;this.last=now;
  for(const [id,b] of this.projectiles){let ended=now-b.born>5000||!this.canPlay(b.from,now);
   for(let t=0;t<dt&&!ended;t+=.01){const step=Math.min(.01,dt-t),a={x:b.x,y:b.y,z:b.z};b.vy-=9.81*step;const next={x:b.x+b.vx*step,y:b.y+b.vy*step,z:b.z+b.vz*step};
    if(!this.clear(a,next)){ended=true;break;}
    for(const [target,p] of this.state.players){if(target===b.from||!this.canPlay(target,now)||this.busy(target)||!C.bagHitsPlayer(a,next,p,.5)||!this.clear(a,{x:p.x,y:p.y+1,z:p.z}))continue;
     this.covered.add(target);this.send(target,this.event({kind:'splat'}));ended=true;break;
    }
    Object.assign(b,next);const floor=this.world.height(b.x,b.z);if(floor===undefined||b.y<=floor+.08)ended=true;
   }
   if(ended){this.projectiles.delete(id);this.broadcast(this.event({kind:'remove',id}));}
  }
 }
 leave(id:string){this.stock.delete(id);this.cooldown.delete(id);this.covered.delete(id);for(const [key,p] of this.projectiles)if(p.from===id){this.projectiles.delete(key);this.broadcast(this.event({kind:'remove',id:key}));}}
 reset(){this.state.fruitStock=C.TOMATO_STAND_SUPPLY;this.stock.clear();this.cooldown.clear();this.covered.clear();this.projectiles.clear();this.last=0;}
}
