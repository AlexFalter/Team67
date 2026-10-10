import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.route('**/medal-audio-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5197'}/medal-audio-test`);
 await page.evaluate(async()=>{
  const {createMedalSound}=await import('/src/ui/medals/medal-sound.js');
  const original=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource=function(){
   const source=original.call(this),analyser=this.createAnalyser();analyser.fftSize=2048;
   source.connect(analyser);analyser.connect(this.destination);
   const values=new Float32Array(analyser.fftSize);
   window.medalPeak=0;
   window.medalMeter=setInterval(()=>{analyser.getFloatTimeDomainData(values);for(const value of values)window.medalPeak=Math.max(window.medalPeak,Math.abs(value));},10);
   return source;
  };
  window.medalSound=createMedalSound();
  const button=document.createElement('button');button.id='test-medal-sound';button.textContent='Play medal';button.onclick=()=>window.medalSound.play();document.body.append(button);
 });
 await page.locator('#test-medal-sound').click({force:true});
 await page.waitForFunction(()=>medalSound.state().played===1&&medalPeak>.01);
 const first=await page.evaluate(()=>({sound:medalSound.state(),peak:medalPeak}));
 assert.equal(first.sound.context,'running');assert.equal(first.sound.error,null);
 await page.evaluate(()=>medalSound.stop());assert.equal(await page.evaluate(()=>medalSound.state().activeVoices),0);
 await page.locator('#test-medal-sound').click({force:true});
 await page.waitForFunction(()=>medalSound.state().played===2);
 await page.evaluate(()=>{medalSound.destroy();clearInterval(medalMeter);});
 console.log(`PASS: original recording decoded and played through running Web Audio (output peak ${first.peak.toFixed(3)}), replay and stop work.`);
}finally{await browser.close();}
