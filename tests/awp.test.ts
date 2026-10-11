import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {AwpManager} from '../apps/server/src/awp.ts';
function fixture(wall=false){const state=new RaceState({startedAt:123,phase:C.RoomPhase.Running,introComplete:true});state.players.set('a',new Player({x:0,y:0,z:0,awpOwned:true}));state.players.set('b',new Player({x:8,y:0,z:0}));state.players.set('c',new Player({x:15,y:0,z:0}));const shots:C.AwpShot[]=[],hits:{target:string;hit:C.Impulse}[]=[];const world={...C.flatWorld,height:()=>0,blocked:(x:number)=>wall&&x>=4&&x<=4.2};const manager=new AwpManager(state,world,id=>state.players.has(id),()=>false,(target,hit)=>{hits.push({target,hit});return true;},shot=>shots.push(shot));const command=(action:string,now=1000,aim:unknown=[1,0,0],roundStartedAt=123)=>manager.command('a',{action,aim,roundStartedAt},now);return {state,shots,hits,manager,command};}
test('AWP exact capsule intersection hits the body, rounded head and misses beside it',()=>{const p={x:10,y:0,z:0};assert(C.awpCapsuleDistance([0,1,0],[1,0,0],p)<10);assert(C.awpCapsuleDistance([0,1.6,0],[1,0,0],p)<10);assert.equal(C.awpCapsuleDistance([0,1,.36],[1,0,0],p),Infinity);assert.equal(C.awpCapsuleDistance([0,1.7,0],[1,0,0],p),Infinity);assert.equal(C.awpCapsuleDistance([0,1,0],[-1,0,0],p),Infinity);});
test('AWP requires equip, validates round and finite unit aim, hits nearest player immediately and enforces cooldown',()=>{const {command,hits,shots,manager}=fixture();command('fire');assert.equal(shots.length,0);command('equip');for(const aim of [[NaN,0,0],[2,0,0],[0,0,0],[],null])command('fire',1000,aim);command('fire',1000,[1,0,0],122);assert.equal(shots.length,0);command('fire');assert.equal(shots.length,1);assert.equal(hits[0].target,'b');assert.equal(hits[0].hit.ix,28);assert.equal(hits[0].hit.knockdown,true);assert.equal(shots[0].hit,true);assert(shots[0].end[0]<8);command('fire',1100);assert.equal(shots.length,1);command('fire',2500);assert.equal(shots.length,2);command('holster');command('fire',5000);assert.equal(shots.length,2);manager.reset();command('fire',7000);assert.equal(shots.length,2);});
test('AWP walls stop hits and incapacitated or seated shooters cannot equip or fire',()=>{const {command,hits,shots,state}=fixture(true);command('equip');command('fire');assert.equal(hits.length,0);assert(shots[0].end[0]<4.3);state.players.get('a')!.vehicleId='car';command('fire',3000);assert.equal(shots.length,1);command('holster');command('equip',4000);assert.equal(state.players.get('a')!.awpEquipped,false);state.players.get('a')!.vehicleId='';state.players.get('a')!.knockdownUntil=6000;command('equip',4000);assert.equal(state.players.get('a')!.awpEquipped,false);});
test('two multiplayer clients receive server-authoritative AWP hits and knockback',async()=>{const {withServer,until,startRound}=await import('./fixture.ts');await withServer(async(client,rooms)=>{const host=await client.create('race',{name:'AWP',devMode:true,skipIntro:true,mapTeleport:true,adminMode:true,noCarCollisions:true,disableMoodle:true});rooms.push(host);const guest=await client.joinById(host.roomId,{name:'Target'});rooms.push(guest);const shots:C.AwpShot[]=[],impulses:C.Impulse[]=[];host.onMessage('awpShot',(s:C.AwpShot)=>shots.push(s));guest.onMessage('awpShot',()=>{});guest.onMessage('impulse',(i:C.Impulse)=>impulses.push(i));guest.onMessage('playerCorrection',()=>{});host.onMessage('mapTeleportResult',()=>{});host.onMessage('playerCorrection',()=>{});await startRound(host,[host,guest]);await collectAwp(host,until);const round=host.state.startedAt,target=host.state.players.get(guest.sessionId)!;host.send('debugMapTeleport',{x:target.x+3,z:target.z,roundStartedAt:round});await until(()=>Math.abs(host.state.players.get(host.sessionId)!.x-target.x-3)<.5,'shooter next to target');const p=host.state.players.get(host.sessionId)!,v=[target.x-p.x,target.y+1.1-(p.y+1.6),target.z-p.z],length=Math.hypot(...v);host.send('awp',{action:'equip',roundStartedAt:round});await until(()=>host.state.players.get(host.sessionId)!.awpEquipped,'AWP equipped');host.send('awp',{action:'fire',aim:v.map(n=>n/length),roundStartedAt:round});await until(()=>shots.some(s=>s.hit)&&impulses.length>0,'real player knocked back');assert.equal(shots.at(-1)!.target,guest.sessionId);assert(impulses[0].ix<-25);assert.equal(impulses[0].knockdown,true);});});
test('AWP hits the nearest debug dummy with knockback, respecting walls and recovery protection',()=>{
 const f=fixture();f.state.dummies.set('dummy',new Player({x:4,y:0,z:0}));f.command('equip');f.command('fire');
 const dummy=f.state.dummies.get('dummy')!;assert.equal(f.shots[0].target,'dummy');assert.equal(f.shots[0].hit,true);assert.equal(f.hits.length,0);assert.equal(dummy.vx,28);assert.equal(dummy.vy,5);assert.equal(dummy.knockdownUntil,2800);
 f.command('fire',2500);assert.equal(f.shots[1].hit,false);assert.equal(dummy.vx,28);
 const w=fixture(true);w.state.dummies.set('dummy',new Player({x:6,y:0,z:0}));w.command('equip');w.command('fire');assert.equal(w.shots[0].target,'');assert.equal(w.state.dummies.get('dummy')!.vx,0);
});
test('AWP magazine is server-owned, blocks empty/reloading shots and refills only after reload finishes',()=>{
 const f=fixture();f.command('equip');for(let i=0;i<10;i++)f.command('fire',1000+i*1500);const p=f.state.players.get('a')!;
 assert.equal(p.awpAmmo,0);assert.equal(f.shots.length,10);f.command('fire',17000);assert.equal(f.shots.length,10);
 f.command('reload',18000);assert.equal(p.awpReloadUntil,19800);f.command('reload',18500);assert.equal(p.awpReloadUntil,19800);f.command('fire',19000);assert.equal(f.shots.length,10);
 f.manager.tick(19799);assert.equal(p.awpAmmo,0);f.manager.tick(19800);assert.equal(p.awpAmmo,10);assert.equal(p.awpReloadUntil,0);f.command('fire',20000);assert.equal(p.awpAmmo,9);
 f.command('holster');f.command('equip');assert.equal(p.awpAmmo,9);f.manager.reset();assert.equal(p.awpAmmo,10);assert.equal(p.awpEquipped,false);
});
test('live room AWP knocks back a spawned practice dummy and decrements synchronized ammo',async()=>{
 const {withServer,until,startRound}=await import('./fixture.ts');await withServer(async(client,rooms)=>{
 const host=await client.create('race',{name:'Dummy tester',devMode:true,skipIntro:true,mapTeleport:true,adminMode:true,noCarCollisions:true,disableMoodle:true});rooms.push(host);const shots:C.AwpShot[]=[];host.onMessage('awpShot',(s:C.AwpShot)=>shots.push(s));host.onMessage('mapTeleportResult',()=>{});host.onMessage('playerCorrection',()=>{});
 await startRound(host,[host]);await collectAwp(host,until);host.send('debugDummies',true);await until(()=>host.state.dummies.size>0,'debug dummies created');
 const target=[...host.state.dummies.values()][0],round=host.state.startedAt;host.send('debugMapTeleport',{x:target.x,z:target.z-3,roundStartedAt:round});await until(()=>Math.abs(host.state.players.get(host.sessionId)!.z-target.z+3)<.5,'shooter near dummy');
 const p=host.state.players.get(host.sessionId)!,v=[target.x-p.x,target.y+1.1-(p.y+1.6),target.z-p.z],length=Math.hypot(...v);
 host.send('awp',{action:'equip',roundStartedAt:round});host.send('awp',{action:'fire',aim:v.map(n=>n/length),roundStartedAt:round});
 await until(()=>shots.some(s=>s.hit),'dummy hit');const hit=shots.at(-1)!;assert(host.state.dummies.has(hit.target));await until(()=>host.state.dummies.get(hit.target)!.knockdownUntil>Date.now()&&host.state.players.get(host.sessionId)!.awpAmmo===9,'dummy knockdown and ammo patch');assert(host.state.dummies.get(hit.target)!.vz>0);
 });
});

