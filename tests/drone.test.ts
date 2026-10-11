import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {AwpManager} from '../apps/server/src/awp.ts';
function fixture(){const state=new RaceState({startedAt:123,phase:C.RoomPhase.Running,introComplete:true});state.players.set('a',new Player({awpOwned:true,awpEquipped:true}));const shots:C.AwpShot[]=[],scans:{id:string;scan:C.DroneScan}[]=[];const manager=new AwpManager(state,{...C.flatWorld,height:()=>0,blocked:()=>false},()=>true,()=>false,()=>true,s=>shots.push(s),()=>{},(id,scan)=>scans.push({id,scan}));const command=(action:string,now:number,aim=[1,0,0],roundStartedAt=123)=>manager.command('a',{action,aim,roundStartedAt},now);return {state,shots,scans,manager,command,p:state.players.get('a')!};}
function earn(f:ReturnType<typeof fixture>){for(let i=0;i<5;i++){for(const q of f.state.players.values())if(q!==f.p)q.x=100;f.state.players.set(`p${i}`,new Player({x:8}));f.command('fire',1000+i*1500);}return 10000;}
test('five confirmed hits earn drone; repeats and dummies count, misses do not',()=>{
 const f=fixture();f.state.players.set('b',new Player({x:8}));f.command('fire',1000);f.command('fire',2500);assert.equal(f.p.droneStreak,2);f.command('fire',4000,[-1,0,0]);assert.equal(f.p.droneStreak,2);f.state.dummies.set('dummy',new Player({x:4}));f.command('fire',5500);assert.equal(f.p.droneStreak,3);f.p.knockdownUntil=7000;f.manager.tick(6000);assert.equal(f.p.droneStreak,0);assert(!f.p.droneReady);
 const same=fixture();same.state.players.set('b',new Player({x:8}));for(let i=0;i<5;i++)same.command('fire',1000+i*1500);assert(same.p.droneReady,'five hits on one player earn the drone');
 const g=fixture();earn(g);assert(g.p.droneReady);assert.equal(g.shots.filter(s=>s.droneEarned).length,1);assert.equal(g.p.droneStreak,0);
});
test('tablet activation consumes one earned drone and privately scans every two seconds for exactly thirty seconds',()=>{
 const f=fixture(),now=earn(f);f.command('drone',now-1,[1,0,0],122);assert(f.p.droneReady);f.command('drone',now);assert(!f.p.droneReady);assert.equal(f.p.droneCallUntil,now+C.DRONE_CALL_MS);assert.equal(f.p.droneScanUntil,f.p.droneCallUntil+30000);
 const end=f.p.droneScanUntil,start=f.p.droneCallUntil;f.command('drone',now+1);assert.equal(f.p.droneScanUntil,end);f.command('fire',now+100);assert.equal(f.shots.length,5);
 f.manager.tick(start-1);assert.equal(f.scans.length,0);f.manager.tick(start);assert.equal(f.scans.length,1);assert.equal(f.scans[0].id,'a');assert.equal(f.scans[0].scan.players.length,5);assert(!f.scans[0].scan.players.some(p=>p.id==='a'));
 const snapshot=f.scans[0].scan.players.find(p=>p.id==='p4')!;f.state.players.get('p4')!.x=25;assert.equal(snapshot.x,8);f.manager.tick(start+1999);assert.equal(f.scans.length,1);f.manager.tick(start+2000);assert.equal(f.scans.at(-1)!.scan.players.find(p=>p.id==='p4')!.x,25);
 for(let offset=4000;offset<30000;offset+=2000)f.manager.tick(start+offset);assert.equal(f.scans.length,15);f.manager.tick(end);f.manager.tick(end+2000);assert.equal(f.scans.length,15);f.manager.reset();assert(!f.p.droneReady);assert.equal(f.p.droneScanUntil,0);
});
test('unearned or incapacitated call-ins are rejected',()=>{const f=fixture();f.command('drone',1000);assert.equal(f.p.droneCallUntil,0);f.p.droneReady=true;f.p.vehicleId='car';f.command('drone',2000);assert(f.p.droneReady);assert.equal(f.p.droneCallUntil,0);});
test('room scan packets reach only the caller',async()=>{
 const {Race}=await import('../apps/server/src/race.ts');
 const room:any=new Race(),events:{to:string;type:string;data:C.DroneScan}[]=[];
 room.clients=['a','b'].map(sessionId=>({sessionId,send:(type:string,data:C.DroneScan)=>events.push({to:sessionId,type,data})}));
 const f=fixture(),now=earn(f);f.command('drone',now);f.manager.tick(now+C.DRONE_CALL_MS);
 room.sendDroneScan(f.scans[0].id,f.scans[0].scan);
 assert.equal(events.length,1);assert.equal(events[0].to,'a');assert.equal(events[0].type,'droneScan');assert(!events[0].data.players.some(p=>p.id==='a'));
});

test('debug mannequins award points and a drone, excluding recovery-protected shots',()=>{
 const f=fixture(),dummy=new Player({x:8});f.state.dummies.set('dummy',dummy);
 f.command('fire',1000);assert.equal(f.p.droneStreak,1);
 dummy.invincibleUntil=5000;f.command('fire',2500);assert.equal(f.p.droneStreak,1,'protected mannequin hits earn no points');
 for(let i=0;i<4;i++){dummy.x=8;dummy.y=0;dummy.z=0;f.command('fire',6000+i*4000);}
 assert(f.p.droneReady);assert.equal(f.shots.filter(s=>s.droneEarned).length,1);
});
