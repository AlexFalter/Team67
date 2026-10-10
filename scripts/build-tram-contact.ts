// Extract real lower-body and side contact samples; regenerate after replacing tram.glb.
import{readFileSync,writeFileSync}from'node:fs';
import{Mesh,Vector3}from'three';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
const bytes=readFileSync('apps/client/public/models/tram.glb');
const{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');scene.updateMatrixWorld(true);const points:Vector3[]=[];
scene.traverse(o=>{if(o instanceof Mesh)for(let i=0;i<o.geometry.attributes.position.count;i++)points.push(new Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld))});
const unique=new Map<string,number[]>();for(const p of points){if(p.y>.8&&Math.abs(p.x)<1.15)continue;const key=p.toArray().map(n=>Math.round(n/.2)).join(',');const old=unique.get(key);if(!old||p.y<old[1])unique.set(key,p.toArray().map(n=>Math.round(n*100000)/100000));}
writeFileSync('packages/shared/src/tram-hull.json',JSON.stringify([...unique.values()])+'\n');console.log(unique.size);
