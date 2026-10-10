import {gameConfig} from '../../config/game-config.js';
// Relative camera input: an inherited desktop cursor position never changes aim.
export function createCameraAim({yawRange=.6,pitchRange=.35,onAim=()=>{},random=Math.random}={}){
 let targetYaw=0,targetPitch=0,currentYaw=0,currentPitch=0,anchor=null;
 const clamp=(v,limit)=>Math.max(-limit,Math.min(limit,v));
 function resetPointer(){anchor=null;}
 function reset({offset=false}={}){
  resetPointer();targetYaw=currentYaw=0;targetPitch=currentPitch=0;
  if(offset){
   targetYaw=currentYaw=(random()<.5?-1:1)*(gameConfig.camera.qrYawOffsetRadians[0]+random()*(gameConfig.camera.qrYawOffsetRadians[1]-gameConfig.camera.qrYawOffsetRadians[0]));
   targetPitch=currentPitch=(random()<.5?-1:1)*(gameConfig.camera.qrPitchOffsetRadians[0]+random()*(gameConfig.camera.qrPitchOffsetRadians[1]-gameConfig.camera.qrPitchOffsetRadians[0]));
   onAim(currentYaw,currentPitch);
  }
 }
 function move(x,y,width,height){
  if(!(width>0&&height>0))return;
  if(!anchor){anchor={x,y};return;}
  const dx=x-anchor.x,dy=y-anchor.y;anchor={x,y};
  // Ignore cursor warps (pointer-lock handoff, resize, or a tab switch).
  if(Math.abs(dx)>width*gameConfig.camera.cursorWarpFraction||Math.abs(dy)>height*gameConfig.camera.cursorWarpFraction)return;
  targetYaw=clamp(targetYaw-dx/width*2*Math.min(yawRange,gameConfig.camera.yawSensitivityCap),yawRange);
  targetPitch=clamp(targetPitch-dy/height*2*Math.min(pitchRange,gameConfig.camera.pitchSensitivityCap),pitchRange);
 }
 function update(dt){
  const blend=1-Math.exp(-gameConfig.camera.aimSmoothing*Math.min(.05,Math.max(0,dt)));
  const nextYaw=currentYaw+(targetYaw-currentYaw)*blend,nextPitch=currentPitch+(targetPitch-currentPitch)*blend;
  onAim(nextYaw-currentYaw,nextPitch-currentPitch);currentYaw=nextYaw;currentPitch=nextPitch;
 }
 return {reset,resetPointer,move,update,state:()=>({yaw:currentYaw,pitch:currentPitch,targetYaw,targetPitch})};
}
