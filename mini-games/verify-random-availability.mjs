import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {rollFailure} from './src/config/failure-roll.js';
assert.equal(rollFailure(0,()=>0),false);
assert.equal(rollFailure(100,()=>1),true);
assert.equal(rollFailure(50,()=>.49),true);
assert.equal(rollFailure(50,()=>.5),false);
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.goto('http://127.0.0.1:5173/?debug=1');
 await page.waitForFunction(()=>window.__test,{timeout:60000});
 await page.click('#start');await page.keyboard.press('Space');
 await page.evaluate(()=>window.requestAnimationFrame=()=>0);await page.waitForTimeout(100);
 const results=await page.evaluate(()=>{
  const t=__test,original=Math.random,results=[];
  try{
   for(const roll of [0,.25,.5,.75]){
    Math.random=()=>roll;t.mateMachine.reset();t.bikeStation.reset();Math.random=original;
    const before=t.mateMachine.state(),bikes=t.bikeStation.state();
    const p=before.position;t.setPosition(p[0],p[2]-1.5);t.mateMachine.interact(t.position);
    const winner=['Basic','Light','Mint','Ginger'].indexOf(before.workingFlavors[0]);
    const loser=(winner+1)%4;
    function pay(i){document.querySelector(`[data-flavor="${i}"]`).click();const card=document.querySelector('#mate-card');card.value='100';card.onchange();t.mateMachine.update(3);}
    pay(loser);const failure=t.mateMachine.state().phase,disabled=document.querySelector(`[data-flavor="${loser}"]`).disabled;
    t.mateMachine.update(3);pay(winner);const success=t.mateMachine.state().phase;
    results.push({working:before.workingFlavors,bikes:bikes.bikes.map(b=>({working:b.working,golden:b.golden,broken:b.broken})),failure,disabled,success,stable:t.mateMachine.state().workingFlavors});
   }
  }finally{Math.random=original;t.mateMachine.reset();t.bikeStation.reset();}
  return results;
 });
 for(const [i,r] of results.entries()){
  assert.deepEqual(r.working,[['Basic','Light','Mint','Ginger'][i]]);assert.deepEqual(r.stable,r.working);
  assert.equal(r.failure,'failure');assert(r.disabled);assert.equal(r.success,'collect');
  for(const bike of r.bikes){assert.equal(bike.working,i>=2);assert.equal(bike.golden,i>=2);assert.equal(bike.broken,i<2);}
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: exactly one random Mate flavor per run, all four can win, stable outcomes, failed buttons disabled, successful dispensing, randomized bikes and matching gold highlights; 0/50/100% failure boundaries.');
}finally{await browser.close();}
