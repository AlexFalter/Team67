import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Mesh, Quaternion, Euler, Triangle, Vector3, Raycaster } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { accelerateMapRaycasts } from '../apps/client/src/multiplayer/mapRaycast.ts';
import * as C from '../packages/shared/src/index.ts';
const bytes=readFileSync('apps/client/public/maps/zurich/zurich.glb');
const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.updateMatrixWorld(true);const dispose=accelerateMapRaycasts(scene),meshes:Mesh[]=[],ground:Mesh[]=[];
scene.traverse(o=>{if(o instanceof Mesh){meshes.push(o);if(/ground/i.test(o.name+o.parent?.name))ground.push(o);}});
// The opaque cabin begins at y=.60; wheel contact below it is intentional.
const v=C.createVehicle(C.TRAM_KIND),hull=new Box3(new Vector3(-1.23,.60,-3.25),new Vector3(1.23,3.1,3.25)),triangle=new Triangle(),ray=new Raycaster();ray.firstHitOnly=true;
let poses=0,maxFloorError=0;const collisions:{distance:number,part:number,mesh:string,parent?:string,triangle?:number[],materials?:string[]}[]=[];
for(let d=C.TRAM_START_DISTANCE;d<=C.tramPath.length+.5;d+=.5){v.railDistance=Math.min(d,C.tramPath.length);
 for(let part=0;part<3;part++){
  const f=C.railFrame(v,part),pose=new Matrix4().compose(new Vector3(f.x,f.y,f.z),new Quaternion().setFromEuler(new Euler(-f.pitch,f.rotY+Math.PI,0,'YXZ')),new Vector3(1,1,1)),inverse=pose.clone().invert();poses++;
  ray.set(new Vector3(f.x,300,f.z),new Vector3(0,-1,0));const y=ray.intersectObjects(ground)[0]?.point.y;if(y!==undefined)maxFloorError=Math.max(maxFloorError,Math.abs(y-f.y));
  for(const mesh of meshes){
   const localHull=hull.clone().applyMatrix4(pose).applyMatrix4(mesh.matrixWorld.clone().invert()),toCar=inverse.clone().multiply(mesh.matrixWorld);
   const hit=mesh.geometry.boundsTree!.shapecast({intersectsBounds:b=>b.intersectsBox(localHull),intersectsTriangle:t=>{
    triangle.a.copy(t.a).applyMatrix4(toCar);triangle.b.copy(t.b).applyMatrix4(toCar);triangle.c.copy(t.c).applyMatrix4(toCar);return hull.intersectsTriangle(triangle);
   }});
   if(hit){if(collisions.length<30)collisions.push({distance:d,part,mesh:mesh.name,parent:mesh.parent?.name,triangle:triangle.getMidpoint(new Vector3()).applyMatrix4(pose).toArray(),materials:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.name)});break;}
  }
 }
}
dispose();console.log(JSON.stringify({poses,maxFloorError,collisions},null,2));if(collisions.length)process.exitCode=1;
