import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PlayerMedals} from '../apps/server/src/medals.ts';
import {Race} from '../apps/server/src/race.ts';
import {RaceState,Player} from '../apps/server/src/state.ts';
import * as C from '../packages/shared/src/index.ts';
import {withServer,startRound,until,delay} from './fixture.ts';

test('three-player and repeat-victim medals require separate confirmed hits and do not repeat',()=>{
 const m=new PlayerMedals();assert.equal(m.record('a','a','punch',1),undefined);
 assert.deepEqual(m.record('a','b','punch',1)?.ids,['firstBlood']);
 assert.equal(m.record('a','b','punch',1),undefined);
 assert.deepEqual(m.record('a','b','punch',1)?.ids,['repeatOffender']);
 assert.equal(m.record('a','b','punch',1),undefined);
 assert.equal(m.record('a','c','punch',1),undefined);
 assert.deepEqual(m.record('a','d','punch',1)?.ids,['threePlayers']);
 assert.equal(m.record('a','e','punch',1),undefined);
 assert.deepEqual(m.record('a','b','bicycle',1)?.ids,['bicycleHit']);
 assert.equal(m.record('a','b','bicycle',1),undefined);
 assert.deepEqual(m.record('a','c','bicycle',1)?.ids,['bicycleHit']);
 assert.equal(m.record('c','b','punch',1),undefined,'First Blood is room-wide');
 m.reset();assert.deepEqual(m.record('a','b','bicycle',2)?.ids,['firstBlood','bicycleHit']);
});

function harness(){
 const events:{to:string;type:string;data:any}[]=[],state=new RaceState({startedAt:123});
 for(const [id,x] of [['a',0],['b',1.5]] as const)state.players.set(id,new Player({x,y:0,z:0,rotY:Math.PI/2}));
 const room:any=new Race();
 Object.assign(room,{state,world:C.flatWorld,medals:new PlayerMedals(),clients:['a','b'].map(sessionId=>({sessionId,send:(type:string,data:any)=>events.push({to:sessionId,type,data})})),npcs:{busy:()=>false},rounds:{canPlay:()=>true,hit:()=>{}},broadcast:()=>{}});
 return {room,state,events};
}
test('real room combat awards only the attacker and ignores misses, incapacitated victims, and NPCs',()=>{
 const {room,state,events}=harness(),a=state.players.get('a')!,b=state.players.get('b')!;
 a.rotY=-Math.PI/2;room.attack(room.clients[0]);assert.equal(events.filter(e=>e.type==='medal').length,0);
 a.rotY=Math.PI/2;a.attackReadyAt=0;room.attack(room.clients[0]);
 assert.deepEqual(events.filter(e=>e.type==='medal').map(e=>[e.to,e.data.ids]),[['a',['firstBlood']]]);
 for(let i=0;i<5;i++){a.attackReadyAt=0;room.attack(room.clients[0]);}
 assert.equal(events.filter(e=>e.type==='medal').length,1,'spam on a knocked-down victim earns nothing');
 for(let i=0;i<2;i++){a.attackReadyAt=0;b.knockdownUntil=0;room.attack(room.clients[0]);}
 assert.deepEqual(events.filter(e=>e.type==='medal').at(-1)?.data.ids,['repeatOffender']);
 b.x=10;state.players.set('npc',new Player({x:1.6,z:0}));a.attackReadyAt=0;room.attack(room.clients[0]);
 assert.equal(events.filter(e=>e.type==='medal').length,2,'entities without connected clients do not count');
});
test('bicycle run-over uses the room-confirmed contact and cannot farm the same victim',()=>{
 const {room,state,events}=harness(),a=state.players.get('a')!,b=state.players.get('b')!;
 a.vehicleId='bike-1';a.vehicleKind=2;
 room.vehicleHit('a','b',1,1,0,6,1,0,true,2);
 assert.deepEqual(events.filter(e=>e.type==='medal').map(e=>[e.to,e.data.ids]),[['a',['firstBlood','bicycleHit']]]);
 b.knockdownUntil=0;room.vehicleHit('a','b',1,1,0,6,1,0,true,2);
 assert.equal(events.filter(e=>e.type==='medal').length,1);
});
test('live room sends First Blood to the attacking client, never the victim, and resets for the next round',async()=>{
 await withServer(async(client,rooms)=>{
  const a=await client.create('race',{name:'Alice',devMode:true,skipIntro:true});rooms.push(a);
  const b=await client.joinById(a.roomId,{name:'Bob'});rooms.push(b);
  const awarded:C.MedalAward[]=[],victim:C.MedalAward[]=[];
  a.onMessage<C.MedalAward>('medal',m=>awarded.push(m));b.onMessage<C.MedalAward>('medal',m=>victim.push(m));
  a.onMessage('bump',()=>{});b.onMessage('bump',()=>{});b.onMessage('impulse',()=>{});b.onMessage('playerCorrection',()=>{});a.onMessage('impulse',()=>{});a.onMessage('playerCorrection',()=>{});
  await startRound(a,[a,b]);
  const attack=()=>{const p=a.state.players.get(a.sessionId)!,q=a.state.players.get(b.sessionId)!;a.send('move',[p.x,p.y,p.z,Math.atan2(q.x-p.x,q.z-p.z),0,0,0,0]);a.send('hit');};
  attack();await until(()=>awarded.length===1,'first confirmed player medal');assert.deepEqual(awarded[0].ids,['firstBlood']);assert.equal(victim.length,0);
  a.send('hit');await delay(120);assert.equal(awarded.length,1);
  a.send('finishRound');await until(()=>a.state.phase==='Finished','round end');a.send('restartRound');await until(()=>a.state.phase==='Lobby','reset');
  await startRound(a,[a,b]);attack();await until(()=>awarded.length===2,'First Blood in new round');assert.notEqual(awarded[0].roundStartedAt,awarded[1].roundStartedAt);
 });
});
