import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '@race/shared';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {BagManager} from '../apps/server/src/bags.ts';
import {Race} from '../apps/server/src/race.ts';
import {PlayerMedals} from '../apps/server/src/medals.ts';
function harness(){const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:123,hostId:'a',devMode:true});const events:unknown[]=[],hits:string[]=[];const manager=new BagManager(state,C.flatWorld,(from,target,b,practice)=>{hits.push(`${from}:${target}:${practice}`);const p=state.players.get(target)??state.dummies.get(target)!;C.applyImpulse(p,{from,ix:b.vx*.5,iy:2,iz:b.vz*.5,knockdown:true,durationMs:3000},1500);return true;});const home=state.bags.get('ersti-1')!;const a=new Player({x:home.x,y:0,z:home.z,grounded:true});state.players.set('a',a);state.players.set('b',new Player({x:home.x+4,y:0,z:home.z,grounded:true}));const client=(sessionId:string)=>({sessionId,send:(type:string,data:unknown)=>events.push({sessionId,type,data})});return {state,manager,a,client,events,hits};}
test('pickup is atomic, validates proximity, phase, round and ownership, and disconnect drops the bag',()=>{const {state,manager,a,client}=harness(),data={action:'pickup',id:'ersti-1',roundStartedAt:123};manager.command(client('a'),{...data,roundStartedAt:122},1000);assert.equal(a.bagId,'');state.phase=C.RoomPhase.Lobby;manager.command(client('a'),data,1000);assert.equal(a.bagId,'');state.phase=C.RoomPhase.Running;manager.command(client('b'),data,1000);assert.equal(state.players.get('b')!.bagId,'');manager.command(client('a'),data,1000);assert.equal(a.bagId,'ersti-1');const b=state.players.get('b')!;b.x=a.x;b.z=a.z;manager.command(client('b'),data,1000);assert.equal(b.bagId,'');manager.leave('a');assert.equal(a.bagId,'');assert.equal(state.bags.get('ersti-1')!.owner,'');});
test('throw has a release delay, swept hits knock down and transfer ownership exactly once, and malformed aim is rejected',()=>{const {state,manager,a,client,hits}=harness();manager.command(client('a'),{action:'pickup',id:'ersti-1',roundStartedAt:123},1000);manager.command(client('a'),{action:'throw',aim:[NaN,0,0],roundStartedAt:123},1800);assert.equal(state.bags.get('ersti-1')!.throwAt,0);manager.command(client('a'),{action:'throw',aim:[1,0,0],roundStartedAt:123},1800);manager.tick(2000);assert.equal(a.bagId,'ersti-1');for(let t=2200;t<=2900;t+=10)manager.tick(t);assert.equal(a.bagId,'');assert.deepEqual(hits,['a:b:false']);assert.equal(state.players.get('b')!.bagId,'ersti-1');assert.ok(state.players.get('b')!.knockdownUntil>0);assert.equal(state.bags.get('ersti-1')!.owner,'b');});
test('a wall blocks the projectile before a player behind it and no forged client hit exists',()=>{const {state,a,client}=harness();let hits=0;const world={...C.flatWorld,blocked:(x:number)=>x>7};const manager=new BagManager(state,world,()=>{hits++;return true;});a.x=5.25;a.z=-.5;manager.command(client('a'),{action:'pickup',id:'ersti-1',roundStartedAt:123},1000);manager.command(client('a'),{action:'throw',aim:[1,0,0],roundStartedAt:123},1800);for(let t=2000;t<3500;t+=10)manager.tick(t);assert.equal(hits,0);assert.ok(state.bags.get('ersti-1')!.x<7);});
test('only dev-room host can enable dummies; their hits transfer bags, they recover, disabling returns held bags to the ground',()=>{const {state,manager,a,client,hits}=harness();assert.equal(manager.setDummies(client('b'),true),false);state.devMode=false;assert.equal(manager.setDummies(client('a'),true),false);state.devMode=true;assert.equal(manager.setDummies(client('a'),true),true);assert.equal(state.dummies.size,3);state.players.delete('b');a.z=0;const bag=state.bags.get('ersti-1')!;bag.z=0;manager.command(client('a'),{action:'pickup',id:'ersti-1',roundStartedAt:123},1000);manager.command(client('a'),{action:'throw',aim:[1,0,0],roundStartedAt:123},1800);for(let t=2200;t<3100;t+=10)manager.tick(t);assert.equal(hits.length,1);assert.ok(hits[0].endsWith(':true'));assert.ok([...state.dummies.values()].some(p=>p.bagId==='ersti-1'));manager.tick(6000);assert.ok([...state.dummies.values()].every(p=>p.anim===0));manager.setDummies(client('a'),false);assert.equal(state.dummies.size,0);assert.equal(bag.owner,'');});
test('relocated bag homes sit on the requested terrain and capsule sweeps catch crossings but ignore misses',()=>{for(const p of C.bagHomes(C.zurichWorld)){assert.equal(p.y,C.zurichWorld.height(p.x,p.z)!+.015);assert.ok(p.x>=-135&&p.x<=-79);assert.equal(C.zurichWorld.blocked(p.x,p.y,p.z,.3,1.8),false);}const [x,z]=C.BAG_HILL.center;assert.ok(Math.abs(C.zurichWorld.height(x,z)!-C.zurichNativeHeight(x,z)!)<.000001);assert.equal(C.bagHillLift(x+4,z),0);assert.equal(C.bagHitsPlayer({x:-5,y:1,z:0},{x:5,y:1,z:0},{x:0,y:0,z:0}),true);assert.equal(C.bagHitsPlayer({x:-5,y:3,z:0},{x:5,y:3,z:0},{x:0,y:0,z:0}),false);});
test('room-confirmed bag hits award Bagged to thrower, practice does not spend First Blood, and repeated events use unique IDs',()=>{const state=new RaceState({startedAt:123}),events:{id:string;type:string;data:any}[]=[];state.players.set('a',new Player());state.players.set('b',new Player({x:2}));state.dummies.set('dummy',new Player({x:2}));const room:any=new Race();Object.assign(room,{state,medals:new PlayerMedals(),clients:['a','b'].map(sessionId=>({sessionId,send:(type:string,data:any)=>events.push({id:sessionId,type,data})})),rounds:{canPlay:()=>true,hit:()=>{}},npcs:{busy:()=>false}});assert.equal(room.bagHit('a','dummy',{vx:12,vy:0,vz:0},true),true);assert.deepEqual(events.at(-1)?.data.ids,['bagged']);assert.equal(room.bagHit('a','b',{vx:12,vy:0,vz:0},false),true);assert.deepEqual(events.filter(e=>e.type==='medal').at(-1)?.data.ids,['firstBlood','bagged']);assert.equal(room.bagHit('a','b',{vx:12,vy:0,vz:0},false),false);assert.equal(events.filter(e=>e.type==='medal').length,2);});

