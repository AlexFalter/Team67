import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('eth-game-test-settings',JSON.stringify({vehicleSounds:false,skipIntro:true}));const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{if(!window.freezeMoonwalk)cb(t);});});
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);
 await page.waitForFunction(()=>window.__test,{},{timeout:90000});
 assert.equal(await page.evaluate(()=>gameState().michaelJackson.source),'Blender');
 await page.click('#start');await page.evaluate(()=>{__test.finishIntro();__test.position.copy(__test.michaelJackson.center);});
 await page.waitForFunction(()=>__test.michaelJackson.state().played&&__test.michaelJackson.audio.volume>.5);
 await page.evaluate(()=>{window.freezeMoonwalk=true;});await page.waitForTimeout(100);
 const result=await page.evaluate(()=>{
  const t=__test,m=t.michaelJackson;m.reset();
  const left=m.group.getObjectByName('LeftFoot'),right=m.group.getObjectByName('RightFoot');
  const beforeLeft=left.position.clone(),beforeRight=right.position.clone(),start=m.group.position.clone();
  m.update(.35,m.center,{active:true});m.update(.1,m.center,{active:true});m.update(.1,m.center,{active:true});
  const feetMove=left.position.distanceTo(beforeLeft)>.002&&right.position.distanceTo(beforeRight)>.002;
  const forward=start.clone().set(Math.sin(m.group.rotation.y),0,Math.cos(m.group.rotation.y)),velocity=m.group.position.clone().sub(start);velocity.y=0;
  let maxStep=0,previous=m.group.position.clone();
  for(let i=0;i<360;i++){
   m.update(1/60,m.center,{active:true});const p=m.group.position;
   if(t.world.isWater(p.x,p.z)||t.world.blocked(p.x,p.z)||t.solver.penetration(p.clone())>.01)throw Error('Moonwalk leaves clear ground');
   if(Math.abs(p.y-t.world.height(p.x,p.z))>.001)throw Error('Dancer floats');
   maxStep=Math.max(maxStep,p.distanceTo(previous));previous.copy(p);
  }
  return {feetMove,backward:forward.dot(velocity)<0,maxStep,state:m.state()};
 });
 assert(result.feetMove,'both feet animate');assert(result.backward,'travel is opposite the facing direction');assert(result.maxStep<.025);assert.match(result.state.animation,/Moonwalk/);
 await page.waitForFunction(()=>__test.michaelJackson.state().played&&!__test.michaelJackson.state().failed);
 const decoded=await page.evaluate(async()=>{const a=new AudioContext(),m=__test.michaelJackson,b=await fetch(m.audio.src).then(r=>r.arrayBuffer()),clip=await a.decodeAudioData(b);let energy=0;const data=clip.getChannelData(0);for(const n of data)energy+=n*n;await a.close();return {duration:clip.duration,rms:Math.sqrt(energy/data.length),plays:m.state().plays};});
 assert(decoded.duration>1&&decoded.duration<2);assert(decoded.rms>.01);assert.equal(decoded.plays,1,'short clip does not spam');
 await page.evaluate(()=>{const t=__test,m=t.michaelJackson;m.reset();m.update(.1,m.center,{active:true});t.camera.position.copy(m.group.position).add(new t.position.constructor(2.3,1.7,-3.2));t.camera.lookAt(m.group.position.x,m.group.position.y+1,m.group.position.z);t.camera.fov=45;t.camera.updateProjectionMatrix();t.renderer.render(t.scene,t.camera);});
 await page.screenshot({path:'artifacts/michael-jackson-npc.png'});
 await page.evaluate(()=>{const m=__test.michaelJackson;for(let i=0;i<20;i++)m.update(.1,m.center.clone().addScalar(100),{active:true});});
 assert(await page.evaluate(()=>__test.michaelJackson.audio.paused&&__test.michaelJackson.audio.volume<.005));
 const age=await page.evaluate(()=>__test.michaelJackson.state().age);
 await page.evaluate(()=>__test.michaelJackson.update(.1,__test.position,{active:false}));assert.equal(await page.evaluate(()=>__test.michaelJackson.state().age),age);
 await page.evaluate(()=>{const m=__test.michaelJackson;m.dispose();m.dispose();});assert(await page.evaluate(()=>!__test.michaelJackson.group.parent&&__test.michaelJackson.audio.paused));
 assert.deepEqual(errors,[]);console.log('PASS: Blender model, both animated feet, continuous grounded backward travel, audible hee-hee with cooldown, distance silence, pause/reset and disposal.');
}finally{await browser.close();}