async function collectAwp(host:import('@colyseus/sdk').Room,until:(predicate:()=>boolean,label:string)=>Promise<void>){
 const [x,,z]=C.awpRackPlacement(C.flatWorld).approach;host.send('debugMapTeleport',{x,z,roundStartedAt:host.state.startedAt});await until(()=>Math.hypot(host.state.players.get(host.sessionId).x-x,host.state.players.get(host.sessionId).z-z)<.5,'at wall rack');host.send('awp',{action:'pickup',roundStartedAt:host.state.startedAt});await until(()=>host.state.players.get(host.sessionId).awpOwned,'wall AWP picked up');await until(()=>host.state.players.get(host.sessionId).awpInspectUntil<=Date.now(),'pickup inspection finished');
}
test('AWP ownership requires a clear, nearby pickup and resets each round',()=>{
 const f=fixture();const p=f.state.players.get('a')!;p.awpOwned=false;f.command('equip');f.command('fire');f.command('reload');assert.equal(p.awpEquipped,false);assert.equal(f.shots.length,0);f.command('pickup');assert.equal(p.awpOwned,false);
 const [x,y,z]=C.awpRackPlacement(C.flatWorld).approach;Object.assign(p,{x,y,z});f.command('pickup');assert.equal(p.awpOwned,true);assert.equal(p.awpEquipped,true);assert.equal(p.awpAmmo,10);p.awpAmmo=4;f.command('pickup');assert.equal(p.awpAmmo,4);f.manager.reset();assert.equal(p.awpOwned,false);
 const state=new RaceState({startedAt:123});state.players.set('a',new Player({x:x-1,y,z}));const world={...C.flatWorld,blocked:(px:number)=>px>x-.6&&px<x-.4};const manager=new AwpManager(state,world,()=>true,()=>false,()=>false,()=>{});manager.command('a',{action:'pickup',roundStartedAt:123},1000);assert.equal(state.players.get('a')!.awpOwned,false);
});
test('all three wall AWPs independently grant a weapon to nearby players',()=>{
 const racks=C.awpRackPlacements(C.flatWorld);
 assert.equal(racks.length,3);
 assert.equal(new Set(racks.map(r=>r.approach.join(','))).size,3);
 const state=new RaceState({startedAt:123});
 const manager=new AwpManager(state,C.flatWorld,()=>true,()=>false,()=>false,()=>{});
 for(const [index,{approach:[x,y,z]}] of racks.entries()){
  const id=`player-${index}`,player=new Player({x,y,z});state.players.set(id,player);
  manager.command(id,{action:'pickup',roundStartedAt:123},1000);
  assert.equal(player.awpOwned,true,`pickup ${index+1}`);
  assert.equal(player.awpEquipped,true);assert.equal(player.awpAmmo,C.AWP_MAGAZINE);
 }
 const far=new Player({x:0,y:0,z:0});state.players.set('far',far);
 manager.command('far',{action:'pickup',roundStartedAt:123},1000);
 assert.equal(far.awpOwned,false);
});
test('post-shot bolt cycling prevents another shot or reload until the chamber is ready',()=>{
 const f=fixture();f.command('equip');f.command('fire',1000);f.command('reload',1100);assert.equal(f.state.players.get('a')!.awpReloadUntil,0);f.command('fire',2399);assert.equal(f.shots.length,1);f.command('reload',2400);assert.equal(f.state.players.get('a')!.awpReloadUntil,4200);
});

