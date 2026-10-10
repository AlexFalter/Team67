import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.routeWebSocket('**',socket=>socket.onMessage(()=>{}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');
 await page.evaluate(()=>{__test.finishIntro();window.requestAnimationFrame=()=>0;__test.setPosition(-121,65.2);__test.setYaw(Math.atan2(-25,-2.4));});await page.waitForTimeout(100);await page.keyboard.press('KeyV');
 async function sprint(){await page.evaluate(()=>{__test.playerSlide.reset();__test.setPosition(-121,65.2);});await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await page.evaluate(()=>{for(let i=0;i<36;i++)__test.updatePlayer(1/60);});assert(await page.evaluate(()=>gameState().moveSpeed>11));}
 await sprint();await page.keyboard.press('KeyC');assert(!await page.evaluate(()=>gameState().slide.active),'empty hands cannot slide');assert.equal(await page.evaluate(()=>gameState().slide.slides),0);
 await page.evaluate(()=>{__test.karambit.give();__test.karambit.holster();});await sprint();await page.keyboard.press('KeyC');assert(!await page.evaluate(()=>gameState().slide.active),'owning a holstered knife is insufficient');
 await page.keyboard.press('Digit3');assert(await page.evaluate(()=>gameState().karambit.equipped));await page.keyboard.press('KeyC');assert(await page.evaluate(()=>gameState().slide.active),'equipped knife permits first-person sprint slide');await page.evaluate(()=>__test.updatePlayer(.1));assert(await page.evaluate(()=>gameState().slide.cameraOffset>.5));
 await page.keyboard.press('Digit3');assert(!await page.evaluate(()=>gameState().slide.active),'holstering immediately cancels slide');await page.evaluate(()=>__test.updatePlayer(.5));assert(await page.evaluate(()=>gameState().slide.cameraOffset<.02));
 await page.keyboard.press('Digit3');await sprint();await page.keyboard.press('KeyV');await page.keyboard.press('KeyC');assert(!await page.evaluate(()=>gameState().slide.active),'third-person remains unable to slide');
 await page.keyboard.press('KeyV');await sprint();await page.keyboard.press('KeyC');assert(await page.evaluate(()=>gameState().slide.active));await page.evaluate(()=>{__test.karambit.holster();__test.updatePlayer(0);});assert(!await page.evaluate(()=>gameState().slide.active),'other equipment changes cancel on player update');
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');assert.deepEqual(errors,[]);console.log('PASS: empty hands, owned/holstered knife and third-person reject sliding; equipped knife permits it; holstering cancels immediately and camera height recovers.');
}finally{await browser.close();}
