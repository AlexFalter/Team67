import * as THREE from 'three';
import {OrientedBox} from 'three-mesh-bvh';

// Route the entire vehicle, then validate the actual curve used for rendering.
// A rejected curve keeps the collision-checked road segments instead.
export function createGroundVehiclePath(world,points,{radius,height=3,halfWidth=1.4,halfLength=3.95}={}){
 const nodes=points.map(([x,z])=>new THREE.Vector3(x,world.height(x,z),z));
 const lengths=[0];for(let i=1;i<nodes.length;i++)lengths.push(lengths.at(-1)+Math.hypot(nodes[i].x-nodes[i-1].x,nodes[i].z-nodes[i-1].z));
 const curve=new THREE.CatmullRomCurve3(nodes,false,'centripetal');curve.arcLengthDivisions=4096;
 let smooth=true;const curveLength=curve.getLength(),wallBlocked=createVehicleWallCheck(world);
 const clear=p=>!world.blocked(p.x,p.z)&&!world.bodyBlocked(p.x,world.height(p.x,p.z),p.z,radius,height)&&[[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>!world.blocked(p.x+dx,p.z+dz));
 let previous=nodes[0].y;
 for(let d=0;d<=curveLength;d+=.25){const p=curve.getPointAt(d/curveLength),y=world.height(p.x,p.z);const a=curve.getPointAt(Math.max(0,d-1)/curveLength),b=curve.getPointAt(Math.min(curveLength,d+1)/curveLength);a.y=world.height(a.x,a.z);b.y=world.height(b.x,b.z);const v=b.sub(a),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(v.y,Math.hypot(v.x,v.z)),Math.atan2(-v.x,-v.z),0,'YXZ'));p.y=y;if(!clear(p)||Math.abs(y-previous)>.55||wallBlocked(p,q,halfWidth,halfLength,height)){smooth=false;break;}previous=y;}
 const length=smooth?curveLength:lengths.at(-1);
 function sample(distance){const d=THREE.MathUtils.clamp(distance,0,length);let p;
  if(smooth)p=curve.getPointAt(d/length);
  else {let i=1;while(i<lengths.length-1&&lengths[i]<d)i++;p=nodes[i-1].clone().lerp(nodes[i],(d-lengths[i-1])/(lengths[i]-lengths[i-1]));}
  p.y=world.height(p.x,p.z);return p;
 }
 function tangent(d){return sample(Math.min(length,d+1)).sub(sample(Math.max(0,d-1))).normalize();}
 function frame(d,reverse=false){const v=tangent(d);if(reverse)v.negate();return {position:sample(d),quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(v.y,Math.hypot(v.x,v.z)),Math.atan2(-v.x,-v.z),0,'YXZ'))};}
 return {length,sample,tangent,frame,smooth,points,wallBlocked};
}

// The imported footprint grid is approximate. Vehicle routes also test the
// original building triangles, including wall slivers between grid samples.
export function withVehicleWalls(world){
 if(!world.collider?.geometry?.boundsTree){if(typeof world.bodyBlocked!=='function')throw Error('Road vehicles require world.bodyBlocked()');return world;}
 const bounds=new THREE.Box3(),normal=new THREE.Vector3();
 return {...world,bodyBlocked(x,y,z,radius=.42,height=1.8){
  if(world.bodyBlocked(x,y,z,radius,height))return true;
  const wallRadius=Math.min(radius,1.5);bounds.min.set(x-wallRadius,y+.3,z-wallRadius);bounds.max.set(x+wallRadius,y+height,z+wallRadius);
  return world.collider.geometry.boundsTree.shapecast({intersectsBounds:b=>b.intersectsBox(bounds),intersectsTriangle:t=>Math.abs(t.getNormal(normal).y)<.65&&bounds.intersectsTriangle(t)});
 }};
}

export function createVehicleWallCheck(world){
 if(typeof world.vehicleWallBlocked==='function')return world.vehicleWallBlocked;
 if(!world.collider?.geometry?.boundsTree)throw Error('Road vehicles require world.vehicleWallBlocked() or a collider BVH');
 const box=new OrientedBox(),normal=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1);
 return (position,quaternion,halfWidth,halfLength,height)=>{
  box.min.set(-halfWidth,.3,-halfLength);box.max.set(halfWidth,height,halfLength);box.matrix.compose(position,quaternion,scale);box.needsUpdate=true;box.update();
  return world.collider.geometry.boundsTree.shapecast({intersectsBounds:b=>box.intersectsBox(b),intersectsTriangle:t=>Math.abs(t.getNormal(normal).y)<.65&&box.intersectsTriangle(t)});
 };
}
