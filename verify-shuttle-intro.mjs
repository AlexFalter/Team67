import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test);await page.click('#start');
 const departurePose=await page.evaluate(()=>{
  const intro=__test.shuttleIntro,bus=intro.bus;
  intro.start(13.5);intro.update(0,__test.position,__test.student.player,__test.riderAnimation,__test.camera);
  const samples=[];
  for(let i=0;i<50;i++){
   const previous=bus.position.clone();intro.depart(.1);
   const expected=bus.quaternion.clone();
   intro.update(0,__test.position,__test.student.player,__test.riderAnimation,__test.camera);
   const motion=bus.position.clone().sub(previous);motion.y=0;
   const forward=bus.position.clone().set(0,0,-1).applyQuaternion(bus.quaternion);forward.y=0;
   if(motion.length()>.03&&bus.visible)samples.push({preserved:expected.angleTo(bus.quaternion),alignment:motion.normalize().dot(forward.normalize())});
  }
  intro.start();return samples;
 });assert(departurePose.length>10,'sample moving bus');assert(departurePose.every(s=>s.preserved<1e-6),'intro must preserve departure steering');assert(departurePose.every(s=>s.alignment>.85),'bus travels nose-first');
 assert(await page.evaluate(()=>gameState().intro.interiorModeled&&__test.shuttleIntro.bus.getObjectByName('ETH Link passenger cabin')),'ETH Link has fitted passenger cabin');assert.equal(await page.evaluate(()=>gameState().intro.active),true);assert.equal(await page.evaluate(()=>gameState().intro.phase),'arrival');await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>gameState().intro.thanked),true);await page.screenshot({path:'artifacts/eth-link-thank-driver.png'});
 await page.keyboard.down('KeyW');await page.keyboard.press('KeyE');await page.keyboard.press('KeyM');
 await page.waitForFunction(()=>gameState().intro.time>4.2);assert.equal(await page.evaluate(()=>gameState().elapsed),0);
 await page.screenshot({path:'artifacts/eth-link-opening.png'});await page.keyboard.up('KeyW');
 const riverFinale=await page.evaluate(()=>gameState().intro.riverFinale);
 if(riverFinale){await page.waitForFunction(()=>gameState().intro.explosionAge>=.25,{},{timeout:30000});await page.screenshot({path:'artifacts/eth-link-explosion.png'});}
 await page.waitForFunction(()=>!gameState().intro.active,{},{timeout:30000});
 const result=await page.evaluate(()=>gameState());assert(result.running);assert(!result.riding&&!result.inTram&&!result.inPolybahn);assert(result.penetration<.01);assert(result.intro.departing);assert.equal(result.intro.impactInWater,riverFinale);if(riverFinale)assert(result.intro.explosionAge>=1.6);else assert.equal(result.intro.explosionAge,-1);assert.equal(await page.evaluate(()=>gameState().intro.doorsOpen),false);
 await page.keyboard.press('KeyR');await page.waitForFunction(()=>gameState().intro.active);assert.equal(await page.evaluate(()=>gameState().intro.thanked),false);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>gameState().intro.active),false);assert.equal(await page.evaluate(()=>gameState().onGround),true);
 assert.deepEqual(errors,[]);console.log('PASS: shuttle opening, frozen timer and controls, automatic handoff, safe spawn, arrival ride, thank-driver input, river impact, explosion, replay and skip.');
}finally{await browser.close();}
