import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('eth-game-test-settings',JSON.stringify({skipIntro:true,freezeTimer:true,moodleEvents:false})));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,null,{timeout:90000});
 await page.keyboard.press('b');assert.equal(await page.locator('.emote-overlay').isVisible(),false,'cannot emote before start');
 await page.click('#start');await page.evaluate(()=>__test.finishIntro());await page.waitForTimeout(200);
 await page.keyboard.press('v');assert.equal(await page.evaluate(()=>gameState().perspective),'first-person');
 await page.keyboard.press('b');assert(await page.locator('.emote-overlay').isVisible());assert.equal(await page.locator('.emote-slot').count(),6);
 await page.screenshot({path:'artifacts/emote-wheel.png'});
 const start=await page.evaluate(()=>({...gameState().position}));
 for(let i=1;i<=6;i++){
  if(i>1)await page.keyboard.press('b');
  await page.keyboard.press(String(i));await page.waitForTimeout(350);
  const state=await page.evaluate(()=>({s:gameState(),poses:__test.student.limbs.map(l=>l.rotation.toArray().slice(0,3))}));
  assert(state.s.emotes.active);assert.equal(state.s.perspective,'third-person');assert(state.poses.flat().some(n=>Math.abs(n)>.1));
  assert(Math.hypot(state.s.position.x-start.x,state.s.position.z-start.z)<.01,'dance stays in place');
 }
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>gameState().emotes.active),false);assert.equal(await page.evaluate(()=>gameState().perspective),'first-person');
 await page.keyboard.press('b');await page.locator('[data-emote="floss"]').click();await page.waitForTimeout(150);
 await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');assert.equal(await page.evaluate(()=>gameState().emotes.active),false);
 await page.keyboard.press('b');await page.keyboard.press('Escape');assert.equal(await page.locator('.emote-overlay').isVisible(),false);
 await page.keyboard.press('b');await page.keyboard.press('2');await page.evaluate(()=>__test.emotes.reset());assert.equal(await page.evaluate(()=>gameState().emotes.active),false);
 assert.deepEqual(errors,[]);console.log('PASS: wheel, all six poses, first-person restoration, stationary dancing, movement cancellation, click selection, Escape and reset.');
}finally{await browser.close();}
