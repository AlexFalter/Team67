import assert from 'node:assert/strict';
import {createCameraAim} from './camera-aim.js';
for(const [yawRange,pitchRange] of [[.6,.35],[1.3,1],[Math.PI,1.15]]){
 let yaw=0,pitch=0;
 const aim=createCameraAim({yawRange,pitchRange,onAim:(dx,dy)=>{yaw+=dx;pitch+=dy;},random:()=>.75});
 aim.reset({offset:true});assert(yaw>=.12&&yaw<=.18);assert(pitch>=.035&&pitch<=.065);
 const initial={yaw,pitch};aim.move(12,450,400,600);aim.update(.05);
 assert.deepEqual({yaw,pitch},initial,'first cursor event cannot flick the camera');
 aim.move(32,430,400,600);for(let i=0;i<30;i++)aim.update(.05);
 assert(yaw<initial.yaw&&pitch>initial.pitch,'relative movement smoothly changes aim');
 aim.resetPointer();const before={yaw,pitch};aim.move(350,20,400,600);aim.update(.05);
 assert(Math.abs(yaw-before.yaw)<1e-10&&Math.abs(pitch-before.pitch)<1e-10,'re-entry anchors without jumping');
 aim.move(20,550,400,600);aim.update(.05);
 assert(Math.abs(yaw-before.yaw)<1e-10,'cursor warps are ignored');
 yaw=pitch=0;aim.reset();aim.move(100,100,400,600);aim.update(.05);assert.equal(yaw,0);assert.equal(pitch,0);
}
console.log('PASS: bounded QR offsets, no initial flick, relative movement, re-entry/warp protection, shared photo/scanner ranges.');