test('AWP has exactly twenty darts, including its finite pocket refill',()=>{
 const f=fixture(),p=f.state.players.get('a')!;f.command('equip');
 for(let i=0;i<10;i++)f.command('fire',1000+i*1500);
 assert.equal(p.awpAmmo,0);assert.equal(p.awpReserve,10);
 f.command('reload',17000);f.manager.tick(18800);
 assert.equal(p.awpAmmo,10);assert.equal(p.awpReserve,0);
 for(let i=0;i<10;i++)f.command('fire',19000+i*1500);
 f.command('reload',35000);f.command('holster',35001);f.command('equip',35002);f.command('fire',35003);f.manager.tick(40000);
 assert.equal(f.shots.length,20);assert.equal(p.awpAmmo,0);assert.equal(p.awpReserve,0);assert.equal(p.awpReloadUntil,0);
 f.manager.reset();assert.equal(p.awpReserve,10);
});
test('early refill transfers only missing darts without increasing total ammunition',()=>{
 const f=fixture(),p=f.state.players.get('a')!;f.command('equip');f.command('fire',1000);f.command('reload',2500);f.manager.tick(4300);
 assert.equal(p.awpAmmo,10);assert.equal(p.awpReserve,9);
});

test('wall pickup inspection prevents firing and reloading until the blaster settles',()=>{
 const f=fixture(),p=f.state.players.get('a')!;p.awpOwned=false;const [x,y,z]=C.awpRackPlacement(C.flatWorld).approach;Object.assign(p,{x,y,z});f.command('pickup',1000);assert.equal(p.awpInspectUntil,3600);f.command('fire',2000);assert.equal(f.shots.length,0);p.awpAmmo=9;f.command('reload',2000);assert.equal(p.awpReloadUntil,0);f.command('fire',3600);assert.equal(f.shots.length,1);
});
