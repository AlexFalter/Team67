import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {gtrDonutPose,GTR_DONUTS,zurichWorld,inWater} from '../packages/shared/src/index.ts';
test('donut loop is periodic, stays on dry clear ground, and leaves spawn clear',()=>{
 const period=GTR_DONUTS.periodSeconds*1000;
 const a=gtrDonutPose(123456),b=gtrDonutPose(123456+period);assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-8);assert(Math.abs(a.rotY-b.rotY)<1e-8);
 for(let i=0;i<96;i++){const p=gtrDonutPose(i/96*period),y=zurichWorld.height(p.x,p.z)!;assert(Number.isFinite(y));assert(!inWater(zurichWorld,p.x,y,p.z));assert(!zurichWorld.blocked(p.x,y+.1,p.z,2.4,1.5));assert(Math.hypot(p.x-zurichWorld.spawn.x,p.z-zurichWorld.spawn.z)>10);assert(Math.abs(Math.hypot(p.x-GTR_DONUTS.center[0],p.z-GTR_DONUTS.center[2])-GTR_DONUTS.radius)<1e-9);}
});
test('Blender GT-R fits a car footprint and its four wheel pivots sit on the road',async()=>{
 const b=await readFile('apps/client/public/models/gtr/gtr.glb'),gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');gltf.scene.updateMatrixWorld(true);const bounds=new Box3().setFromObject(gltf.scene,true),size=bounds.getSize(new Vector3());assert(size.x<2.4&&size.x>1.8);assert(size.z>4.5&&size.z<5);assert(size.y<1.7);assert(bounds.min.y>-.02&&bounds.min.y<.05);
 for(const name of ['front-left','front-right','rear-left','rear-right']){const wheel=gltf.scene.getObjectByName(name);assert(wheel);const p=wheel.getWorldPosition(new Vector3());assert(Math.abs(p.y-.355)<.01);assert(Math.abs(Math.abs(p.z)-1.4)<.01);assert(Math.abs(Math.abs(p.x)-.96)<.01);}
});

test('GT-R renderer follows sloping ground, pauses its engine, and removes owned objects',async()=>{
 const {Scene}=await import('three'),{GtrDonuts}=await import('../apps/client/src/multiplayer/vehicles/gtr/GtrDonuts.ts'),bytes=await readFile('apps/client/public/models/gtr/gtr.glb'),original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(bytes);const scene=new Scene(),surface={height:(x:number,z:number)=>7+x*.025+z*.035};
 try{const feature=new GtrDonuts(scene,surface);await feature.ready;feature.update(1000,true);assert(feature.root.visible);assert(feature.audioSource);feature.root.updateMatrixWorld(true);
  for(const name of ['front-left','front-right','rear-left','rear-right']){const wheel=feature.root.getObjectByName(name)!;const contact=wheel.getWorldPosition(new Vector3());assert(Math.abs(contact.y-.355-surface.height(contact.x,contact.z))<.025);}
  feature.update(2000,false);assert(!feature.root.visible);assert.equal(feature.audioSource,undefined);feature.dispose();assert.equal(scene.children.length,0);
 }finally{globalThis.fetch=original;}
});
