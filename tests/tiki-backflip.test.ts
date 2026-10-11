import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AnimationMixer,AnimationClip,Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

test('Blender Tiki performer backflips around the hips and lands without moving the speaker',async()=>{
 const buffer=await readFile('apps/client/public/models/tiki-performer/tiki-performer.glb');
 const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const clip=new AnimationClip('flip',Math.max(...gltf.animations.map(c=>c.duration)),gltf.animations.flatMap(c=>c.tracks));
 const mixer=new AnimationMixer(gltf.scene);mixer.clipAction(clip).play();
 const pivot=gltf.scene.getObjectByName('BackflipPivot'),speaker=gltf.scene.getObjectByName('MusicBox');assert(pivot);assert(speaker);
 assert(Math.abs(clip.duration-5)<.05);mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
 const speakerHome=speaker.getWorldPosition(new Vector3()),start=pivot.quaternion.clone();
 let inverted=false,peak=0;
 for(let i=0;i<150;i++){
  mixer.setTime(i/30);gltf.scene.updateMatrixWorld(true);
  const up=new Vector3(0,1,0).applyQuaternion(pivot.quaternion);if(up.y<-.9)inverted=true;
  peak=Math.max(peak,pivot.position.y);assert(speaker.getWorldPosition(new Vector3()).distanceTo(speakerHome)<1e-6);
  assert(new Box3().setFromObject(pivot).min.y>-.06,'performer stays above the ground during the flip');
 }
 assert(inverted,'a full backflip passes upside down');assert(peak>2.4,'backflip jumps before rotating');
 mixer.setTime(2.6);assert(Math.abs(pivot.quaternion.dot(start))>.999);assert(Math.abs(pivot.position.y-.92)<.01);
 mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
});
