import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{if(!window.freezeBridgeTest)cb(t);});});
 await page.goto('http://127.0.0.1:5173/?debug=1');await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.evaluate(()=>{document.querySelector('#start').click();__test.finishIntro();window.freezeBridgeTest=true;});await page.waitForTimeout(100);
 for(const kind of ['bike','scooter'])for(const direction of [1,-1]){
  await page.evaluate(({kind,direction})=>{__test.reset();__test.finishIntro();if(kind==='bike'){const b=__test.bikeStation.bikes[0];__test.setPosition(b.model.position.x,b.model.position.z);__test.interactVehicle();}else{const p=gameState().scooterPickup;__test.setPosition(p.x,p.z);__test.interactVehicle();}}, {kind,direction});
  if(kind==='bike'){const target=await page.evaluate(()=>gameState().bikeUnlock.target),bounds=await page.locator('#unlock-view').boundingBox();await page.mouse.move(bounds.x+target.x/320*bounds.width,bounds.y+target.y/260*bounds.height);await page.evaluate(()=>{for(let i=0;i<200&&gameState().bikeUnlock.active;i++)__test.updatePlayer(1/60);});}
  assert(await page.evaluate(kind=>kind==='bike'?gameState().riding:gameState().scooting,kind));
  await page.evaluate(direction=>{__test.setPosition(direction>0?-145:-40,71);__test.setYaw(direction>0?-Math.PI/2:Math.PI/2);},direction);
  // Remount fixes the vehicle heading at the desired direction.
  await page.keyboard.press('KeyE');
  if(kind==='scooter'){await page.evaluate(()=>{for(let i=0;i<90;i++)__test.updatePlayer(1/60);});await page.click('#scooter-center');await page.click('#scooter-shutter');await page.click('#scooter-submit');}
  else await page.evaluate(()=>{for(let i=0;i<90;i++)__test.updatePlayer(1/60);});
  await page.evaluate(direction=>__test.setYaw(direction>0?-Math.PI/2:Math.PI/2),direction);await page.keyboard.press('KeyE');if(kind==='bike'){const target=await page.evaluate(()=>gameState().bikeUnlock.target),bounds=await page.locator('#unlock-view').boundingBox();await page.mouse.move(bounds.x+target.x/320*bounds.width,bounds.y+target.y/260*bounds.height);await page.evaluate(()=>{for(let i=0;i<200&&gameState().bikeUnlock.active;i++)__test.updatePlayer(1/60);});}
  await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');const result=await page.evaluate(({direction})=>{let frames=0;for(;frames<850;frames++){__test.updatePlayer(1/60);if(direction>0?__test.position.x>=-40:__test.position.x<=-145)break;}return {frames,state:gameState()};},{direction});await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');assert(result.frames<850,JSON.stringify({kind,direction,position:result.state.position,heading:result.state.vehicleHeading,scooting:result.state.scooting,photo:result.state.scooterPhoto,animation:result.state.animation}));assert.equal(result.state.waterFalls,0);assert(result.state.penetration<.01);assert(kind==='bike'?result.state.riding:result.state.scooting);
 }
 assert.deepEqual(errors,[]);console.log('PASS: actual bike and scooter controls cross bridge both ways with boost, no water falls or collisions.');
}finally{await browser.close();}
