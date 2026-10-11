import {gameConfig} from '../../config/game-config.js';
// Relative camera input: an inherited desktop cursor position never changes aim.
export function createCameraAim({yawRange=.6,pitchRange=.35,onAim=()=>{},random=Math.random}={}){
 let targetYaw=0,targetPitch=0,currentYaw=0,currentPitch=0,anchor=null,edgeYaw=0,edgePitch=0;
 const clamp=(v,limit)=>Math.max(-limit,Math.min(limit,v));
 function resetPointer(){anchor=null;edgeYaw=edgePitch=0;}
 function reset({offset=false}={}){
  resetPointer();targetYaw=currentYaw=0;targetPitch=currentPitch=0;
  if(offset){
   targetYaw=currentYaw=(random()<.5?-1:1)*(gameConfig.camera.qrYawOffsetRadians[0]+random()*(gameConfig.camera.qrYawOffsetRadians[1]-gameConfig.camera.qrYawOffsetRadians[0]));
   targetPitch=currentPitch=(random()<.5?-1:1)*(gameConfig.camera.qrPitchOffsetRadians[0]+random()*(gameConfig.camera.qrPitchOffsetRadians[1]-gameConfig.camera.qrPitchOffsetRadians[0]));
   onAim(currentYaw,currentPitch);
  }
 }
 function move(x,y,width,height,{edgePan=false}={}){
  if(!(width>0&&height>0))return;
  // Pointer-lock release can restore a cursor at any screen edge. Its first
  // position only establishes an anchor; it must never turn the camera.
  if(!anchor){anchor={x,y};edgeYaw=edgePitch=0;return;}
  const dx=x-anchor.x,dy=y-anchor.y;anchor={x,y};
  if(Math.abs(dx)>width*gameConfig.camera.cursorWarpFraction||Math.abs(dy)>height*gameConfig.camera.cursorWarpFraction){edgeYaw=edgePitch=0;return;}
  if(edgePan){
   const edge=(position,size)=>clamp(position<24?1-position/24:position>size-24?-(position-(size-24))/24:0,1);
   // Hold at an edge to keep turning only after deliberately moving into it.
   const xEdge=edge(x,width),yEdge=edge(y,height);
   edgeYaw=dx===0?(xEdge?edgeYaw:0):dx*xEdge<0?xEdge:0;
   edgePitch=dy===0?(yEdge?edgePitch:0):dy*yEdge<0?yEdge:0;
  }else edgeYaw=edgePitch=0;
  targetYaw=clamp(targetYaw-dx/width*2*Math.min(yawRange,gameConfig.camera.yawSensitivityCap),yawRange);
  targetPitch=clamp(targetPitch-dy/height*2*Math.min(pitchRange,gameConfig.camera.pitchSensitivityCap),pitchRange);
 }
 function update(dt){
  const step=Math.min(.05,Math.max(0,dt));
  targetYaw=clamp(targetYaw+edgeYaw*1.2*step,yawRange);
  targetPitch=clamp(targetPitch+edgePitch*.8*step,pitchRange);
  const blend=1-Math.exp(-gameConfig.camera.aimSmoothing*Math.min(.05,Math.max(0,dt)));
  const nextYaw=currentYaw+(targetYaw-currentYaw)*blend,nextPitch=currentPitch+(targetPitch-currentPitch)*blend;
  onAim(nextYaw-currentYaw,nextPitch-currentPitch);currentYaw=nextYaw;currentPitch=nextPitch;
 }
 return {reset,resetPointer,move,update,state:()=>({yaw:currentYaw,pitch:currentPitch,targetYaw,targetPitch})};
}
