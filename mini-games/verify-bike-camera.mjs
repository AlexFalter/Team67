import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');await page.keyboard.press('Space');
 for(const [index,id] of [3,4].entries()){
  if((await page.evaluate(()=>gameState().perspective))!==(index?'first-person':'third-person'))await page.keyboard.press('KeyV');
  const before=await page.evaluate(id=>{const t=__test,b=t.bikeStation.bikes.find(b=>b.id===id);t.setPosition(b.model.position.x,b.model.position.z);const originalFov=t.camera.fov;t.interactVehicle();return {position:gameState().position,elapsed:gameState().elapsed,originalFov};},id);
  await page.waitForTimeout(400);assert(await page.locator('#bike-unlock .photo-phone').isVisible());
  const rear=await page.evaluate(id=>{const t=__test,b=t.bikeStation.bikes.find(b=>b.id===id),eye=b.model.worldToLocal(t.camera.position.clone());return eye.toArray();},id);assert(Math.abs(rear[0])<.8&&rear[1]>1&&rear[1]<2&&rear[2]>1.65&&rear[2]<4,'camera faces the physical rear QR label');assert(await page.locator('#bike-unlock .phone-camera-live').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4!==3&&v!==p[i%4]);}),'live phone contains the rendered world');await page.screenshot({path:`artifacts/publibike-live-phone-${index}.png`});
  const r=await page.locator('#bike-unlock .tourist-viewfinder').boundingBox(),initial=await page.evaluate(()=>gameState().bikeUnlock);
  assert(Math.abs(initial.yaw)>=.12&&Math.abs(initial.yaw)<=.18,'QR starts a small distance from center');
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.waitForTimeout(100);
  assert(Math.abs((await page.evaluate(()=>gameState().bikeUnlock.yaw))-initial.yaw)<.001,'first inherited cursor position does not flick');
  await page.keyboard.press('Space');await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>gameState().bikeUnlock.progress),0,'Space does not bypass framing');assert.deepEqual(await page.evaluate(()=>gameState().position),before.position);assert.equal(await page.evaluate(()=>gameState().elapsed),before.elapsed);
  assert.equal(await page.evaluate(()=>gameState().bikeUnlock.orientation),'portrait');assert.deepEqual(await page.evaluate(()=>gameState().bikeUnlock.aim),{x:160,y:130},'reticle remains fixed');
  await page.mouse.move(r.x+r.width/2+initial.yaw*r.width/1.6,r.y+r.height/2+initial.pitch*r.height/1.2,{steps:12});
  await page.waitForFunction(()=>gameState().bikeUnlock.stuttered);assert(!await page.evaluate(()=>gameState().riding),'connection stutters before unlocking');
  if(!index){await page.waitForFunction(()=>gameState().bikeUnlock.permanent);await page.keyboard.press('Escape');assert(!await page.evaluate(()=>gameState().bikeUnlock.active));assert.equal(await page.evaluate(()=>__test.camera.fov),before.originalFov);}else await page.waitForFunction(()=>gameState().riding);
 }
 assert.deepEqual(errors,[]);console.log('PASS: both perspectives, real rear-bike QR view, rendered live handset, bounded initial aim, no cursor flick, relative aiming/hold stutter, blocked bypass, paused player/timer, broken-bike rejection and working-bike unlock.');
}finally{await browser.close();}
