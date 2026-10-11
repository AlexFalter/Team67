import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as C from '../packages/shared/src/index.ts';
import {NpcEncounters} from '../apps/server/src/npcs.ts';
import {Npc,Player,RaceState} from '../apps/server/src/state.ts';
import type {Client} from 'colyseus';
// @ts-expect-error Prototype model module is JavaScript.
import {createInterviewHelicopter,createParachute} from '../apps/client/src/npcPrototype/src/npcs/interview/helicopter-model.js';

test('helicopter has an open cabin around the seated eye, skids, and animated rotors; parachute has canopy and lines',()=>{
 const heli=createInterviewHelicopter(),eye=new THREE.Vector3(-.58,1.83,1.12),box=new THREE.Box3();heli.root.updateMatrixWorld(true);
 heli.root.traverse((o:THREE.Object3D)=>{if(o instanceof THREE.Mesh)assert.equal(box.setFromObject(o).containsPoint(eye),false,'camera anchor inside a solid mesh');});
 const main=heli.root.getObjectByName('Helicopter main rotor');heli.update(.1);assert.ok(main.rotation.y>0);
 const chute=createParachute();assert.equal(chute.children.filter((o:THREE.Object3D)=>o instanceof THREE.Line).length,12);assert.ok(new THREE.Box3().setFromObject(chute).max.y>5);
});

test('server accepts airborne helicopter and parachute poses but rejects off-corridor, excessive altitude and stale reports',()=>{
 const state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt:1000,endsAt:100000});
 const [x,y,z]=C.NPC_LAYOUT.interview.pickup,p=new Player({x,y,z}),npc=new Npc({limoSolved:true,limoUsed:true,kind:'limousine'});
 state.players.set('a',p);state.npcs.set('a',npc);const encounters=new NpcEncounters(state,C.zurichWorld,()=>{}),client={sessionId:'a'} as Client;
 const pose=(cy:number,py:number,at:number,extra={})=>encounters.pose(client,{roundStartedAt:1000,car:[x,cy,z,0,0],player:[x,py,z,0],...extra},at);
 pose(70,69,2000,{parachuting:true});assert.equal(npc.limoY,70);assert.equal(p.y,69);assert.equal(npc.parachuting,true);
 pose(150,149,2100);assert.equal(npc.limoY,70);assert.equal(p.y,69);
 pose(70,65,2200,{roundStartedAt:0});assert.equal(p.y,69);
 encounters.pose(client,{roundStartedAt:1000,car:[x+100,70,z,0,0],player:[x+100,65,z,0]},2300);assert.equal(npc.limoX,x);
 pose(70,y+4,2400,{parachuting:true});assert.equal(p.y,y+4,'parachuting below aircraft remains synchronized');
 npc.limoSolved=false;pose(70,y+2,2500);assert.equal(p.y,y+4);
});

test('opening the helicopter door moves the panel, window and frame out of the boarding aperture',()=>{
 const {root,door}=createInterviewHelicopter();
 const window=door.getObjectByName('Helicopter door window');assert.ok(window);
 const ray=new THREE.Raycaster(new THREE.Vector3(1.35,1.12,.8),new THREE.Vector3(-1,0,0),0,.4);
 root.updateMatrixWorld(true);assert.ok(ray.intersectObject(root,true).length,'closed door fills the opening');
 const closed=window.getWorldPosition(new THREE.Vector3());
 door.rotation.y=-.8;root.updateMatrixWorld(true);
 assert.equal(ray.intersectObject(root,true).length,0,'no static side panel remains across the opening');
 assert.ok(window.getWorldPosition(new THREE.Vector3()).x>closed.x+.7,'window swings outward with the full door');
 assert.equal(window.parent,door);
});

test('helicopter and rejection-reading use their own timeout, while other NPC encounters retain the short timeout',()=>{
 const startedAt=1000,state=new RaceState({phase:C.RoomPhase.Running,introComplete:true,startedAt,endsAt:Number.MAX_SAFE_INTEGER,scooterArrivalAt:startedAt});
 const p=new Player(),npc=new Npc({kind:'limousine',startedAt,limoVisible:true,parachuting:true});state.players.set('a',p);state.npcs.set('a',npc);
 const encounters=new NpcEncounters(state,C.zurichWorld,()=>{});
 encounters.tick(startedAt+90001);assert.equal(npc.kind,'limousine');assert.equal(npc.parachuting,true);
 encounters.tick(startedAt+C.NPC_LAYOUT.interview.timeoutMs+1);assert.equal(npc.kind,'');assert.equal(npc.limoVisible,false);assert.equal(npc.parachuting,false);
 npc.kind='property';npc.startedAt=startedAt;encounters.tick(startedAt+90001);assert.equal(npc.kind,'');
});
