import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The shared camera controller is JavaScript.
import {createCameraAim} from '../apps/client/src/npcPrototype/src/shared/phone-camera/camera-aim.js';
const width=1440,height=900;
test('inherited cursor positions at screen edges cannot start camera turning',()=>{
 for(const [x,y] of [[0,0],[1440,900],[720,0],[0,450],[1439,1]]){
  const aim=createCameraAim({yawRange:Math.PI,pitchRange:1.15,random:()=>.5});aim.reset({offset:true});const initial=aim.state();aim.move(x,y,width,height,{edgePan:true});for(let i=0;i<60;i++)aim.update(1/60);assert.deepEqual(aim.state(),initial);
 }
});
test('deliberate movement towards an edge keeps turning; moving away stops it',()=>{
 const aim=createCameraAim({yawRange:Math.PI,pitchRange:1.15});aim.move(100,100,width,height,{edgePan:true});aim.move(0,100,width,height,{edgePan:true});const start=aim.state().targetYaw;aim.update(.05);assert.ok(aim.state().targetYaw>start);aim.move(20,100,width,height,{edgePan:true});const end=aim.state().targetYaw;aim.update(.05);assert.equal(aim.state().targetYaw,end);
});
test('cursor warps, resets and touch input stop continuous edge turning',()=>{
 const aim=createCameraAim({yawRange:Math.PI,pitchRange:1.15});aim.move(100,100,width,height,{edgePan:true});aim.move(0,0,width,height,{edgePan:true});aim.move(1400,880,width,height,{edgePan:true});const afterWarp=aim.state();aim.update(.05);assert.equal(aim.state().targetYaw,afterWarp.targetYaw);assert.equal(aim.state().targetPitch,afterWarp.targetPitch);aim.resetPointer();aim.move(0,0,width,height,{edgePan:true});const afterReset=aim.state();aim.update(.05);assert.equal(aim.state().targetYaw,afterReset.targetYaw);aim.move(10,10,width,height,{edgePan:false});const afterTouch=aim.state();aim.update(.05);assert.equal(aim.state().targetYaw,afterTouch.targetYaw);
});
test('edge holding can reach the full aiming range from any cursor start',()=>{
 for(const start of [1,720,1439]){
  const aim=createCameraAim({yawRange:Math.PI,pitchRange:1.15});
  aim.move(start,450,width,height,{edgePan:true});
  // Walk to the edge without triggering the cursor-warp guard.
  for(let x=start-10;x>0;x-=10)aim.move(x,450,width,height,{edgePan:true});
  aim.move(0,450,width,height,{edgePan:true});
  for(let i=0;i<100;i++)aim.update(.05);
  assert.equal(aim.state().targetYaw,Math.PI);
  aim.resetPointer();
  const stopped=aim.state().targetYaw;aim.update(.05);assert.equal(aim.state().targetYaw,stopped);
 }
});
