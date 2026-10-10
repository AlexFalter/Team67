import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{if(!window.freezeKnockdown)cb(t);});});
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test);await page.click('#start');await page.keyboard.press('Enter');
 const result=await page.evaluate(()=>{
  window.freezeKnockdown=true;const t=__test,bags=t.erstiBags,passengers=t.shuttleIntro.passengers;
  const home=bags.state().bags[0].home;t.setPosition(home[0],home[2]);bags.update(.01,t.position,true,true);
  if(!bags.pickup(t.position))throw Error('Pickup failed');bags.update(.7,t.position,true,true);
  const npc=passengers[0];npc.rig.player.visible=true;npc.rig.player.position.copy(t.position).add(new t.position.constructor(0,.1,-2));
  t.camera.position.copy(t.position).add(new t.position.constructor(0,1.5,0));t.camera.lookAt(npc.rig.player.position.clone().add(new t.position.constructor(0,.9,0)));t.camera.updateMatrixWorld(true);
  if(!bags.throwBag())throw Error('Throw failed');const phases=[];
  for(let i=0;i<150;i++){bags.update(1/60,t.position,true,true);npc.knockdown.update(1/60);phases.push(npc.knockdown.state().phase);}
  const airborne=phases.includes('flying'),down=phases.includes('down'),recovering=phases.includes('getting-up');
  for(let i=0;i<120;i++)npc.knockdown.update(1/60);
  const state=npc.knockdown.state();const standingRotation=npc.rig.player.rotation.x;
  const again=t.shuttleIntro.hitPassengers(npc.rig.player.position.clone().add(new t.position.constructor(0,1,1)),npc.rig.player.position.clone().add(new t.position.constructor(0,1,-1)),new t.position.constructor(0,0,-10));
  t.shuttleIntro.start();return {airborne,down,recovering,state,standingRotation,again,reset:passengers.map(p=>p.knockdown.state())};
 });assert(result.airborne&&result.down&&result.recovering,'actual thrown bag triggers full recovery animation');assert.equal(result.state.phase,'standing');assert.equal(result.state.hits,1);assert.equal(result.standingRotation,0);assert(result.again,'can hit again after recovery');assert(result.reset.every(s=>s.hits===0&&s.phase==='standing'));assert.deepEqual(errors,[]);console.log('PASS: pickup/throw hits passenger, flight/landing/get-up, repeat hit and reset.');
}finally{await browser.close();}
