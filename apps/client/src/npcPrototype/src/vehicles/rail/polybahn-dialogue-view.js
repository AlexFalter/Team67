import * as THREE from 'three';
import {AISLE_LIMIT} from './polybahn-seated.js';

// Conversations change the view, never the passenger's cabin position.
function cabinEye(car,position){
 car.updateWorldMatrix(true,false);
 const local=car.worldToLocal(position.clone());
 local.x=THREE.MathUtils.clamp(local.x,-AISLE_LIMIT,AISLE_LIMIT);
 local.z=THREE.MathUtils.clamp(local.z,-1.85,1.85);
 // Both seated and standing views fit below the roof and its fittings.
 local.y=THREE.MathUtils.clamp(local.y+1.42,1.55,1.98);
 return local;
}

export function polybahnDialogueView(car, actor, position, faceHeight,anchor){
 const local=anchor?.clone()??cabinEye(car,position);
 return {eye:car.localToWorld(local),
  target:car.localToWorld(new THREE.Vector3(actor.position.x,actor.position.y+faceHeight*actor.scale.y,actor.position.z)),
  up:new THREE.Vector3(0,1,0).transformDirection(car.matrixWorld)};
}

// The passenger chooser also owns the camera: keep it attached while the car moves.
export function polybahnMenuView(car,position,direction,anchor){
 const local=anchor?.clone()??cabinEye(car,position);
 return {eye:car.localToWorld(local.clone()),
  target:car.localToWorld(local.clone().add(direction)),
  up:new THREE.Vector3(0,1,0).transformDirection(car.matrixWorld)};
}

export function capturePolybahnMenuEye(car,camera,position){
 car.updateWorldMatrix(true,false);
 const eye=car.worldToLocal(camera.position.clone());
 // Preserve the current interior view. Exterior views enter at the passenger's feet.
 if(Math.abs(eye.x)>.95||Math.abs(eye.z)>2.05||eye.y<1.4||eye.y>2.05)return cabinEye(car,position);
 eye.x=THREE.MathUtils.clamp(eye.x,-.9,.9);
 eye.z=THREE.MathUtils.clamp(eye.z,-1.85,1.85);
 eye.y=THREE.MathUtils.clamp(eye.y,1.55,1.98);
 return eye;
}
