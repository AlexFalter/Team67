import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});
 const result=await page.evaluate(()=>{const t=__test,w=t.world,g=t.scene.getObjectByName('Visible private-property boundary');let checked=0;for(const mesh of g.children.filter(o=>o.isLineSegments)){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i+=2){const x=a.getX(i),z=a.getZ(i),y=a.getY(i);if(w.isWater(x,z)||w.bodyBlocked(x,w.height(x,z)+.05,z,.25,1.4))throw Error('Marker inside water/building');for(let u=0;u<=1;u+=.25){const px=x+(a.getX(i+1)-x)*u,pz=z+(a.getZ(i+1)-z)*u,py=y+(a.getY(i+1)-y)*u;if(py<w.height(px,pz)-.02)throw Error('Rail below terrain polygon');}checked++;}}return {checked,signs:g.children.filter(o=>o.isSprite).length};});assert(result.checked>100);assert(result.signs>0);assert.deepEqual(errors,[]);console.log('PASS: boundary rails and posts stay above terrain and outside building/water polygons.',result);
}finally{await browser.close();}
