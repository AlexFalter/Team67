import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{if(!window.freezeTiki)cb(t);});});
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);
 await page.waitForFunction(()=>window.__test,{},{timeout:90000});
 await page.click('#start');await page.evaluate(()=>{__test.finishIntro();window.freezeTiki=true;});await page.waitForTimeout(100);
 const result=await page.evaluate(()=>{
  const t=__test,m=t.tikiPerformer;m.reset();
  const arm=m.group.getObjectByName('LeftArm'),speaker=m.group.getObjectByName('MusicBox');
  const before=arm.quaternion.clone(),speakerBefore=speaker.getWorldPosition(t.position.clone());
  for(let i=0;i<8;i++)m.update(.1,m.center,{active:true});
  const p=m.group.position;
  return {armMoves:arm.quaternion.angleTo(before)>.02,speakerStable:speaker.getWorldPosition(t.position.clone()).distanceTo(speakerBefore)<.001,ground:Math.abs(p.y-t.world.height(p.x,p.z))<.001,clear:!t.world.blocked(p.x,p.z)&&!t.world.isWater(p.x,p.z)&&t.solver.penetration(p.clone())<.01,marker:t.encounterMarkers().some(a=>a.id==='tiki-performer'),state:m.state()};
 });
 assert(result.armMoves);assert(result.speakerStable);assert(result.ground&&result.clear);assert(result.marker);assert.equal(result.state.source,'Blender');assert(result.state.hasMusicBox);
 await page.waitForFunction(()=>__test.tikiPerformer.state().plays===1&&!__test.tikiPerformer.state().failed);
 const decoded=await page.evaluate(async()=>{const ctx=new AudioContext(),b=await fetch(__test.tikiPerformer.audio.src).then(r=>r.arrayBuffer()),a=await ctx.decodeAudioData(b),data=a.getChannelData(0);let e=0;for(const n of data)e+=n*n;await ctx.close();return {duration:a.duration,rms:Math.sqrt(e/data.length)};});
 assert(decoded.duration>329&&decoded.duration<331);assert(decoded.rms>.01);
 await page.evaluate(()=>{const t=__test,m=t.tikiPerformer;m.update(.1,m.center,{active:true});t.camera.position.copy(m.center).add(new t.position.constructor(-2.5,1.7,3.5));t.camera.lookAt(m.center.x+.25,m.center.y+1,m.center.z);t.camera.fov=45;t.camera.updateProjectionMatrix();t.renderer.render(t.scene,t.camera);});
 await page.screenshot({path:'artifacts/tiki-performer-npc.png'});
 await page.waitForTimeout(3000);assert(await page.evaluate(()=>!__test.tikiPerformer.audio.paused&&__test.tikiPerformer.audio.currentTime>3&&__test.tikiPerformer.state().plays===1),'full song continues beyond the old excerpt');
 await page.evaluate(()=>{const m=__test.tikiPerformer;for(let i=0;i<32;i++)m.update(.1,m.center.clone().addScalar(100),{active:true});});
 assert(await page.evaluate(()=>__test.tikiPerformer.audio.paused&&__test.tikiPerformer.audio.volume<.005));
 await page.evaluate(()=>{const m=__test.tikiPerformer;m.update(.1,m.center,{active:true,muted:true});});assert.equal(await page.evaluate(()=>__test.tikiPerformer.audio.volume),0);
 const age=await page.evaluate(()=>__test.tikiPerformer.state().age);await page.evaluate(()=>__test.tikiPerformer.update(.1,__test.position,{active:false}));assert.equal(await page.evaluate(()=>__test.tikiPerformer.state().age),age);
 await page.evaluate(()=>__test.tikiPerformer.reset());assert.equal(await page.evaluate(()=>__test.tikiPerformer.state().age),0);
 await page.evaluate(()=>{__test.tikiPerformer.dispose();__test.tikiPerformer.dispose();});assert(await page.evaluate(()=>!__test.tikiPerformer.group.parent&&__test.tikiPerformer.audio.paused));
 assert.deepEqual(errors,[]);console.log('PASS: Blender dance, planted music box, safe terrain, map marker, decoded source audio, cooldown, distance/mute/pause, reset and disposal.');
}finally{await browser.close();}