test('all four relocated bags can be collected and thrown under the authoritative conditions',()=>{
 const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:123});
 const manager=new BagManager(state,C.zurichWorld,()=>false),p=new Player({grounded:true});state.players.set('a',p);
 const results:{ok:boolean}[]=[],client={sessionId:'a',send:(_type:string,data:unknown)=>results.push(data as {ok:boolean})};
 assert.deepEqual(C.BAG_HILL.center,[-107,70.214]);
 assert(C.zurichWorld.height(-107,70.214)!>8);
 for(const id of [...state.bags.keys()]){
  const bag=state.bags.get(id)!;Object.assign(p,{x:bag.x,y:C.zurichWorld.height(bag.x,bag.z),z:bag.z});
  manager.command(client,{action:'pickup',id,roundStartedAt:123},1000);assert.equal(results.at(-1)!.ok,true);assert.equal(p.bagId,id);
  manager.command(client,{action:'throw',aim:[1,0,0],roundStartedAt:123},1500);assert.equal(results.at(-1)!.ok,false,'finish pickup before throwing');
  manager.command(client,{action:'throw',aim:[1,0,0],roundStartedAt:123},1800);assert.equal(results.at(-1)!.ok,true);
  manager.tick(1800+C.BAG_THROW_RELEASE_MS);assert.equal(p.bagId,'');assert(bag.flying);
  manager.reset();
 }
});
test('pickup respects intro, vehicle, knockdown, seated and NPC interaction conditions',()=>{
 const {state,a,client}=harness();let busy=false;
 const manager=new BagManager(state,C.flatWorld,()=>false,()=>busy),data={action:'pickup',id:'ersti-1',roundStartedAt:123};
 for(const set of [()=>{state.introComplete=false;},()=>{a.vehicleId='tram';},()=>{a.knockdownUntil=2000;},()=>{a.moodleSitUntil=2000;},()=>{busy=true;}]){
  state.introComplete=true;a.vehicleId='';a.knockdownUntil=0;a.moodleSitUntil=0;busy=false;set();
  manager.command(client('a'),data,1000);assert.equal(a.bagId,'');
 }
 state.introComplete=true;a.vehicleId='';a.knockdownUntil=0;a.moodleSitUntil=0;busy=false;
 manager.command(client('a'),data,1000);assert.equal(a.bagId,'ersti-1');
});

