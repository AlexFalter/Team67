import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {Player,RaceState} from '../apps/server/src/state.ts';
import {FruitManager} from '../apps/server/src/fruit.ts';
function fixture(wall=false){
 const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:123});
 const [x,y,z]=C.FRUIT_STAND.position;
 const world={...C.flatWorld,name:'zurich' as const,height:()=>y,blocked:(px:number)=>wall&&px>x+1.7&&px<x+1.9};
 state.players.set('a',new Player({x,y,z}));state.players.set('b',new Player({x:x+4,y,z}));
 const events:{id:string;data:C.TomatoEvent}[]=[],broadcast:C.TomatoEvent[]=[];
 const manager=new FruitManager(state,world,(id,data)=>events.push({id,data}),data=>broadcast.push(data),id=>state.phase===C.RoomPhase.Running&&state.players.has(id));
 const client={sessionId:'a',send(){}};const cmd=(action:string,now=1000,aim:unknown=[1,0,0])=>manager.command(client,{action,aim,roundStartedAt:123},now);
 return {state,manager,events,broadcast,client,cmd};
}
test('tomatoes validate supplies, round, proximity, finite aim and cooldown; real hit covers only victim until wiped',()=>{
 const {state,manager,events,broadcast,cmd}=fixture();
 cmd('throw');assert.equal(broadcast.length,0);
 manager.command({sessionId:'a',send(){}},{action:'take',roundStartedAt:122},1000);assert.equal(events.length,0);
 cmd('take');assert.equal(events.at(-1)!.data.count,5);
 cmd('throw',1000,[NaN,0,0]);assert.equal(broadcast.length,0);
 cmd('throw');assert.equal(events.at(-1)!.data.count,4);cmd('throw',1010);assert.equal(broadcast.length,1);
 for(let now=1000;now<1350;now+=10)manager.tick(now);
 assert.equal(events.filter(e=>e.data.kind==='splat').length,1);assert.equal(events.find(e=>e.data.kind==='splat')!.id,'b');
 manager.command({sessionId:'b',send(){}},{action:'wipe',roundStartedAt:123},1400);assert.equal(events.at(-1)!.data.kind,'wipe');assert.equal(events.at(-1)!.id,'b');
 state.players.get('a')!.x+=20;cmd('take',2000);assert.notEqual(events.at(-1)!.data.kind,'stock');
 manager.reset();cmd('throw',3000);assert.equal(broadcast.filter(e=>e.kind==='launch').length,1);
});
test('walls block tomato hits and leaving removes projectiles and stock',()=>{
 const {manager,events,broadcast,cmd}=fixture(true);cmd('take');cmd('throw');
 for(let now=1000;now<1500;now+=10)manager.tick(now);
 assert.equal(events.some(e=>e.data.kind==='splat'),false);assert(broadcast.some(e=>e.kind==='remove'));
 manager.leave('a');cmd('throw',2000);assert.equal(broadcast.filter(e=>e.kind==='launch').length,1);
});

