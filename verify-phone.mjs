import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('game.config.json','utf8')),interval=config.moodle.intervalSeconds[1]+1;
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.route('**/phone-test',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/style.css"><button id="outside">Game</button><script type="module">import {createPhone} from "/phone.js";window.allowed=true;window.phone=createPhone({canOpen:()=>allowed,onOpen:()=>{},onSound:()=>{}});addEventListener("keydown",e=>phone.keydown(e));</script>'}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/phone-test`);await page.waitForFunction(()=>window.phone);
 await page.evaluate(()=>phone.receive({sender:'Luca',text:'I saved you a seat.'}));assert.equal(await page.evaluate(()=>phone.state().unread),1);
 await page.click('#phone-notification');await page.waitForTimeout(400);assert.match(await page.textContent('.phone-bubble'),/saved you a seat/);assert.equal(await page.evaluate(()=>phone.state().unread),0);
 const centered=()=>page.locator('#phone-device').evaluate(e=>{const r=e.getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<2&&Math.abs(r.top+r.height/2-innerHeight/2)<2;});assert(await centered());
 await page.evaluate(()=>phone.receive({sender:'Luca',text:'See you upstairs!'}));assert.equal(await page.locator('.phone-bubble').count(),2);assert.equal(await page.evaluate(()=>phone.state().unread),0);
 await page.evaluate(()=>phone.receive({sender:'Study group',text:'We are in room 12.'}));assert.equal(await page.evaluate(()=>phone.state().unread),1);await page.click('#phone-notification');assert.match(await page.textContent('.phone-bubble'),/room 12/);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert(!await page.evaluate(()=>phone.active()));await page.evaluate(()=>allowed=false);await page.keyboard.press('KeyP');assert(!await page.evaluate(()=>phone.active()));
 await page.evaluate(()=>{allowed=true;phone.reset();phone.update(40,false);});assert.equal(await page.evaluate(()=>phone.state().messages.length),0);
 await page.setViewportSize({width:390,height:844});await page.keyboard.press('KeyP');await page.waitForTimeout(400);assert(await centered());assert(await page.locator('#phone-device').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));await page.keyboard.press('Tab');assert(await page.locator('#phone-device').evaluate(e=>e.contains(document.activeElement)));await page.click('#phone-close');
 for(const passed of [true,false]){
  await page.evaluate(seconds=>phone.update(seconds,true),interval);await page.click('#phone-notification');assert(await page.locator('.moodle-submit').isDisabled());
  const text=await page.locator('.moodle-question').innerText(),question=config.moodle.questions.find(q=>q.question===text),answer=passed?question.correct:(question.correct+1)%question.options.length;
  await page.locator('.moodle-option').nth(answer).click();await page.click('.moodle-submit');assert.match(await page.textContent('.moodle-feedback'),passed?/Correct!/:/Incorrect/);assert(await page.locator('.moodle-submit').isDisabled());await page.click('#phone-close');
 }
 assert.deepEqual(await page.evaluate(()=>phone.state().quizzes.map(q=>q.correct)),[true,false]);
 await page.evaluate(()=>{phone.reset();phone.dispose();});assert.equal(await page.locator('#game-phone').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: incoming messages, clickable notifications, read/thread state, centered desktop/mobile phone, local opening restrictions, focus, current configurable quizzes, reset and disposal.');
}finally{await browser.close();}
