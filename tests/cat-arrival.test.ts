import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {catArrivalPose,catBenchView,catArrivalView,applyCatArrivalActor,CAT_ARRIVAL_SECONDS} from '../apps/client/src/npcPrototype/src/npcs/cat/cat-arrival.js';
import {avatar,disposeAvatar} from '../apps/client/src/multiplayer/avatar.ts';
import * as C from '../packages/shared/src/index.ts';
test('seated arrival makes two gentle strokes and stands up before restoring control',()=>{
 assert.equal(catArrivalPose(0).handT,0);assert.equal(catArrivalPose(0).eyeLift,.1);
 const values=Array.from({length:281},(_,i)=>catArrivalPose(i/100));assert(values.every(p=>p.handT>=0&&p.handT<=1&&p.handLift>=0));
 const end=catArrivalPose(CAT_ARRIVAL_SECONDS);assert(end.finished);assert.equal(end.standProgress,1);assert.equal(end.handoffProgress,1);assert.equal(catArrivalPose(3.75).handoffProgress,0);assert.equal(catArrivalPose(2).standProgress,0);assert(catArrivalPose(3.2).standProgress>0);assert.equal(end.handT,0);assert.equal(end.eyeLift,0);assert.equal(end.handLift,0);
 assert(!catArrivalPose(CAT_ARRIVAL_SECONDS-.01).finished);assert(catArrivalPose(1).handT>.5);
});
test('seated camera and safe teleport approach rotate with the bench',()=>{
 const group=new THREE.Group(),camera=new THREE.PerspectiveCamera();group.position.fromArray(C.NPC_LAYOUT.cat.position);group.rotation.y=C.NPC_LAYOUT.cat.heading;
 const view=catBenchView(group,camera);assert(view.position.distanceTo(group.position)<1.6);
 const local=group.worldToLocal(view.position.clone());assert(Math.abs(local.x-.68)<1e-8);assert(Math.abs(local.z+.12)<1e-8);
 const target=C.einsteinDestination(C.zurichWorld)!;assert(target);assert(Math.hypot(target.x-group.position.x,target.z-group.position.z)<3);
 const b=C.npcBounds(C.zurichWorld);assert(target.x>b.minX&&target.x<b.maxX&&target.z>b.minZ&&target.z<b.maxZ);
});

test('third-person scene shows the actual player seated, reaching toward the cat, then standing before the first-person handoff',()=>{
 const group=new THREE.Group(),camera=new THREE.PerspectiveCamera(),actor=avatar('#4499cc',1);group.add(actor);
 const view=catArrivalView(group,camera);assert(view.position.distanceTo(group.position)>3);
 const target=new THREE.Vector3(-.42,.94,0),stand=new THREE.Vector3(.68,0,-1.2),sitting=catArrivalPose(1);
 applyCatArrivalActor(actor,sitting,target,stand);assert(actor.visible);assert.equal(actor.getObjectByName('left-leg')!.rotation.x,-Math.PI/2);
 actor.updateWorldMatrix(true,true);assert(actor.getObjectByName('left-wrist')!.getWorldPosition(new THREE.Vector3()).distanceTo(target)<.10);
 applyCatArrivalActor(actor,catArrivalPose(3.75),target,stand);assert(actor.visible);assert(actor.position.distanceTo(stand)<1e-8);assert(Math.abs(actor.getObjectByName('left-leg')!.rotation.x)<1e-8);
 applyCatArrivalActor(actor,catArrivalPose(CAT_ARRIVAL_SECONDS),target,stand);assert(!actor.visible);disposeAvatar(actor);
});
