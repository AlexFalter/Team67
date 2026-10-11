import * as THREE from 'three';

// One continuous metre-based path drives rails, both carriages and the passenger view.
export function createPolybahnPath(nodes){
 const curve=new THREE.CatmullRomCurve3(nodes,false,'centripetal');curve.arcLengthDivisions=768;curve.updateArcLengths();const length=curve.getLength(),up=new THREE.Vector3(0,1,0);
 function sample(distance,lane=0){const fraction=THREE.MathUtils.clamp(distance/length,0,1),point=curve.getPointAt(fraction),tangent=curve.getTangentAt(fraction),right=new THREE.Vector3().crossVectors(tangent,up).normalize();
  const phase=THREE.MathUtils.clamp((fraction-.30)/.40,0,1),offset=Math.sin(Math.PI*phase)**2*lane;return point.addScaledVector(right,offset);
 }
 function frame(distance,lane=0){const position=sample(distance,lane),a=sample(Math.max(0,distance-.4),lane),b=sample(Math.min(length,distance+.4),lane),forward=b.sub(a).normalize(),right=new THREE.Vector3().crossVectors(forward,up).normalize(),back=forward.clone().negate(),localUp=new THREE.Vector3().crossVectors(back,right).normalize();const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,localUp,back));return {position,quaternion,forward};}
 return {length,sample,frame};
}
