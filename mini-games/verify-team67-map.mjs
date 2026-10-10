import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const manifest=JSON.parse(await readFile('public/maps/zurich/integration.json','utf8'));
const source=await readFile('public/maps/zurich/hb-eth.glb');
const upstream=await readFile('artifacts/team67-upstream/apps/client/public/maps/zurich/hb-eth.glb');
assert(source.equals(upstream),'served map must be the complete unchanged upstream file');
assert.equal(createHash('sha256').update(source).digest('hex'),manifest.sha256);
for(const old of ['public/data','public/textures','public/maps/zurich/runtime'])await assert.rejects(access(old));
const length=source.readUInt32LE(12),gltf=JSON.parse(source.subarray(20,20+length)),bin=source.subarray(28+length);
function fingerprint(bytes){let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);return hash>>>0;}
const expected=gltf.meshes.map(mesh=>{const primitive=mesh.primitives[0],a=gltf.accessors[primitive.attributes.POSITION],v=gltf.bufferViews[a.bufferView],i=gltf.accessors[primitive.indices],iv=gltf.bufferViews[i.bufferView];return {name:mesh.name,count:a.count,positions:fingerprint(bin.subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+(a.byteOffset??0)+a.count*12)),indices:fingerprint(bin.subarray((iv.byteOffset??0)+(i.byteOffset??0),(iv.byteOffset??0)+(i.byteOffset??0)+i.count*(i.componentType===5125?4:2)))};});
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});
 const actual=await page.evaluate(()=>{const w=__test.world;function hash(array){const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return h>>>0;}return {origin:w.data.origin,position:w.root.position.toArray(),scale:w.root.scale.toArray(),passages:w.stationPassages.length,meshes:w.nativeMeshes,runtimeMeshes:[...w.buildings,w.groundMesh].map(m=>({name:m.name,count:m.geometry.attributes.position.count,positions:hash(m.geometry.attributes.position.array),indices:m.geometry.index?hash(m.geometry.index.array):null})),source:w.mapSource};});
 assert.deepEqual(actual.origin,[2683475,1248000,400]);assert.deepEqual(actual.position,[0,0,0]);assert.deepEqual(actual.scale,[1,1,1]);assert.deepEqual(actual.meshes,expected);assert(actual.passages>0,'Polybahn passages restored');assert(actual.runtimeMeshes.every(m=>m.count>0),'adapted station meshes remain valid');assert.equal(actual.source.sha256,manifest.sha256);
 assert(!requests.some(p=>p.startsWith('/data/')||p.startsWith('/textures/')||p.includes('/runtime/')));assert.deepEqual(errors,[]);
 await page.click('#start');await page.keyboard.press('Space');await page.screenshot({path:'artifacts/team67-complete-map.png'});
 console.log(JSON.stringify(actual,null,2));console.log('PASS: complete unchanged GitHub GLB, native geometry verified before narrow station passage cuts, native origin, no old map assets loaded.');
}finally{await browser.close();}