test('moving throws launch from the current position and carry bounded sprint/strafe momentum',()=>{
 for(const velocity of [{vx:9,vz:0},{vx:0,vz:9},{vx:24,vz:0}]){
  const {state,manager,a,client}=harness();state.players.delete('b');
  for(const id of state.bags.keys())if(id!=='ersti-1')state.bags.delete(id);
  manager.command(client('a'),{action:'pickup',id:'ersti-1',roundStartedAt:123},1000);
  manager.command(client('a'),{action:'throw',aim:[1,0,0],roundStartedAt:123},1800);
  a.x+=2;a.z+=1;Object.assign(a,velocity);
  manager.tick(2230);const b=state.bags.get('ersti-1')!,carry=Math.min(1,C.BAG_CARRY_SPEED_LIMIT/Math.hypot(velocity.vx,velocity.vz));
  assert.equal(a.bagId,'');assert(b.flying);
  assert.equal(b.vx,C.BAG_SPEED+velocity.vx*carry);assert.equal(b.vz,velocity.vz*carry);
  assert(Math.abs(b.x-(a.x+.65+b.vx*.05))<1e-6,'release follows the player, not the wind-up position');
  assert(Math.abs(b.z-(a.z+b.vz*.05))<1e-6);
 }
});
test('bag hit area forgives a small aiming miss but still rejects clear misses',()=>{
 const from={x:-5,y:1,z:0},to={x:5,y:1,z:0};
 assert(C.bagHitsPlayer(from,to,{x:0,y:0,z:.65}));
 assert(!C.bagHitsPlayer(from,to,{x:0,y:0,z:.9}));
 assert(!C.bagHitsPlayer({x:-5,y:3,z:0},{x:5,y:3,z:0},{x:0,y:0,z:0}));
});
test('forgiving bag hits do not reach a player standing behind a wall',()=>{
 const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:123}),home=C.bagHomes(C.flatWorld)[0],hits:string[]=[];
 const world={...C.flatWorld,blocked:(x:number)=>x>=home.x+1.8&&x<=home.x+1.9};
 const manager=new BagManager(state,world,(_from,target)=>{hits.push(target);return true;});
 const a=new Player({x:home.x,y:0,z:home.z});state.players.set('a',a);state.players.set('b',new Player({x:home.x+2,y:0,z:home.z}));
 const client={sessionId:'a',send:()=>{}};
 manager.command(client,{action:'pickup',id:'ersti-1',roundStartedAt:123},1000);
 manager.command(client,{action:'throw',aim:[1,0,0],roundStartedAt:123},1800);
 for(let now=2230;now<2600;now+=10)manager.tick(now);
 assert.deepEqual(hits,[]);assert.equal(state.players.get('b')!.bagId,'');
});
test('walking over a loose bag automatically grants it once and respects encounter restrictions',()=>{
 const {state,manager,a}=harness(),other=state.players.get('b')!;
 other.x=a.x;other.z=a.z;
 a.vehicleId='car';other.knockdownUntil=2000;
 manager.tick(1000);assert.equal(a.bagId,'');assert.equal(other.bagId,'');
 a.vehicleId='';other.knockdownUntil=0;
 manager.tick(1100);assert.equal(a.bagId,'ersti-1');
 assert.notEqual(other.bagId,'ersti-1','only one player owns a bag');
 assert.equal(state.bags.get('ersti-1')!.owner,'a');
});

test('relocated bags rest on clear terrain between the bridge cows',()=>{
 const homes=C.bagHomes(C.zurichWorld),cows=C.BRIDGE_COWS;
 assert.equal(homes.length,4);
 for(const p of homes){
  assert(p.x>Math.min(...cows.map(c=>c.x))&&p.x<Math.max(...cows.map(c=>c.x)));
  assert(!C.zurichWorld.blocked(p.x,p.y,p.z,.4,1.8));
  assert(Math.hypot(p.x+217.18,p.z-35.98)>70,'old bag area has no spawn');
 }
});

test('Zurich has no HB practice dummies even when a dev host requests them',()=>{
 const state=new RaceState({devMode:true,hostId:'host'});
 const manager=new BagManager(state,C.zurichWorld,()=>false);
 assert.equal(manager.setDummies({sessionId:'host',send:()=>{}},true),true);
 assert.equal(state.debugDummies,false);
 assert.equal(state.dummies.size,0);
});
