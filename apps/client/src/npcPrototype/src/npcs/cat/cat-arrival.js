import * as THREE from 'three';
export const CAT_PET_SECONDS=2.8;
export const CAT_STAND_SECONDS=3.75;
export const CAT_ARRIVAL_SECONDS=4.55;
/** A small seated settle and two gentle strokes, followed by a smooth stand-up. */
export function catArrivalPose(age){
 const settle=1-THREE.MathUtils.smoothstep(age,0,.65);
 const stroke=THREE.MathUtils.smoothstep(age,.35,CAT_PET_SECONDS);
 return {handT:(1-Math.cos(stroke*Math.PI*4))/2,handLift:.07*(1-THREE.MathUtils.smoothstep(age,0,.4)),eyeLift:.10*settle,standProgress:THREE.MathUtils.smoothstep(age,CAT_PET_SECONDS,CAT_STAND_SECONDS),handoffProgress:THREE.MathUtils.smoothstep(age,CAT_STAND_SECONDS,CAT_ARRIVAL_SECONDS),finished:age>=CAT_ARRIVAL_SECONDS};
}
export function catBenchView(group,camera,{eyeLift=0}={}){
 group.updateWorldMatrix(true,false);const view=camera.clone();view.position.copy(group.localToWorld(new THREE.Vector3(.68,1.38+eyeLift,-.12)));view.up.set(0,1,0);view.lookAt(group.localToWorld(new THREE.Vector3(-.35,.72,0)));
 return {position:view.position.clone(),rotation:view.quaternion.clone()};
}

export function catArrivalView(group,camera){
 group.updateWorldMatrix(true,false);const view=camera.clone();view.position.copy(group.localToWorld(new THREE.Vector3(2.65,2.15,-3.1)));view.up.set(0,1,0);view.lookAt(group.localToWorld(new THREE.Vector3(.05,.9,-.1)));
 return {position:view.position.clone(),rotation:view.quaternion.clone()};
}
/** Bend the two arm segments toward the fur, with the elbow kept in front of the bench. */
function reach(actor,target){
 const joint=actor.getObjectByName('left-arm'),bend=actor.getObjectByName('left-elbow');if(!joint||!bend)return;
 actor.updateWorldMatrix(true,true);const shoulder=joint.getWorldPosition(new THREE.Vector3()),direction=target.clone().sub(shoulder),distance=THREE.MathUtils.clamp(direction.length(),.025,.467);direction.normalize();
 const upper=.24,lower=.228,cos=THREE.MathUtils.clamp((upper*upper+distance*distance-lower*lower)/(2*upper*distance),-1,1),pole=new THREE.Vector3(0,.15,-1).transformDirection(actor.parent.matrixWorld);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
 const elbow=shoulder.clone().addScaledVector(direction,upper*cos).addScaledVector(pole,upper*Math.sqrt(1-cos*cos));
 const down=new THREE.Vector3(0,-1,0),parentInverse=joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert();joint.quaternion.setFromUnitVectors(down,elbow.clone().sub(shoulder).normalize().applyQuaternion(parentInverse));
 joint.updateWorldMatrix(true,true);const jointInverse=joint.getWorldQuaternion(new THREE.Quaternion()).invert();bend.quaternion.setFromUnitVectors(down,target.clone().sub(elbow).normalize().applyQuaternion(jointInverse));
}
export function applyCatArrivalActor(actor,pose,target,standPosition){
 const standing=pose.standProgress,torso=actor.getObjectByName('torso'),chest=actor.getObjectByName('chest'),neck=actor.getObjectByName('neck');
 actor.position.set(.52,-.17+pose.eyeLift*.5,-.015).lerp(standPosition,standing);actor.rotation.set(0,Math.PI,0);
 if(torso){torso.position.x=.1*(1-standing);torso.rotation.set(0,0,0);}
 if(chest){chest.position.x=.13*(1-standing);chest.rotation.set(-.12*(1-standing),0,-.25*(1-standing));}
 if(neck)neck.rotation.set(.22*(1-standing),.35*(1-standing),0);
 for(const side of ['left','right']){
  actor.getObjectByName(`${side}-leg`)?.rotation.set(-Math.PI/2*(1-standing),0,0);
  actor.getObjectByName(`${side}-knee`)?.rotation.set(Math.PI/2*(1-standing),0,0);
  actor.getObjectByName(`${side}-arm`)?.rotation.set(-.3*(1-standing),0,side==='left'?0:-.1);
  actor.getObjectByName(`${side}-elbow`)?.rotation.set(-.5*(1-standing),0,0);
 }
 if(standing<.15)reach(actor,target);
 actor.visible=pose.handoffProgress<.65;
}
