import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// One coloured mesh per animation pivot, rather than one draw call per prop.
// Mouths, textures, transparent objects and moving wheels remain separate.
export function batchNpc(root){
 root.updateMatrixWorld(true);
 function visit(parent){
  if(!parent.visible)return;
  const parts=[],sources=[];
  for(const child of [...parent.children]){
   if(!child.isMesh){visit(child);continue;}
   const m=child.material,g=child.geometry;
   const mouth=g.type==='BoxGeometry'&&g.parameters?.height<=.04&&child.position.y>1.45&&child.position.y<1.6;
   if(!child.visible||Array.isArray(m)||m.map||m.transparent||m.emissiveIntensity>0&&m.emissive?.getHex()||mouth||child.children.length)continue;
   const part=(g.index?g.toNonIndexed():g.clone());child.updateMatrix();part.applyMatrix4(child.matrix);
   for(const key of Object.keys(part.attributes))if(!['position','normal'].includes(key))part.deleteAttribute(key);
   part.clearGroups();const colors=new Float32Array(part.attributes.position.count*3);
   for(let i=0;i<colors.length;i+=3){colors[i]=m.color.r;colors[i+1]=m.color.g;colors[i+2]=m.color.b;}
   part.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(part);sources.push(child);
  }
  if(parts.length>1){
   const geometry=mergeGeometries(parts,false);if(geometry){const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:sources.some(source=>source.material.side===THREE.DoubleSide)?THREE.DoubleSide:THREE.FrontSide}));mesh.name='Batched NPC geometry';mesh.castShadow=sources.some(source=>source.castShadow);parent.add(mesh);sources.forEach(source=>source.visible=false);}
  }
  parts.forEach(p=>p.dispose());
 }
 visit(root);
}

// Imported static GLBs have one Blender node per detail. Flatten those nodes
// by material while preserving their authored transforms and emissive surfaces.
export function batchStaticNpc(root){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map();
 root.traverse(mesh=>{
  if(!mesh.isMesh||Array.isArray(mesh.material))return;
  for(let p=mesh;p&&p!==root;p=p.parent)if(!p.visible)return;
  const part=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
  part.clearGroups();let bucket=buckets.get(mesh.material);if(!bucket){bucket={parts:[],sources:[]};buckets.set(mesh.material,bucket);}bucket.parts.push(part);bucket.sources.push(mesh);
 });
 for(const [material,bucket] of buckets){const geometry=mergeGeometries(bucket.parts,false);bucket.parts.forEach(g=>g.dispose());if(!geometry)continue;const mesh=new THREE.Mesh(geometry,material);mesh.name='Batched static NPC model';mesh.castShadow=bucket.sources.some(s=>s.castShadow);mesh.receiveShadow=true;root.add(mesh);bucket.sources.forEach(source=>source.visible=false);}
}

// Retain the prototype's object pivots as animation controls, but draw an entire
// character in one call. Each original part drives one rigid skinning bone.
export function skinNpcRigs(root, controllers){
 const rigs=[];root.traverse(o=>{if(o.userData.npcRig&&!controllers.has(o))rigs.push(o);});
 for(const actor of rigs){
  actor.updateWorldMatrix(true,true);const inverse=actor.matrixWorld.clone().invert(),sources=[],parts=[],bones=[];
  actor.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||Array.isArray(mesh.material)||mesh.material.map||mesh.material.transparent)return;
   for(let p=mesh;p&&p!==actor;p=p.parent)if(!p.visible||p!==mesh&&p.userData.npcRig)return;
   const source=mesh.geometry,geometry=source.index?source.toNonIndexed():source.clone();
   const matrix=inverse.clone().multiply(mesh.matrixWorld);geometry.applyMatrix4(matrix);
   for(const key of Object.keys(geometry.attributes))if(!['position','normal','color'].includes(key))geometry.deleteAttribute(key);
   geometry.clearGroups();const count=geometry.attributes.position.count;
   if(!geometry.attributes.color){const colors=new Float32Array(count*3);for(let i=0;i<count;i++)mesh.material.color.toArray(colors,i*3);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));}
   const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
   for(let i=0;i<count;i++){indices[i*4]=bones.length;weights[i*4]=1;}
   geometry.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
   const bone=new THREE.Bone();bone.matrixAutoUpdate=false;bone.matrix.copy(matrix);actor.add(bone);bones.push(bone);parts.push(geometry);sources.push(mesh);
  });
  if(!parts.length)continue;
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry){bones.forEach(b=>b.removeFromParent());continue;}
  geometry.computeBoundingSphere();
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:sources.some(source=>source.material.side===THREE.DoubleSide)?THREE.DoubleSide:THREE.FrontSide}));mesh.name='Batched NPC rig';mesh.boundingSphere=geometry.boundingSphere.clone();mesh.boundingSphere.radius+=.9;actor.add(mesh);actor.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones);mesh.bind(skeleton);sources.forEach(s=>s.layers.set(31));
  const originalDispose=geometry.dispose.bind(geometry);geometry.dispose=()=>{skeleton.dispose();originalDispose();};
  controllers.set(actor,()=>{actor.updateWorldMatrix(true,true);inverse.copy(actor.matrixWorld).invert();for(let i=0;i<sources.length;i++){bones[i].matrix.copy(inverse).multiply(sources[i].matrixWorld);bones[i].updateMatrixWorld(true);}});
 }
}
