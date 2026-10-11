import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera} from 'three';
import {createBody,examPortalPosition} from '../packages/shared/src/index.ts';
import {ExamSequence,BONUS_BANNER_MS,type ExamSession} from '../apps/client/src/exam/ExamSequence.ts';

test('race endpoint shows only the bonus banner, then opens the game without moving the camera',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 const context={createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>context})}});
 const scene=new Scene(),camera=new PerspectiveCamera();camera.position.set(5,6,7);
 const position=camera.position.clone(),rotation=camera.quaternion.clone();let session:ExamSession|undefined;
 const sequence=new ExamSequence(scene,camera,value=>{session=value;});
 const body={...createBody(),...examPortalPosition,vx:2};
 try {
  sequence.update(body,true,false,1,30,1000);assert.equal(session?.stage,'world','paused players do not enter');
  sequence.update(body,true,true,1,30,1100);assert.equal(session?.stage,'bonus');assert(sequence.active);assert(!sequence.screenVisible);assert.equal(body.vx,0);
  sequence.update(body,true,true,1,29,1100+BONUS_BANNER_MS-1);assert.equal(session?.stage,'bonus');
  sequence.update(body,true,true,1,28,1100+BONUS_BANNER_MS);assert.equal(session?.stage,'exam');assert(sequence.screenVisible);
  assert(camera.position.equals(position));assert(camera.quaternion.equals(rotation));
  sequence.complete(800);assert.equal(session?.score,800);assert.equal(session?.stage,'complete');
  sequence.returnToWorld();sequence.update(body,true,true,1,25,5000);assert.equal(session?.stage,'world','returning does not immediately reopen the game');
  sequence.update(body,true,true,2,30,6000);assert.equal(session?.stage,'bonus','a new round can enter again');
 }finally{
  sequence.dispose();assert.equal(scene.children.length,0);
  if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');
 }
});
