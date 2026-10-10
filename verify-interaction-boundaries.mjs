import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');
 const result=await page.evaluate(()=>{
  const t=__test,checks={};
  function fromAbove(point){t.reset();t.finishIntro();t.setPosition(point[0],point[2]);t.position.y+=5;dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'}));}
  let s=gameState();const bike=s.bikeStation.bikes[0];fromAbove([bike.x,0,bike.z]);checks.bike=!gameState().bikeUnlock.active&&!gameState().riding;
  s=gameState();fromAbove([s.scooterPickup.x,0,s.scooterPickup.z]);checks.scooter=!gameState().scooting;
  s=gameState();fromAbove([s.tram.start[0],0,s.tram.start[1]]);checks.tram=!gameState().inTram;
  s=gameState();fromAbove(s.polybahn.ticketPickups[0]);checks.ticket=gameState().polybahn.ticketCount===0;
  s=gameState();fromAbove(s.polybahn.start);checks.polybahn=!gameState().inPolybahn;
  s=gameState();fromAbove(s.interviewLimo.laptop);checks.laptop=gameState().interviewLimo.phase==='idle';
  s=gameState();fromAbove(s.mateMachine.position);checks.mate=!gameState().mateMachine.open;
  s=gameState();fromAbove(s.financeGuy.position);checks.finance=!t.financeGuy.maybeStart(t.position);
  t.reset();t.finishIntro();t.setPosition(bike.x,bike.z);dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'}));checks.normalBike=gameState().bikeUnlock.bikeId===bike.id;t.bikeUnlock.close();
  return checks;
 });
 for(const [name,valid] of Object.entries(result))assert(valid,`${name} interaction must respect its floor`);
 assert.deepEqual(errors,[]);console.log('PASS: real E key rejects bike, scooter, tram, ticket, Polybahn, laptop and Mate from another floor; Finance Guy ignores that floor; normal bike still unlocks.',result);
}finally{await browser.close();}
