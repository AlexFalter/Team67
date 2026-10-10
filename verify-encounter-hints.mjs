import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');
 await page.evaluate(()=>{__test.finishIntro();__test.setPosition(-113,65.9);const s=__test.bridgeScooter;for(let i=0;i<8000&&s.state().phase!=='parked';i++)s.update(1/60,__test.position,true);});
 await page.waitForFunction(()=>document.querySelector('#bike-status').textContent.includes('SCOOTER TRIO'));assert(await page.locator('#bike-status').isVisible(),'scooter conversation hint is visible');
 await page.keyboard.press('KeyE');await page.waitForFunction(()=>gameState().bridgeScooter.conversation);assert(!await page.evaluate(()=>__test.bridgeScooter.canTalk(__test.position)),'no prompt during conversation');
 await page.evaluate(()=>{__test.bridgeScooter.reset();__test.setPosition(-121,65.2);__test.karambit.give();});if(await page.evaluate(()=>gameState().perspective!=='first-person'))await page.keyboard.press('KeyV');
 await page.waitForSelector('#karambit-hint:not([hidden])');
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{const h=document.querySelector('#karambit-hint').getBoundingClientRect(),m=document.querySelector('.mission').getBoundingClientRect(),i=document.querySelector('#inventory-tray').getBoundingClientRect();return {x:h.x,right:h.right,top:h.top,bottom:h.bottom,missionBottom:m.bottom,inventoryTop:i.top};});
  assert(layout.x>=0&&layout.right<=viewport.width);assert(layout.top>=layout.missionBottom+9);assert(layout.bottom<layout.inventoryTop);await page.screenshot({path:`artifacts/karambit-hint-${viewport.width}.png`});
 }
 await page.setViewportSize({width:1440,height:900});await page.keyboard.press('KeyM');assert(!await page.locator('#karambit-hint').isVisible(),'map hides controls');await page.keyboard.press('Escape');assert(await page.locator('#karambit-hint').isVisible());await page.evaluate(()=>{const p=__test.einstein.actor.position;__test.setPosition(p.x,p.z+1.6);});await page.waitForFunction(()=>document.querySelector('#bike-status').textContent.includes('ALBERT EINSTEIN'));assert(await page.locator('#bike-status').isVisible(),'Einstein hint is visible');assert.deepEqual(errors,[]);
 console.log('PASS: visible scooter hint and E interaction, conversation gating, desktop/mobile knife layout, map visibility, no browser errors.');
}finally{await browser.close();}