test('two real multiplayer clients collect, throw, receive the tomato screen effect and wipe it',async()=>{
 const {withServer,until,startRound}=await import('./fixture.ts');
 await withServer(async(client,rooms)=>{
  const host=await client.create('race',{name:'Thrower',devMode:true,skipIntro:true,mapTeleport:true,adminMode:true,noCarCollisions:true,disableMoodle:true});rooms.push(host);
  const guest=await client.joinById(host.roomId,{name:'Victim'});rooms.push(guest);
  const events:C.TomatoEvent[]=[],victimEvents:C.TomatoEvent[]=[];
  host.onMessage('tomatoEvent',(data:C.TomatoEvent)=>events.push(data));guest.onMessage('tomatoEvent',(data:C.TomatoEvent)=>victimEvents.push(data));
  host.onMessage('mapTeleportResult',()=>{});host.onMessage('playerCorrection',()=>{});
  await startRound(host,[host,guest]);const round=host.state.startedAt;
  host.send('debugMapTeleport',{x:C.FRUIT_STAND.position[0],z:C.FRUIT_STAND.position[2]-1.5,roundStartedAt:round});
  await until(()=>Math.abs(host.state.players.get(host.sessionId)!.x-C.FRUIT_STAND.position[0])<1,'host at fruit stand');
  host.send('fruit',{action:'take',roundStartedAt:round});await until(()=>events.some(e=>e.kind==='stock'&&e.count===5),'server grants tomatoes');
  const target=host.state.players.get(guest.sessionId)!;
  host.send('debugMapTeleport',{x:target.x+3,z:target.z,roundStartedAt:round});
  await until(()=>Math.abs(host.state.players.get(host.sessionId)!.x-target.x-3)<1,'thrower beside real target');
  const p=host.state.players.get(host.sessionId)!,v={x:target.x-p.x,y:target.y+.9-(p.y+1.25),z:target.z-p.z},length=Math.hypot(v.x,v.y,v.z);
  host.send('fruit',{action:'throw',aim:[v.x/length,v.y/length,v.z/length],roundStartedAt:round});
  await until(()=>victimEvents.some(e=>e.kind==='splat'),'target gets screen splatter');
  assert(!events.some(e=>e.kind==='splat'),'thrower screen stays clear');
  guest.send('fruit',{action:'wipe',roundStartedAt:round});await until(()=>victimEvents.some(e=>e.kind==='wipe'),'target wipes tomato off');
 },'zurich');
});

test('fruit stand counter blocks players and leaves its front interaction pavement clear',()=>{const [x,y,z]=C.FRUIT_STAND.position;assert(C.zurichWorld.blocked(x,y,z,.3,1.8));assert(!C.zurichWorld.blocked(x,y,z-1.5,.3,1.8));});

test('stand has finite shared stock; full inventories and duplicate pickups cannot refill it',()=>{
 const {state,manager,cmd,events}=fixture();cmd('take');assert.equal(state.fruitStock,7);
 cmd('take');assert.equal(state.fruitStock,7);assert.equal(events.at(-1)!.data.count,5);
 state.players.get('b')!.x=state.players.get('a')!.x;
 const take=(id:string)=>manager.command({sessionId:id,send(){}},{action:'take',roundStartedAt:123},1000);
 take('b');assert.equal(state.fruitStock,2);
 state.players.set('c',new Player({x:state.players.get('a')!.x,y:state.players.get('a')!.y,z:state.players.get('a')!.z}));take('c');assert.equal(state.fruitStock,0);assert.equal(events.at(-1)!.data.count,2);
 take('c');assert.equal(events.at(-1)!.data.count,2);
 manager.reset();assert.equal(state.fruitStock,C.TOMATO_STAND_SUPPLY);
});
test('five carried tomatoes yield exactly five launches, consuming one per action',()=>{
 const {cmd,events,broadcast}=fixture();cmd('take');
 for(let i=0;i<5;i++){const now=2000+i*C.TOMATO_COOLDOWN_MS;cmd('throw',now);cmd('throw',now);assert.equal(events.at(-1)!.data.count,4-i);assert.equal(broadcast.filter(e=>e.kind==='launch').length,i+1);}
 cmd('throw',10000);assert.equal(broadcast.filter(e=>e.kind==='launch').length,5);
});
test('the stand counter does not block pickup from its front pavement',()=>{
 const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:123});const [x,y,z]=C.FRUIT_STAND.position;
 state.players.set('a',new Player({x,y,z:z-1.5}));const events:C.TomatoEvent[]=[];
 const manager=new FruitManager(state,C.zurichWorld,(_,event)=>events.push(event),()=>{},()=>true);
 manager.command({sessionId:'a',send(){}},{action:'take',roundStartedAt:123},1000);
 assert.equal(events.at(-1)?.count,5);
});
