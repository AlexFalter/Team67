import * as THREE from 'three';

export function photoPointsInFrame(camera,points,xLimit=.65,yLimit=.55){
 camera.updateMatrixWorld(true);
 return points.every(point=>{const p=point.clone().project(camera);return Math.abs(p.x)<xLimit&&Math.abs(p.y)<yLimit&&p.z>-1&&p.z<1;});
}

export function capturePhoto(camera,capture){camera.updateMatrixWorld(true);return capture();}

// Position and rotate a handheld camera without changing its FOV or framing rules.
// Scratch vectors are reused only during this synchronous calculation.
const direction=new THREE.Vector3(),right=new THREE.Vector3(),lookTarget=new THREE.Vector3();
export function aimPhotoCamera(camera,eye,target,yaw=0,pitch=0){
 camera.position.copy(eye);
 camera.up.set(0,1,0);
 direction.copy(target).sub(eye).normalize().applyAxisAngle(camera.up,yaw);
 right.crossVectors(direction,camera.up).normalize();
 direction.applyAxisAngle(right,pitch);
 camera.lookAt(lookTarget.copy(eye).add(direction));
 camera.updateMatrixWorld(true);
}
