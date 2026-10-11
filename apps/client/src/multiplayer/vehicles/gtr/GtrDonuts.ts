import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GTR_DONUTS,gtrDonutPose,zurichWorld} from '@race/shared';
import type {TrafficRoadSurface} from '../../trafficRoadSurface.ts';
import type {LoopSource} from '../../gameAudio.ts';
export class GtrDonuts {
 readonly ready:Promise<void>;
 readonly root=new THREE.Group();
 private car?:THREE.Group;private wheels:THREE.Object3D[]=[];private abort=new AbortController();
 private smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#d6d6da',transparent:true,opacity:.1,depthWrite:false}),64);
 private marks?:THREE.Mesh;private transform=new THREE.Object3D();private floorY=GTR_DONUTS.center[1];
 private ground(x:number,z:number){return this.surface.height(x,z,GTR_DONUTS.center[1])??zurichWorld.height(x,z)??GTR_DONUTS.center[1];}
 constructor(private scene:THREE.Scene,private surface:Pick<TrafficRoadSurface,'height'>){
  this.root.name='Nissan GT-R doing donuts';this.root.visible=false;scene.add(this.root,this.smoke);this.smoke.visible=false;this.smoke.frustumCulled=false;
  this.ready=this.load();
 }
 private async load(){
  try{const response=await fetch('/models/gtr/gtr.glb',{signal:this.abort.signal});if(!response.ok)throw Error('GT-R model load failed');const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'/models/gtr/');
   if(this.abort.signal.aborted){this.disposeModel(gltf.scene);return;}
   this.car=gltf.scene;this.car.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});this.root.add(this.car);
   for(const name of ['front-left','front-right','rear-left','rear-right']){const wheel=this.car.getObjectByName(name);if(wheel)this.wheels.push(wheel);}
   this.marks=this.skidMarks();this.scene.add(this.marks);
  }catch(error){if(!this.abort.signal.aborted)throw error;}
 }
 private rear(now:number,side:number){const pose=gtrDonutPose(now),c=Math.cos(pose.rotY),s=Math.sin(pose.rotY);return {x:pose.x+c*side*.96+s*1.4,z:pose.z-s*side*.96+c*1.4};}
 private skidMarks(){
  const vertices:number[]=[];const period=GTR_DONUTS.periodSeconds*1000;
  for(const side of [-1,1])for(let i=0;i<160;i++){
   const a=this.rear(i/160*period,side),b=this.rear((i+1)/160*period,side),length=Math.hypot(b.x-a.x,b.z-a.z),dx=-(b.z-a.z)/length*.12,dz=(b.x-a.x)/length*.12;
   const point=(p:{x:number;z:number},sign:number)=>[p.x+dx*sign,this.ground(p.x+dx*sign,p.z+dz*sign)+.02,p.z+dz*sign];
   const al=point(a,-1),ar=point(a,1),bl=point(b,-1),br=point(b,1);vertices.push(...al,...ar,...br,...al,...br,...bl);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const marks=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#17191d',transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}));marks.name='GT-R circular tire marks';marks.visible=false;return marks;
 }
 update(now:number,active:boolean){
  this.root.visible=active&&!!this.car;this.smoke.visible=this.root.visible;if(this.marks)this.marks.visible=this.root.visible;if(!this.root.visible)return;
  const p=gtrDonutPose(now),c=Math.cos(p.rotY),s=Math.sin(p.rotY),sample=(x:number,z:number)=>this.ground(p.x+c*x+s*z,p.z-s*x+c*z);
  this.floorY=sample(0,0);this.root.position.set(p.x,this.floorY,p.z);
  this.root.rotation.set(Math.atan2(sample(0,-1.4)-sample(0,1.4),2.8),p.rotY,Math.atan2(sample(.96,0)-sample(-.96,0),1.92),'YXZ');
  // Rear tires spin under power; front wheels counter-steer into the drift.
  this.wheels.forEach((wheel,i)=>wheel.rotation.set(-(now%10000)/1000*(i<2?24:46),i<2?-.48:0,0,'YXZ'));
  for(let i=0;i<64;i++){
   const side=i%2?1:-1,slot=Math.floor(i/2),age=((now/1000+slot*.095)%3),rear=this.rear(now-age*1000,side);
   const grow=.18+age*.35;this.transform.position.set(rear.x+Math.sin(i*7)*age*.13,this.ground(rear.x,rear.z)+.25+age*.52,rear.z+Math.cos(i*9)*age*.17);this.transform.scale.setScalar(grow*Math.sin(Math.PI*Math.min(1,age/3)));
   this.transform.rotation.set(i*.5,age*.2,i);this.transform.updateMatrix();this.smoke.setMatrixAt(i,this.transform.matrix);
  }this.smoke.instanceMatrix.needsUpdate=true;
 }
 get audioSource():LoopSource|undefined{if(!this.root.visible)return;return {sample:'car-engine',motor:true,active:true,speed:11,x:this.root.position.x,y:this.floorY,z:this.root.position.z,aboard:false,rate:1.35};}
 private disposeModel(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}
 dispose(){this.abort.abort();if(this.car)this.disposeModel(this.car);this.disposeModel(this.smoke);if(this.marks)this.disposeModel(this.marks);this.root.removeFromParent();}
}
