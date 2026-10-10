import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {unlockNearbyBike} from './test-bike-unlock.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test);await page.click('#start');await page.keyboard.press('Enter');
 await page.evaluate(()=>{const bike=__test.bikeStation.bikes.find(b=>b.id===1);__test.setPosition(bike.model.position.x,bike.model.position.z);});await page.keyboard.press('KeyE');await unlockNearbyBike(page);assert(await page.evaluate(()=>gameState().riding));
 const crash=await page.evaluate(()=>{const t=__test;let water;for(let z=-120;z<180&&!water;z+=4)for(let x=-350;x<-100&&!water;x+=4)if(t.world.isWater(x,z)&&t.solver.penetration(new t.position.constructor(x,t.world.ground(x,z),z))<.01)water=[x,z];if(!water)throw Error('No open water');t.setPosition(...water);const before=gameState();t.move(0,0,.2);t.bikeExplosion.update(.35);return {before,after:gameState()};});
 assert(crash.after.bikeExplosionAge>=0);assert(!crash.after.riding);assert.equal(crash.after.bikeStation.activeBike,null);const destroyed=crash.after.bikeStation.bikes.find(b=>b.id===1);assert(destroyed.broken&&!destroyed.available&&destroyed.dock===null);assert(crash.after.waterRecovery>0);assert(crash.after.elapsed-crash.before.elapsed>=5);
 await page.screenshot({path:'artifacts/publibike-water-explosion.png'});await page.evaluate(()=>__test.updateWaterRecovery(2.1));assert(await page.evaluate(()=>!__test.world.isWater(__test.position.x,__test.position.z)&&gameState().penetration<.01));
 await page.keyboard.press('KeyR');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>gameState().bikeExplosionAge),-1);assert(!(await page.evaluate(()=>gameState().bikeStation.bikes.find(b=>b.id===1).broken)));
 await page.evaluate(()=>{__test.transport.setCrashProtection(false);__test.setPosition(...gameState().tram.start);});await page.keyboard.press('KeyE');assert(await page.evaluate(()=>gameState().inTram));
 const derail=await page.evaluate(()=>{let peak=0;for(let i=0;i<600&&!gameState().tram.derailed;i++){__test.advanceTram(1/60);peak=Math.max(peak,gameState().tram.speed);}__test.advanceTram(.45);__test.updatePlayer(.01);return {peak,state:gameState()};});assert(derail.peak>30);assert(derail.state.tram.derailed);assert.equal(derail.state.tram.distance,derail.state.tram.firstCorner);
 await page.screenshot({path:'artifacts/tram-first-corner-derailment.png'});
 const landing=await page.evaluate(()=>{for(let i=0;i<180&&gameState().inTram;i++)__test.advanceTram(1/60);return gameState();});assert(!landing.inTram&&landing.penetration<.01);assert(landing.elapsed>=5);assert(!landing.tram.arrived);assert(!await page.evaluate(()=>__test.transport.board(__test.position)));
 await page.keyboard.press('KeyR');await page.keyboard.press('Enter');assert(!await page.evaluate(()=>gameState().tram.derailed));
 assert.deepEqual(errors,[]);console.log('PASS: actual bike unlock → river explosion → destroyed inventory → dry rescue; overspeed → first-corner derailment → safe exit; reset restores both.');
}finally{await browser.close();}
