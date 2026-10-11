import * as THREE from 'three';
import {sampleDance,choreography} from '../../npcPrototype/src/player/emotes/choreography.js';
interface Limb {joint:THREE.Group;bend:THREE.Group;tip:THREE.Group;toe?:THREE.Group}
interface DanceRig {torso:THREE.Group;chest:THREE.Group;head:THREE.Group;neck:THREE.Group;arms:Limb[];legs:Limb[]}
const down=new THREE.Vector3(0,-1,0);
function solve(limb:Limb,target:THREE.Vector3,pole:THREE.Vector3){
 const start=limb.joint.position.clone(),a=-limb.bend.position.y,b=-limb.tip.position.y;
 const direction=target.clone().sub(start),distance=THREE.MathUtils.clamp(direction.length(),.02,a+b-.001);direction.normalize();
 const bend=pole.clone().sub(start);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<.00001)bend.set(0,0,-1);bend.normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 const joint=start.clone().addScaledVector(direction,along).addScaledVector(bend,height),end=start.clone().addScaledVector(direction,distance);
 limb.joint.quaternion.setFromUnitVectors(down,joint.clone().sub(start).normalize());
 limb.bend.quaternion.setFromUnitVectors(down,end.sub(joint).normalize().applyQuaternion(limb.joint.quaternion.clone().invert()));
 limb.tip.quaternion.copy(limb.joint.quaternion).multiply(limb.bend.quaternion).invert();limb.toe?.rotation.set(0,0,0);
}
// Runs after the normal pose; joint lengths come from the current multiplayer avatar.
export function applyDancePose(r: DanceRig,id:string,time:number){
 if(!choreography[id]||!Number.isFinite(time))return;
 const p=sampleDance(id,Math.max(0,time)),blend=THREE.MathUtils.smoothstep(time,0,.25);
 r.torso.position.set(p.hips[0]*blend,.75+p.hips[1]*blend,p.hips[2]*blend);r.torso.rotation.set(0,0,0);
 r.chest.rotation.set(p.body[0]*blend,p.body[1]*blend,p.body[2]*blend);r.neck.rotation.set(0,0,0);r.head.rotation.set(...p.head.map(v=>v*blend) as [number,number,number]);
 for(let i=0;i<2;i++){
  const side=i?-1:1,arm=r.arms[i],leg=r.legs[i],hand=new THREE.Vector3(...(i?p.left:p.right) as [number,number,number]);
  hand.sub(r.torso.position).applyQuaternion(r.chest.quaternion.clone().invert());
  hand.lerp(new THREE.Vector3(side*.3,.05,0),1-blend);solve(arm,hand,new THREE.Vector3(side*.6,.35,-.25));
  const foot=new THREE.Vector3(...p.feet[i?0:1] as [number,number,number]);foot.y+=.065;foot.sub(r.torso.position);foot.lerp(new THREE.Vector3(side*.13,-.645,0),1-blend);solve(leg,foot,new THREE.Vector3(side*.17,-.3,-.65));
 }
}
