import * as THREE from 'three';
import {sampleDance,choreography} from './choreography.js';
// Procedural dance poses for the host's student rig; no map or Fortnite assets.
export const emoteDefinitions=[
 {id:'floss',name:'Floss',color:'#55b9ff'},
 {id:'orange-justice',name:'Orange Justice',color:'#c477ff'},
 {id:'take-the-l',name:'Take the L',color:'#55b9ff'},
 {id:'dance-moves',name:'Default Dance',color:'#a2acbd'},
 {id:'dab',name:'Dab',color:'#55b9ff'},
 {id:'robot',name:'The Robot',color:'#c477ff'}
];
// Solve a two-segment limb toward a target, using a pole to choose its bend.
const down=new THREE.Vector3(0,-1,0);
function solveLimb(upper,lower,target,pole,lengthA,lengthB){
 const start=upper.position.clone(),direction=target.clone().sub(start),distance=THREE.MathUtils.clamp(direction.length(),.025,lengthA+lengthB-.003);
 direction.normalize();
 const bend=pole.clone().sub(start);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<.00001)bend.set(0,0,-1);bend.normalize();
 const along=(lengthA*lengthA-lengthB*lengthB+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,lengthA*lengthA-along*along));
 const joint=start.clone().addScaledVector(direction,along).addScaledVector(bend,height),end=start.clone().addScaledVector(direction,distance);
 upper.quaternion.setFromUnitVectors(down,joint.clone().sub(start).normalize());
 const local=end.clone().sub(joint).normalize().applyQuaternion(upper.quaternion.clone().invert());
 lower.quaternion.setFromUnitVectors(down,local);
}
export function createEmoteAnimator({player,limbs,knees,elbows,torso,head,feet=[]}){
 let current=null,time=0,hostVersion=-1;const armPose=[limbs[0],elbows[0],limbs[2],elbows[1]].map(j=>j.quaternion.clone());
 const basePositions=limbs.map(l=>l.position.clone()),torsoBase=torso?.position.clone(),rootBase=new THREE.Vector3(),lastOffset=new THREE.Vector3();
 const clear=()=>{for(const p of [...limbs,...knees,...elbows,...feet])p.rotation.set(0,0,0);limbs.forEach((l,i)=>l.position.copy(basePositions[i]));if(torso){torso.position.copy(torsoBase);torso.rotation.set(0,0,0);}head?.rotation.set(0,0,0);player.rotation.x=player.rotation.z=0;};
 function stop(){if(!current)return;if(hostVersion===(player.userData.poseVersion??0))player.position.sub(lastOffset);lastOffset.set(0,0,0);clear();current=null;time=0;}
 return {start(id){if(!choreography[id])return false;stop();current=id;time=0;[limbs[0],elbows[0],limbs[2],elbows[1]].forEach((j,i)=>armPose[i].copy(j.quaternion));rootBase.copy(player.position);return true;},stop,
  update(dt){if(!current)return;time+=Math.max(0,Math.min(dt,.1));clear();
   // The host resets the normal pose every frame. Anchor dance motion to its floor position.
   if(hostVersion===(player.userData.poseVersion??0))player.position.sub(lastOffset);hostVersion=player.userData.poseVersion??0;rootBase.copy(player.position);const p=sampleDance(current,time),blend=THREE.MathUtils.smoothstep(time,0,.24);
   const hips=new THREE.Vector3(...p.hips);hips.y-=.13;hips.multiplyScalar(blend);lastOffset.copy(hips).applyAxisAngle(new THREE.Vector3(0,1,0),player.rotation.y);player.position.add(lastOffset);
   if(torso){torso.rotation.set(...p.body.map(v=>v*blend));head?.rotation.set(...p.head.map(v=>v*blend));}
   // Move shoulder sockets with the chest while leaving feet independently planted.
   const chest=torso?.quaternion??new THREE.Quaternion();
   for(const i of [0,2])limbs[i].position.copy(basePositions[i]).sub(torsoBase??new THREE.Vector3(0,.9,0)).applyQuaternion(chest).add(torsoBase??new THREE.Vector3(0,.9,0));
   for(let i=0;i<2;i++){
    const arm=limbs[i*2],elbow=elbows[i],rest=new THREE.Vector3(i?.292:-.292,.895,0),hand=new THREE.Vector3(...(i?p.right:p.left));
    hand.lerpVectors(rest,hand,blend);
    solveLimb(arm,elbow,hand,new THREE.Vector3(i?.6:-.6,1.1,-.2),.2,.225);
    // Near a fully raised arm the IK solution can change its roll abruptly.
    // Retain previous arm orientations across the host's walking-pose reset.
    for(const [j,n] of [[arm,i*2],[elbow,i*2+1]]){armPose[n].slerp(j.quaternion,1-Math.exp(-10*dt));j.quaternion.copy(armPose[n]);}
    const leg=limbs[i*2+1],knee=knees[i],restFoot=new THREE.Vector3(i?.135:-.135,0,0),target=new THREE.Vector3(...p.feet[i]);target.y-=.0225;target.sub(hips);target.lerpVectors(restFoot,target,blend);
    solveLimb(leg,knee,target,new THREE.Vector3(i?.17:-.17,.45,-.65),.36,.425);
    // Counter-rotate shoes so a bent knee doesn't drive the toe through the ground.
    if(feet[i])feet[i].quaternion.copy(leg.quaternion).multiply(knee.quaternion).invert();
   }
   player.updateMatrixWorld(true);
  },state:()=>({id:current,time,active:!!current,duration:current?choreography[current].duration:0})};
}
