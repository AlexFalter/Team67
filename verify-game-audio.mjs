import {completeTouristPhoto} from './test-tourist-photo.mjs';
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await page.goto('http://127.0.0.1:5173/?debug=1');await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');await page.evaluate(()=>__test.finishIntro());
 await page.waitForFunction(()=>gameState().vehicleAudio.context==='running');assert(await page.evaluate(()=>gameState().settings.vehicleSounds));assert.deepEqual((await page.evaluate(()=>gameState().vehicleAudio.voices.map(v=>v.key))).sort(),['bike','bus','car','polybahn','scooter','tram']);
 await page.waitForFunction(()=>gameState().vehicleAudio.loaded.length===7);
 await page.evaluate(async()=>{const {createVehicleAudio}=await import('/vehicle-audio.js');window.auditAudio=createVehicleAudio();auditAudio.unlock();});
 await page.waitForFunction(()=>auditAudio.state().loaded.length===7);
 const result=await page.evaluate(async()=>{
  const a=auditAudio,p={x:0,z:0},states={bus:{active:true,speed:16,position:p,door:false},tram:{active:true,speed:10,position:p},car:{active:true,speed:12,position:p},polybahn:{active:true,speed:4,position:p}};
  for(let i=0;i<120;i++)a.update(1/60,states,p);
  await new Promise(r=>setTimeout(r,12500));const steady=a.state();
  states.bus.door=true;a.update(.1,states,p);const door=a.state();
  for(let i=0;i<120;i++)a.update(1/60,states,p);const noRepeat=a.state();
  a.update(.1,states,p,{paused:true});const paused=a.state();
  a.update(.1,states,p);a.setEnabled(false);const muted=a.state();
  a.setEnabled(true);a.update(.1,states,p);a.reset();const reset=a.state();
  a.update(.1,states,{x:100,z:100});const distant=a.state();
  states.bus.crashed=true;a.update(.1,states,p);const crashed=a.state();a.reset();
  return {steady,door,noRepeat,paused,muted,reset,distant,crashed};
 });
 assert.deepEqual(result.steady.failures,[]);
 for(const v of result.steady.voices){assert(v.playing);assert.equal(v.starts,1);assert.equal(v.rate,1);assert(v.volume>0);}
 assert.equal(result.door.events,1);assert.equal(result.noRepeat.events,1);
 for(const state of [result.paused,result.muted,result.reset,result.distant])for(const v of state.voices){assert(!v.playing);assert.equal(v.target,0);}
 assert(!result.crashed.voices.find(v=>v.key==='bus').playing);
 await page.click('#open-settings');await page.uncheck('[data-setting="vehicleSounds"]');assert(!await page.evaluate(()=>gameState().vehicleAudio.enabled));await page.check('[data-setting="vehicleSounds"]');await page.click('#settings-done');
 const voice=await page.evaluate(async()=>{const a=new Audio('/audio/tourist-mandarin-greeting.mp3');await new Promise((resolve,reject)=>{a.onloadedmetadata=resolve;a.onerror=reject;});await a.play();const duration=a.duration;a.pause();return duration;});assert(voice>.9&&voice<1.4);
 await page.evaluate(()=>{const t=__test,s=t.touristPhoto.state();t.setPosition(s.meetingPoint[0],s.meetingPoint[2]);t.touristPhoto.start(t.position,t.camera);});await page.waitForFunction(()=>gameState().touristPhoto.requestPlayed&&!gameState().touristPhoto.audioFailed);assert.match(await page.textContent('#tourist-subtitle'),/Tourist:/);await completeTouristPhoto(page);
 await page.evaluate(()=>{__test.reset();__test.finishIntro();const p=__test.polybahn;p.collectTicket(p.ticketPoints[0]);const q=p.state().start;__test.setPosition(q[0],q[2]);__test.interactVehicle();for(let i=0;i<350;i++)__test.advancePolybahn(1/60);__test.updateWorldAudio(.1);});
 await page.waitForFunction(()=>gameState().vehicleAudio.voices.find(v=>v.key==='polybahn').target>0);const motor=await page.evaluate(()=>gameState().vehicleAudio.voices.find(v=>v.key==='polybahn'));assert(motor.playing);assert.equal(motor.sample,'rail-running');assert.equal(motor.rate,1);
 await page.evaluate(()=>{__test.vehicleAudio.reset();});assert.deepEqual(errors,[]);console.log('PASS: recorded audio decode, four vehicle loops, stable playback rate, no duplicate starts/door effects, pause/mute/reset/distance/crash cleanup, settings, tourist voice and Polybahn integration.');
}finally{await browser.close();}
