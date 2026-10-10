import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const edit=JSON.parse(readFileSync(new URL('./assets/audio/finance-guy-edit.json',import.meta.url)));
const expectedDuration=Math.round((edit.segments.reduce((sum,c)=>sum+c.end-c.start,0)+edit.gapSeconds*(edit.segments.length-1))*1000)/1000;
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');await page.keyboard.press('Space');
 console.log('Checking optional finance detour');
 const npc=await page.evaluate(()=>gameState().financeGuy);assert.equal(npc.duration,expectedDuration);const routeSafe=await page.evaluate(()=>{const n=gameState().financeGuy.position,r=__test.world.data.route;return r.slice(1).every((b,i)=>{const a=r[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((n[0]-a[0])*dx+(n[2]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(n[0]-a[0]-t*dx,n[2]-a[1]-t*dz)>=5;});});assert(routeSafe,'NPC is off the ordinary walking route');
 await page.evaluate(p=>{__test.setPosition(p[0],p[2]);__test.updatePlayer(.01);},npc.access);assert.equal(await page.evaluate(()=>gameState().financeGuy.active),false,'ordinary route does not trigger');
 // Walk the inspected access line into the actual proximity trigger.
 await page.evaluate(n=>{const p=__test.position,d=Math.hypot(n[0]-p.x,n[2]-p.z),dx=(n[0]-p.x)/d,dz=(n[2]-p.z)/d;for(let i=0;i<600&&!gameState().financeGuy.active;i++){__test.move(dx*3,dz*3,1/60);__test.updatePlayer(1/60);}},npc.position);
 await page.waitForFunction(()=>gameState().financeGuy.active);await page.waitForFunction(()=>gameState().financeGuy.audioPlayed&&gameState().financeGuy.audioTime>.2,{},{timeout:10000});
 const locked=await page.evaluate(()=>{
  const before=gameState();window.__financeCompleted=new Promise(resolve=>{function check(){if(!gameState().financeGuy.active)resolve(gameState());else requestAnimationFrame(check);}requestAnimationFrame(check);});
  for(const code of ['Space','Escape','Enter','KeyR','KeyM','KeyE','KeyW','ArrowUp']){dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true}));dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,cancelable:true}));}
  __test.reset();__test.interactVehicle();return {before,after:gameState(),mediaDuration:__test.financeGuy.audio.duration,mapVisible:!document.getElementById('route-map').hidden,npcVisible:__test.financeGuy.actor.visible,cinematic:document.body.classList.contains('finance-guy-cutscene')};
 });let s=locked.after;const frozen=locked.before.position,timer=locked.before.elapsed;
 assert.equal(s.financeGuy.count,1);assert(s.penetration<.02);assert(s.financeGuy.active&&locked.cinematic&&locked.npcVisible);assert.equal(s.elapsed,timer);assert.deepEqual(s.position,frozen);assert(!locked.mapVisible);assert(Math.abs(locked.mediaDuration-expectedDuration)<.08,'cutscene duration matches the edited recording');console.log('Checking edited Finance Guy-only audio and compulsory controls');
 await page.waitForFunction(()=>!gameState().financeGuy.active,{},{timeout:25000});s=await page.evaluate(()=>window.__financeCompleted);assert(s.financeGuy.audioEnded);assert(s.financeGuy.age>=expectedDuration);assert(s.elapsed-timer<.5);assert(Math.hypot(s.position.x-frozen.x,s.position.z-frozen.z)<.01);assert(s.penetration<.02);assert.equal(s.financeGuy.count,1);assert(!await page.evaluate(()=>document.body.classList.contains('finance-guy-cutscene')));
 await page.evaluate(()=>{for(let i=0;i<60;i++)__test.updatePlayer(1/60);});assert.equal(await page.evaluate(()=>gameState().financeGuy.active),false,'does not retrigger while standing nearby');
 await page.evaluate(()=>{__test.reset();__test.finishIntro();});assert.equal(await page.evaluate(()=>gameState().financeGuy.used),false);await page.evaluate(p=>{__test.setPosition(p[0],p[2]);__test.updatePlayer(.01);},npc.position);await page.waitForFunction(()=>gameState().financeGuy.audioPlayed&&gameState().financeGuy.audioTime>.1,{},{timeout:10000});assert.equal(await page.evaluate(()=>gameState().financeGuy.count),1);assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: reachable off-route NPC, actual movement trigger, original recorded audio playback, unskippable controls/reset/map, paused timer and player, full audio completion, safe local return, once per run and replay after reset.');
}finally{await browser.close();}
