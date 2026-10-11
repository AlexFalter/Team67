import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Vector3,Box3} from 'three';
for(const name of ['longhorn','cow']){
 const b=fs.readFileSync(new URL(`./${name}.glb`,import.meta.url));
 const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const meshes=[];g.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
 const mix=new AnimationMixer(g.scene),report=[];
 for(const clip of g.animations){
  mix.stopAllAction();mix.clipAction(clip).play();const box=new Box3();
  for(let i=0;i<=36;i++){
   mix.setTime(clip.duration*i/36);g.scene.updateMatrixWorld(true);
   for(const m of meshes){
    m.skeleton.update();
    for(let j=0;j<m.geometry.attributes.position.count;j++){
     const p=m.getVertexPosition(j,new Vector3()).applyMatrix4(m.matrixWorld);
     if(!p.toArray().every(Number.isFinite))throw Error('Invalid deformation');box.expandByPoint(p);
    }
   }
  }
  if(box.min.y<-.05)throw Error(`${name}/${clip.name}: ground penetration ${box.min.y}`);
  report.push({clip:clip.name,duration:clip.duration,minY:box.min.y});
 }
 console.log(JSON.stringify({name,skins:meshes.length,report}));
}
