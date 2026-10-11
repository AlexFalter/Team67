import {VEHICLE_SEATS} from '../../vehicles/passengers/vehicle-seats.js';
import * as THREE from 'three';

// A single timeline owns the two rigs; the carried passenger follows the butler.
export function createButlerEjection(limo,butlerRig,passengerRig,{ground}){
 const butler=butlerRig.player,passenger=passengerRig.player;
 const exit=limo.localToWorld(new THREE.Vector3(1.8,0,-1.6));
 const door=limo.localToWorld(new THREE.Vector3(1.95,0,.8));
 const seat=limo.localToWorld(new THREE.Vector3(...VEHICLE_SEATS.limousine[0].position));
 const start=limo.localToWorld(new THREE.Vector3(.35,0,-1.6));
 const release=new THREE.Vector3(),held=new THREE.Vector3(),carryEnd=new THREE.Vector3();
 const rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 let drop;
 function resetRig(rig){rig.limbs.forEach(o=>o.rotation.set(0,0,0));rig.elbows.forEach(o=>o.rotation.set(0,0,0));rig.knees.forEach(o=>o.rotation.set(0,0,0));}
 function stand(p,target,walk=0,arms=0,yawOverride){
  const world=p.clone();world.y=ground(world.x,world.z);
  butler.position.copy(limo.worldToLocal(world.clone()));
  const yaw=yawOverride??Math.atan2(p.x-target.x,p.z-target.z);rotation.setFromAxisAngle(up,yaw);
  butler.quaternion.copy(limo.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  resetRig(butlerRig);
  butlerRig.limbs[1].rotation.x=Math.sin(walk)*.32;butlerRig.limbs[3].rotation.x=-Math.sin(walk)*.32;
  for(const i of [0,2])butlerRig.limbs[i].rotation.x=arms;
  butlerRig.elbows.forEach(o=>o.rotation.x=arms*.35);
  // Horizontal body across both forearms, slightly in front of the chest.
  held.set(.85,1.08,-.43).applyQuaternion(rotation).add(world);
 }
 function seatedPose(){resetRig(passengerRig);passenger.scale.setScalar(.9);for(const i of [1,3])passengerRig.limbs[i].rotation.x=1.4;passengerRig.knees.forEach(o=>o.rotation.x=-1.4);}
 function heldPose(){passenger.scale.setScalar(1);passenger.position.copy(held);passenger.quaternion.copy(rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2));resetRig(passengerRig);passengerRig.knees.forEach(o=>o.rotation.x=.35);}
 return {
  start(target){
   limo.updateMatrixWorld(true);
   exit.copy(limo.localToWorld(new THREE.Vector3(1.8,0,-1.6)));door.copy(limo.localToWorld(new THREE.Vector3(1.95,0,.8)));
   seat.copy(limo.localToWorld(new THREE.Vector3(...VEHICLE_SEATS.limousine[0].position)));start.copy(limo.localToWorld(new THREE.Vector3(.35,0,-1.6)));
   drop=target.clone();resetRig(butlerRig);resetRig(passengerRig);butler.visible=passenger.visible=true;carryEnd.copy(door).lerp(drop,.48);carryEnd.y=ground(carryEnd.x,carryEnd.z);},
  update(age){
   const smooth=(a,b)=>THREE.MathUtils.smoothstep(age,a,b);
   let stage;
   if(age<1.2){stage='exit';stand(start.clone().lerp(exit,smooth(0,.65)).lerp(door,smooth(.65,1.2)),door);passenger.position.copy(seat);passenger.quaternion.copy(limo.getWorldQuaternion(new THREE.Quaternion()));seatedPose();}
   else if(age<2.2){
    stage='lift';const inward=Math.atan2(door.x-seat.x,door.z-seat.z),outward=Math.atan2(door.x-drop.x,door.z-drop.z),turn=Math.atan2(Math.sin(outward-inward),Math.cos(outward-inward));
    stand(door,seat,0,1.15*smooth(1.2,1.7),inward+turn*smooth(1.75,2.2));
    const outside=limo.localToWorld(new THREE.Vector3(1.95,.1,.8)),tilt=smooth(1.65,1.95),lift=smooth(1.95,2.2);
    heldPose();const carriedRotation=passenger.quaternion.clone();
    // Slide the seated passenger through the door, rotate low, then lift horizontally.
    passenger.position.lerpVectors(seat,outside,smooth(1.2,1.65));passenger.position.lerp(held,lift);
    passenger.quaternion.slerpQuaternions(limo.getWorldQuaternion(new THREE.Quaternion()),carriedRotation,tilt);
    passenger.scale.setScalar(THREE.MathUtils.lerp(.9,1,tilt));
    for(const i of [1,3])passengerRig.limbs[i].rotation.x=1.4*(1-tilt);passengerRig.knees.forEach(o=>o.rotation.x=-1.4*(1-tilt)+.35*tilt);
   }
   else if(age<3.5){stage='carry';stand(door.clone().lerp(carryEnd,smooth(2.2,3.5)),drop,(age-2.2)*9,1.15);heldPose();release.copy(held);}
   else if(age<4.5){stage='throw';stand(carryEnd,drop,0,1.15*(1-smooth(3.5,4.05)));const t=THREE.MathUtils.clamp((age-3.5),0,1);passenger.position.lerpVectors(release,drop,t);passenger.position.y=THREE.MathUtils.lerp(release.y,drop.y+.28,t)+4*1.1*t*(1-t);passenger.rotation.set(.25*Math.sin(t*Math.PI),Math.atan2(carryEnd.x-drop.x,carryEnd.z-drop.z),Math.PI/2+t*Math.PI*2);}
   else {stage=age<5.1?'land':'return';passenger.position.copy(drop);passenger.position.y+=.28;passenger.rotation.set(0,Math.atan2(carryEnd.x-drop.x,carryEnd.z-drop.z),Math.PI/2);stand(carryEnd.clone().lerp(door,smooth(5.1,6.1)).lerp(exit,smooth(6.1,6.8)),door,(age-5.1)*9);}
   if(age>=6.8)butler.visible=false;
   return {stage,done:age>=6.8,doorOpen:smooth(.7,1.2)*(1-smooth(6.1,6.8))};
  },
  reset(){resetRig(butlerRig);resetRig(passengerRig);butler.rotation.set(0,0,0);passenger.rotation.set(0,0,0);passenger.scale.setScalar(1);butler.visible=passenger.visible=false;}
 };
}
