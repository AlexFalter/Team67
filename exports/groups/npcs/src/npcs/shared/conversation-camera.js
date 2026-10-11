import * as THREE from 'three';
// Front-facing NPC composition with room below for compact response choices.
export function createNPCConversationCamera(camera,{actor,approach}){
 let saved=null;
 const direction=approach.clone().sub(actor.position);direction.y=0;direction.normalize();
 function update(){if(!camera||!saved)return;camera.position.copy(actor.position).addScaledVector(direction,3.3);camera.position.y=actor.position.y+1.65;camera.up.set(0,1,0);camera.fov=48;camera.updateProjectionMatrix();camera.lookAt(actor.position.x,actor.position.y+1.25,actor.position.z);camera.updateMatrixWorld(true);}
 return {begin(){if(!camera||saved)return;saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),fov:camera.fov};update();},update,end(){if(!saved)return;camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.up.copy(saved.up);camera.fov=saved.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);saved=null;}};
}
