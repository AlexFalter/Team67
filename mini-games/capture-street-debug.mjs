import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Real graphics modules and surveyed geometry, without HUD or route hints.
// This supplements gameplay captures; it does not replace gameplay/physics tests.
const base=process.env.GAME_URL??'http://127.0.0.1:5173';
const output='artifacts/street-debug-red';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/gauntlet-review',route=>route.fulfill({contentType:'text/html',body:`
 <style>body{margin:0;background:#101b22}</style><script type="module">
 import * as THREE from '/node_modules/.vite/deps/three.js';
 import {createWorld,capsuleSolver} from '/geo-world.js';
 import {styleCity} from '/city-style.js';
 import {addAtmosphere} from '/atmosphere.js';
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(62,1440/900,.15,1800);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1440,900);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.shadowMap.autoUpdate=false;renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
 addAtmosphere(scene,renderer);const world=await createWorld(scene);
 const positionSnapshots=[world.buildings[1],world.groundMesh,world.collider].map(m=>m.geometry.attributes.position.array.slice());
 styleCity(scene,world,{showRoute:false});
 window.surfaceIntegrity=[world.buildings[1],world.groundMesh,world.collider].map((m,j)=>positionSnapshots[j].length===m.geometry.attributes.position.array.length&&positionSnapshots[j].every((v,i)=>v===m.geometry.attributes.position.array[i]));
 world.buildings.forEach(m=>m.castShadow=true);world.groundMesh.receiveShadow=true;
 const identities=await fetch('/data/building-identities.json').then(r=>r.json()),solver=capsuleSolver(world.collider);
 const streets=world.data.streets.filter(s=>!s.bridge);
 window.landmarkView=(egid,context)=>{
  const body=identities.buildings.find(b=>b.egid===egid);if(!body)throw Error('Landmark missing: '+egid);
  const target=new THREE.Vector3(body.center[0],body.min[1]+Math.min(12,body.height*.4),body.center[2]);
  if(egid===3169989){
   const g=world.buildings[1].geometry,bounds=new THREE.Box3();
   for(let i=0;i<g.attributes.position.count;i++)if(Math.floor(g.attributes.facadeCoordinates.getZ(i)+.001)===3)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(g.attributes.position,i));
   if(bounds.isEmpty())throw Error('ETH central photo pavilion missing');bounds.getCenter(target);
  }
  // Pick a real street location with clear capsule space, rather than putting a camera inside a building.
  const desired=context?55:24;let best=null;
  for(const s of streets)for(let i=1;i<s.points.length;i++){
   const a=s.points[i-1],b=s.points[i],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3);
   for(let j=0;j<=count;j++){
    const t=j/Math.max(1,count),x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);
    if(world.blocked(x,z)||world.isWater(x,z))continue;
    const floor=world.height(x,z),p=new THREE.Vector3(x,floor,z);if(solver.penetration(p)>.01)continue;
    const d=Math.hypot(x-target.x,z-target.z);if(d<12||d>95)continue;
    const westPenalty=(egid===3169989||egid===140004)&&x>body.min[0]-3?100:0;
    const score=Math.abs(d-desired)+westPenalty;if(!best||score<best.score)best={p,score};
   }
  }
  if(!best)throw Error('No clear street view for '+egid);
  camera.position.copy(best.p).add(new THREE.Vector3(0,context?5:2.4,0));camera.lookAt(target);
  renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
  return {egid,landmark:body.landmark,eye:camera.position.toArray(),target:target.toArray(),profile:body.profile};
 };
 window.streetReview=()=>{world.groundMesh.material=new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide});camera.position.set(-259.13,14.28,-49.53);camera.lookAt(-266.64,8.8,-38.98);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);};
 window.captureReady=false;
 const wait=()=>{if(!world.buildings[1].material.userData.photoTexturesReady){requestAnimationFrame(wait);return;}
  window.captureReady=true;};wait();
 </script>`}));
 await page.goto(base+'/gauntlet-review');
 await page.waitForFunction(()=>window.captureReady,{},{timeout:60000});
 const integrity=await page.evaluate(()=>window.surfaceIntegrity);
 assert.deepEqual(integrity,[true,true,true],'facade styling must preserve wall, terrain and collision position buffers');
 await page.evaluate(()=>streetReview());await page.screenshot({path:output+'/spawn.png'});
 const captures=[];
 for(const [name,egid] of [['central-plaza',140539],['polybahn',140004],['lee',302034660],['eth',3169989]]){
  for(const context of [false,true]){
   const metadata=await page.evaluate(({egid,context})=>landmarkView(egid,context),{egid,context});
   const file=name+(context?'-context':'-street')+'.png';
   await page.screenshot({path:output+'/'+file});captures.push({file,...metadata});
  }
 }
 assert.deepEqual(errors,[],'runtime/shader errors');
 await fs.writeFile(output+'/landmark-captures.json',JSON.stringify({base,capturedAt:new Date().toISOString(),positionBuffersUnchanged:{walls:integrity[0],terrain:integrity[1],collisions:integrity[2]},scope:'Actual graphics modules, surveyed scene, no HUD or painted route; excludes gameplay props and station passage setup.',captures},null,2));
 console.log('Eight actual landmark scene captures saved; no browser/shader errors.');
}finally{await browser.close();}
