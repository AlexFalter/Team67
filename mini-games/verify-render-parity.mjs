import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const upstream=await readFile('artifacts/team67-upstream/apps/client/src/scene/MapViewer.tsx','utf8');
for(const statement of ['new Color("#aabecb")','new HemisphereLight("#ffffff", "#7c8792", 2)','new DirectionalLight("#fff7e6", 2.5)','sun.position.set(-300, 700, 500)','renderer.shadowMap.type = PCFShadowMap'])assert(upstream.includes(statement));
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/render-parity',route=>route.fulfill({contentType:'text/html',body:`<style>body{margin:0}</style><script type="module">
 import * as THREE from '/node_modules/three/build/three.module.js';
 import {GLTFLoader} from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
 import {createWorld} from '/geo-world.js';import {addAtmosphere} from '/atmosphere.js';
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,800);document.body.append(renderer.domElement);
 const reference=new THREE.Scene();reference.background=new THREE.Color('#aabecb');
 const original=await new GLTFLoader().loadAsync('/maps/zurich/hb-eth.glb');reference.add(original.scene);
 reference.add(new THREE.HemisphereLight('#ffffff','#7c8792',2));const sun=new THREE.DirectionalLight('#fff7e6',2.5);sun.position.set(-300,700,500);reference.add(sun,sun.target);
 const integrated=new THREE.Scene(),world=await createWorld(integrated),lighting=addAtmosphere(integrated,renderer);
 const camera=new THREE.PerspectiveCamera(45,1200/800,1,6000);camera.position.set(650,850,900);camera.lookAt(0,25,0);
 const gl=renderer.getContext(),pixels=()=>{const out=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;};
 renderer.shadowMap.enabled=false;renderer.render(reference,camera);const before=pixels();window.referenceImage=renderer.domElement.toDataURL();renderer.render(integrated,camera);const after=pixels();let different=0,maxDifference=0;for(let i=0;i<before.length;i++){if(before[i]!==after[i])different++;maxDifference=Math.max(maxDifference,Math.abs(before[i]-after[i]));}
 window.result={different,maxDifference,bytes:before.length,toneMapping:renderer.toneMapping,fog:integrated.fog,background:integrated.background.getHexString()};
 window.integratedImage=renderer.domElement.toDataURL();
 window.streetChecks=[];window.streetImages=[];
 for(const view of [{name:'hb',eye:[-184.7086599081268,15.057357929669713,1.4558347568079792],target:[-239.49423097853656,-20.736243233575536,77.06905660494516]},{name:'central',eye:[3,17,124],target:[40,20,75]},{name:'eth',eye:[170,53,72],target:[130,30,90]}]){
 camera.fov=60;camera.near=.1;camera.updateProjectionMatrix();camera.position.set(...view.eye);camera.lookAt(...view.target);
 renderer.render(reference,camera);const a=pixels(),originalImage=renderer.domElement.toDataURL();renderer.render(integrated,camera);const b=pixels();let differences=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])differences++;
 window.streetChecks.push({name:view.name,differences});window.streetImages.push({name:view.name,original:originalImage,integrated:renderer.domElement.toDataURL()});
 }
 camera.fov=45;camera.near=1;camera.updateProjectionMatrix();camera.position.set(650,850,900);camera.lookAt(0,25,0);renderer.render(integrated,camera);

 </script>`}));
 await page.goto('http://127.0.0.1:5173/render-parity');await page.waitForFunction(()=>window.result,{},{timeout:60000});const result=await page.evaluate(()=>window.result);assert.equal(result.different,0,JSON.stringify(result));assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/github-render-parity.png'});const streets=await page.evaluate(()=>window.streetChecks);for(const check of streets)assert.equal(check.differences,0,check.name);const images=await page.evaluate(()=>window.streetImages);for(const item of images)for(const kind of ['original','integrated'])await (await import('node:fs/promises')).writeFile(`artifacts/github-${item.name}-${kind}.png`,Buffer.from(item[kind].split(',')[1],'base64'));console.log('Street-level comparisons:',streets);
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});
 const gameplay=await page.evaluate(()=>{const t=__test;return {toneMapping:t.renderer.toneMapping,exposure:t.renderer.toneMappingExposure,shadowType:t.renderer.shadowMap.type,autoUpdate:t.renderer.shadowMap.autoUpdate,fov:t.camera.fov,far:t.camera.far,fog:t.scene.fog,receivers:t.world.buildings.every(m=>m.receiveShadow),shadowWidth:t.atmosphere.sun.shadow.camera.right-t.atmosphere.sun.shadow.camera.left};});
 assert.equal(gameplay.toneMapping,0);assert.equal(gameplay.exposure,1);assert.equal(gameplay.shadowType,1);assert(gameplay.autoUpdate);assert.equal(gameplay.fov,60);assert.equal(gameplay.far,6000);assert.equal(gameplay.fog,null);assert(gameplay.receivers);assert.equal(gameplay.shadowWidth,60);assert.deepEqual(errors,[]);
 await page.click('#start');await page.keyboard.press('Space');await page.screenshot({path:'artifacts/github-style-gameplay.png'});
 console.log('PASS: pixel-identical original GitHub map overview and integrated map at the same camera; matching gameplay lighting, tone mapping, camera and focused live shadows.',{result,gameplay});
}finally{await browser.close();}
