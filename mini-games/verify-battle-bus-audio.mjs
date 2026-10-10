import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test);assert(!await page.evaluate(()=>gameState().intro.battleBusPlaying));await page.click('#start');await page.waitForFunction(()=>gameState().intro.battleBusPlayed);await page.waitForTimeout(250);
 const playing=await page.evaluate(()=>({s:gameState().intro,time:__test.shuttleIntro.battleBusAudio.currentTime,duration:__test.shuttleIntro.battleBusAudio.duration}));assert(playing.s.battleBusPlaying&&!playing.s.battleBusFailed);assert(playing.time>0);assert(playing.duration>6.9&&playing.duration<7.2);await page.keyboard.press('Enter');assert(!await page.evaluate(()=>gameState().intro.battleBusPlaying));assert.equal(await page.evaluate(()=>__test.shuttleIntro.battleBusAudio.currentTime),0);
 await page.keyboard.press('KeyR');await page.waitForFunction(()=>gameState().intro.battleBusPlayed);assert(await page.evaluate(()=>gameState().intro.battleBusPlaying));await page.keyboard.press('Space');assert(!await page.evaluate(()=>gameState().intro.battleBusPlaying));assert.deepEqual(errors,[]);console.log('PASS: original audio decodes and plays on user start, seven-second excerpt, skip stops/rewinds, replay restarts without overlap.');
}finally{await browser.close();}
