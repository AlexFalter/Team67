import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Exercise the production scanner independently of ongoing world/map changes.
 await page.route('**/scanner-test',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/style.css"><body style="background:#18303a"></body>'}));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/scanner-test`);
 await page.evaluate(async()=>{const {createBikeUnlock}=await import('/bike-unlock.js');window.unlocked=[];window.attempts=0;window.nextResult={ok:true};window.scanner=createBikeUnlock({attempt:()=>{attempts++;return nextResult;},onUnlocked:b=>unlocked.push(b.id),onClose:()=>{}});scanner.open({id:1,broken:false});});
 const target=await page.evaluate(()=>scanner.state().target),rect=await page.locator('#unlock-view').boundingBox();
 const aim=async(x,y)=>page.mouse.move(rect.x+x/320*rect.width,rect.y+y/260*rect.height);
 await aim(target.x,target.y);const stutter=await page.evaluate(()=>{for(let i=0;i<150&&scanner.state().phase!=='stutter';i++)scanner.update(1/60);return scanner.state();});assert.equal(stutter.phase,'stutter');assert(stutter.progress>=.45&&stutter.progress<1);await page.screenshot({path:'artifacts/publibike-hover-stutter.png'});
 await aim(target.x+8,target.y);const wobbled=await page.evaluate(()=>{scanner.update(1/60);return scanner.state();});assert.equal(wobbled.phase,'steady');assert.equal(wobbled.steadyTime,0);assert(wobbled.progress<stutter.progress);
 await aim(target.x+65,target.y);const outside=await page.evaluate(()=>{for(let i=0;i<80;i++)scanner.update(1/60);return scanner.state();});assert.equal(outside.progress,0);assert.equal(await page.evaluate(()=>attempts),0);
 await aim(target.x,target.y);await page.evaluate(()=>{for(let i=0;i<180&&scanner.active();i++)scanner.update(1/60);});assert.deepEqual(await page.evaluate(()=>unlocked),[1]);assert.equal(await page.locator('#unlock-scan').count(),0);
 // Cancellation and retry reset the automatic scan rather than inheriting progress.
 await page.evaluate(()=>scanner.open({id:8,broken:false}));assert.equal(await page.evaluate(()=>scanner.state().progress),0);await page.evaluate(()=>scanner.keydown(new KeyboardEvent('keydown',{code:'Escape'})));assert.equal(await page.evaluate(()=>scanner.active()),false);
 await page.evaluate(()=>{nextResult={ok:false,error:'QR interpreted as a croissant',permanent:false};scanner.open({id:8,broken:false});});
 const retryTarget=await page.evaluate(()=>scanner.state().target);await aim(retryTarget.x,retryTarget.y);await page.evaluate(()=>{for(let i=0;i<180&&!scanner.state().error;i++)scanner.update(1/60);});assert.match(await page.evaluate(()=>scanner.state().error),/croissant/);await page.click('#unlock-retry');assert.equal(await page.evaluate(()=>scanner.state().progress),0);await page.evaluate(()=>{nextResult={ok:true};for(let i=0;i<180&&scanner.active();i++)scanner.update(1/60);});assert.deepEqual(await page.evaluate(()=>unlocked),[1,8]);
 await page.evaluate(()=>{nextResult={ok:false,error:'LOCK-404',permanent:true};scanner.open({id:3,broken:false});});const badTarget=await page.evaluate(()=>scanner.state().target);await aim(badTarget.x,badTarget.y);await page.evaluate(()=>{for(let i=0;i<180&&!scanner.state().error;i++)scanner.update(1/60);});assert.equal(await page.evaluate(()=>scanner.state().permanent),true);assert.equal(await page.locator('#unlock-retry').isVisible(),false);await page.click('#unlock-another');assert.equal(await page.evaluate(()=>scanner.active()),false);
 assert.deepEqual(errors,[]);console.log('PASS: production scanner hover-only unlock, visible stutter, motion interrupts scan, misalignment drains progress, one unlock callback, reset/cancel and no scan button.');
}finally{await browser.close();}
