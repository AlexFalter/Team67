import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{if(!window.__freezeBikeTest)cb(t);});});
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});
 await page.evaluate(()=>{document.querySelector('#start').click();__test.finishIntro();window.__freezeBikeTest=true;});await page.waitForTimeout(100);
 // Seed only availability rolls for this ride regression fixture.
 async function seedBikes(){await page.evaluate(()=>{const reset=__test.bikeStation.reset.bind(__test.bikeStation);__test.bikeStation.reset=()=>{const random=Math.random;let i=0;try{Math.random=()=>[.9,.9,0,.9,0,0,.9,0][i++%8];reset();}finally{Math.random=random;}};__test.bikeStation.reset();});}
 await seedBikes();
 const initial=await page.evaluate(()=>gameState());assert(initial.settings.highlightWorkingBikes);assert.equal(initial.bikeStation.available,4);assert.equal(initial.bikeStation.bikes.filter(b=>b.golden).length,4);
 const colors=()=>page.evaluate(()=>__test.bikeStation.bikes.map(b=>{let colors=[];b.model.traverse(m=>{if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])if(mat.name.includes('berry enamel'))colors.push(mat.color.getHexString());});return {id:b.id,colors};}));
 const golden=await colors();assert.equal(golden.filter(b=>b.colors.includes('ffd174')).length,4,'actual model frames are golden');
 async function toggle(value){await page.evaluate(value=>{const input=document.querySelector('[data-setting="highlightWorkingBikes"]');input.checked=value;input.dispatchEvent(new Event('change'));},value);}
 await toggle(false);assert((await colors()).every(b=>!b.colors.includes('ffd174')));assert.equal(await page.evaluate(()=>gameState().bikeStation.available),4);await toggle(true);
 async function open(id){await page.evaluate(id=>{const b=__test.bikeStation.bikes.find(b=>b.id===id);__test.setPosition(b.model.position.x,b.model.position.z);__test.interactVehicle();},id);assert.equal(await page.evaluate(()=>gameState().bikeUnlock.bikeId),id);}
 async function scan(){
  await page.waitForTimeout(400);await page.evaluate(()=>__test.updatePlayer(0));
  const r=await page.locator('#bike-unlock .tourist-viewfinder').boundingBox(),initial=await page.evaluate(()=>gameState().bikeUnlock);
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.waitForTimeout(50);
  await page.mouse.move(r.x+r.width/2+initial.yaw*r.width/1.6,r.y+r.height/2+initial.pitch*r.height/1.2,{steps:12});
  for(let i=0;i<70&&await page.evaluate(()=>gameState().bikeUnlock.active&&!gameState().bikeUnlock.error);i++){await page.waitForTimeout(35);await page.evaluate(()=>{for(let j=0;j<4&&gameState().bikeUnlock.active&&!gameState().bikeUnlock.error;j++)__test.updatePlayer(1/60);});}
 }
 for(let id=1;id<=8;id++){
  await page.evaluate(()=>{__test.reset();__test.finishIntro();});await open(id);await scan();
  const working=[1,2,4,7].includes(id);assert.equal(await page.evaluate(()=>gameState().riding),working,`bike ${id}: ${JSON.stringify(await page.evaluate(()=>({unlock:gameState().bikeUnlock,station:gameState().bikeStation})))}`);
  if(!working){assert(await page.evaluate(()=>gameState().bikeUnlock.permanent));await page.keyboard.press('Escape');}
 }
 await page.evaluate(()=>{__test.reset();__test.finishIntro();});await open(1);await scan();assert(await page.locator('#bike-battery').isVisible());
 await page.evaluate(()=>{for(let i=0;i<450;i++)__test.updatePlayer(1/60);});let remaining=await page.evaluate(()=>gameState().bikeStation.batteryRemaining);assert(Math.abs(remaining-7.5)<.05,String(remaining));assert.equal(await page.locator('#bike-battery [role="progressbar"]').getAttribute('aria-valuenow'),'50');await page.screenshot({path:'artifacts/publibike-battery-half.png'});
 await page.evaluate(()=>{document.querySelector('#open-settings').click();for(let i=0;i<180;i++)__test.updatePlayer(1/60);});assert.equal(await page.evaluate(()=>gameState().bikeStation.batteryRemaining),remaining,'settings pause battery');await page.click('#settings-done');
 await page.keyboard.press('KeyE');await page.evaluate(()=>{for(let i=0;i<90;i++)__test.updatePlayer(1/60);});assert(!await page.locator('#bike-battery').isVisible());await open(1);await scan();assert(Math.abs(await page.evaluate(()=>gameState().bikeStation.batteryRemaining)-remaining)<.001,'remount preserves charge');
 await page.evaluate(()=>{for(let i=0;i<460;i++)__test.updatePlayer(1/60);});assert(!await page.evaluate(()=>gameState().riding));assert.equal(await page.evaluate(()=>gameState().bikeStation.bikes.find(b=>b.id===1).batteryRemaining),0);assert.match(await page.textContent('#bike-status'),/BATTERY EMPTY/);await page.evaluate(()=>{for(let i=0;i<90;i++)__test.updatePlayer(1/60);});await open(1);await scan();assert(await page.evaluate(()=>gameState().bikeUnlock.permanent&&!gameState().riding));await page.keyboard.press('Escape');
 await open(2);await scan();assert.equal(await page.evaluate(()=>gameState().bikeStation.batteryRemaining),15,'replacement has own full battery');
 await page.evaluate(()=>{__test.reset();__test.finishIntro();});assert.equal(await page.evaluate(()=>gameState().bikeStation.available),4);assert.equal((await colors()).filter(b=>b.colors.includes('ffd174')).length,4);assert(!await page.locator('#bike-battery').isVisible());
 await toggle(false);await page.reload();await page.waitForFunction(()=>window.__test,{},{timeout:60000});await seedBikes();assert(!await page.evaluate(()=>gameState().settings.highlightWorkingBikes));assert.equal(await page.evaluate(()=>gameState().bikeStation.available),4);await toggle(true);
 assert.deepEqual(errors,[]);console.log('PASS: deterministic bike availability fixture, actual golden frames, default/persisted setting, all eight QR scans, draining HUD, 15-second cutoff, pause, park/remount without recharge, empty-bike rejection, fresh replacement and reset.');
}finally{await browser.close();}
