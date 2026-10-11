import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
// @ts-expect-error Prototype feature is JavaScript.
import {polybahnDialogueView,polybahnMenuView} from '../apps/client/src/npcPrototype/src/vehicles/rail/polybahn-dialogue-view.js';
import * as C from '../packages/shared/src/index.ts';

test('Polybahn dialogue camera stays inside the moving cabin without moving a seated or standing passenger',()=>{
 const parent=new Group(),car=new Group(),actor=new Group();parent.add(car);car.add(actor);actor.position.set(.88,.42,-2.05);actor.scale.setScalar(.74);
 const v=C.createVehicle(C.POLYBAHN_KIND);
 for(const distance of [0,30,100,C.polybahnPath.length]){
  v.railDistance=distance;const f=C.railFrame(v);
  parent.position.set(f.x,f.y,f.z);car.rotation.set(-f.pitch,f.rotY+Math.PI,0,'YXZ');
  // Deliberately leave world matrices stale as the game does before rendering.
  for(const feet of [new Vector3(.88,.2135,1.65),new Vector3(-.22,.54,-2),new Vector3(.22,.54,2)]){
   const world=car.localToWorld(feet.clone()),before=world.clone();
   const view=polybahnDialogueView(car,actor,world,1.59),local=car.worldToLocal(view.eye.clone());
   assert.ok(Math.abs(local.x)<=.22+1e-8);assert.ok(Math.abs(local.z)<=1.85+1e-8);
   assert.ok(local.y>=1.55-1e-8&&local.y<=1.98+1e-8);
   assert.ok(world.distanceTo(before)<1e-8,'conversation leaves passenger position unchanged');
   assert.ok(view.target.distanceTo(car.localToWorld(new Vector3(.88,.42+1.59*.74,-2.05)))<1e-8);
  }
 }
});

test('the passenger chooser follows the cabin before any dialogue is selected',()=>{
 const car=new Group(),direction=new Vector3(.8,.1,-.2).normalize(),v=C.createVehicle(C.POLYBAHN_KIND);
 let previous:Vector3|undefined;
 for(const distance of [0,20,40]){
  v.railDistance=distance;const f=C.railFrame(v);car.position.set(f.x,f.y,f.z);car.rotation.set(-f.pitch,f.rotY+Math.PI,0,'YXZ');
  const feet=car.localToWorld(new Vector3(0,.54,0));
  const view=polybahnMenuView(car,feet,direction),eye=car.worldToLocal(view.eye.clone());
  assert.ok(Math.abs(eye.x)<1e-8&&Math.abs(eye.z)<1e-8&&Math.abs(eye.y-1.96)<1e-8);
  const localDirection=car.worldToLocal(view.target.clone()).sub(eye).normalize();assert.ok(localDirection.distanceTo(direction)<1e-8);
  if(previous)assert.ok(view.eye.distanceTo(previous)>15,'menu camera travels with the cabin');previous=view.eye;
 }
});

test('opening and switching passenger menus keeps the same interior camera anchor',async()=>{
 // @ts-expect-error Prototype feature is JavaScript.
 const {capturePolybahnMenuEye}=await import('../apps/client/src/npcPrototype/src/vehicles/rail/polybahn-dialogue-view.js');
 const {PerspectiveCamera}=await import('three');
 const car=new Group(),actor=new Group(),camera=new PerspectiveCamera();car.add(actor);actor.position.set(.88,.42,-2.05);
 car.rotation.set(-.3,1.2,0,'YXZ');camera.position.copy(car.localToWorld(new Vector3(.6,1.7,.4)));
 const position=car.localToWorld(new Vector3(.6,.2135,.4)),anchor=capturePolybahnMenuEye(car,camera,position);
 assert.ok(anchor.distanceTo(new Vector3(.6,1.7,.4))<1e-8,'opening does not relocate the camera');
 for(let i=0;i<3;i++){
  car.position.x+=10;car.rotation.y+=.1;
  const menu=polybahnMenuView(car,position,new Vector3(0,0,-1),anchor);
  const talk=polybahnDialogueView(car,actor,position,1.59,anchor);
  assert.ok(menu.eye.distanceTo(talk.eye)<1e-8,'selecting NPC only turns the camera');
  assert.ok(car.worldToLocal(menu.eye.clone()).distanceTo(anchor)<1e-8,'stale world player position cannot move the camera');
 }
 camera.position.set(100,100,100);const fallback=capturePolybahnMenuEye(car,camera,position);
 assert.ok(Math.abs(fallback.x)<=.22&&Math.abs(fallback.z)<=1.85&&fallback.y<=1.98);
});
