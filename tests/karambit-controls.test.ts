import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as C from '../packages/shared/src/index.ts';
import { Player, RaceState } from '../apps/server/src/state.ts';
import { Race } from '../apps/server/src/race.ts';
import type { WireState } from './fixture.ts';
// @ts-expect-error Viewmodel is JavaScript.
import { createKarambit } from '../apps/client/src/npcPrototype/src/interactions/knife/karambit.js';

test('equipped Karambit spins repeatedly and a slash interrupts its spin', async t => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({createLinearGradient:()=>({addColorStop(){}}),fillRect(){}})})}});
  t.mock.method(GLTFLoader.prototype,'loadAsync',async()=>({scene:new THREE.Group()}));
  let contacts=0;
  try {
    const knife=await createKarambit(new THREE.PerspectiveCamera(),{onStrike:()=>{contacts++;return true;}});
    knife.give();assert.equal(knife.state().phase,'inspect');
    for(let i=0;i<600;i++)knife.update(1/60,true);
    assert.ok(knife.state().spins>=4,'spin repeats without pressing F');
    knife.toggle();knife.toggle();assert.equal(knife.state().phase,'inspect');
    assert.equal(knife.attack(),true,'slash must respond during automatic spinning');
    assert.equal(knife.attack(),false,'one contact per animation');
    for(let i=0;i<60;i++)knife.update(1/60,true);
    assert.equal(contacts,1);assert.equal(knife.state().hits,1);
    const spins=knife.state().spins;knife.holster();
    for(let i=0;i<180;i++)knife.update(1/60,true);
    assert.equal(knife.state().spins,spins);assert.equal(knife.state().visible,false);
    knife.dispose();
  } finally {if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});

test('predicted slash cooldown is one second and punches take two',()=>{
  for(const karambit of [false,true]){
    const p=C.createBody();p.simTime=1000;
    C.stepPlayer(p,{...C.IDLE_INPUT,hit:true,karambit},1/60);
    const ready=p.attackReadyAt;
    assert.ok(Math.abs(ready-p.simTime-(karambit?1000:2000))<1e-6);
    p.simTime=ready-100;C.stepPlayer(p,{...C.IDLE_INPUT,hit:true,karambit},1/60);
    assert.equal(p.attackReadyAt,ready);
    p.simTime=ready;C.stepPlayer(p,{...C.IDLE_INPUT,hit:true,karambit},1/60);
    assert.ok(p.attackReadyAt>ready);
  }
});

test('server enforces the slash cooldown and refuses the faster rate without a collected knife',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const room=Object.create(Race.prototype) as any,state=new RaceState(),p=new Player();
  state.players.set('attacker',p);
  Object.defineProperty(room,'state',{value:state});
  Object.assign(room,{world:C.flatWorld,rounds:{canPlay:()=>true},npcs:{busy:()=>false}});
  room.attack({sessionId:'attacker'},{karambit:true});assert.equal(p.attackReadyAt,3000,'unowned knives get the punch cooldown');
  p.karambitOwned=true;p.attackReadyAt=0;
  room.attack({sessionId:'attacker'},{karambit:true});assert.equal(p.attackReadyAt,2000);
  now=1999;room.attack({sessionId:'attacker'},{karambit:true});assert.equal(p.attackReadyAt,2000);
  now=2000;room.attack({sessionId:'attacker'},{karambit:true});assert.equal(p.attackReadyAt,3000);
  now=3000;room.attack({sessionId:'attacker'});assert.equal(p.attackReadyAt,5000,'holstered punch takes two seconds');
});

test('Karambit reward can only be claimed near the riders in the current world',()=>{
  const [x,z]=C.NPC_LAYOUT.scooter.ridePoints.at(-1)!,p={...C.createBody(),x,z,y:C.zurichWorld.height(x,z)!};
  assert.equal(C.canCollectKarambit(p,C.zurichWorld),true);
  for(const blocked of [{karambitOwned:true},{vehicleId:'bike'},{bagId:'bag'},{x:x+28},{y:p.y+5}])assert.equal(C.canCollectKarambit({...p,...blocked},C.zurichWorld),false);
  assert.equal(C.canCollectKarambit(p,C.flatWorld),false);
});


test('live room grants the nearby knife and replicates its one-second cooldown to both clients',{timeout:15000},async()=>{
  const {withServer,startRound,until,delay}=await import('./fixture.ts');
  await withServer(async(client,rooms)=>{
    const host=await client.create<WireState>('race',{name:'Knife test',devMode:true,skipIntro:true,mapTeleport:true,moodleEnabled:false});rooms.push(host);
    const guest=await client.joinById<WireState>(host.roomId,{name:'Observer'});rooms.push(guest);
    host.onMessage('playerCorrection',()=>{});host.onMessage('mapTeleportResult',()=>{});
    await startRound(host,[host,guest]);
    const own=()=>host.state.players.get(host.sessionId)!;
    host.send('collectKarambit');await delay(120);assert.equal(own().karambitOwned,false,'distant pickup is rejected');
    const [x,z]=C.NPC_LAYOUT.scooter.ridePoints.at(-1)!;
    host.send('debugMapTeleport',{x,z,roundStartedAt:host.state.startedAt});
    await until(()=>Math.hypot(own().x-x,own().z-z)<2,'arrived at plaza');
    host.send('collectKarambit');await until(()=>own().karambitOwned===true,'server granted collected knife');
    const sent=Date.now();host.send('hit',{karambit:true});await until(()=>own().attackReadyAt>sent,'slash accepted');
    const ready=own().attackReadyAt;assert.ok(ready-sent>=1000&&ready-sent<1250);
    host.send('hit',{karambit:true});await delay(120);assert.equal(own().attackReadyAt,ready,'early repeated slash rejected');
    await until(()=>guest.state.players.get(host.sessionId)?.attackReadyAt===ready,'cooldown replicated to observer');
  },'zurich');
});
