import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {privatePropertyBoundary} from './private-property.js';
const bounds={minX:-400,maxX:300,minZ:-370,maxZ:170};
for(const [edge,p] of [['west',{x:-395,z:0}],['east',{x:295,z:0}],['north',{x:0,z:-365}],['south',{x:0,z:165}]])assert.equal(privatePropertyBoundary(p,bounds).edge,edge);
assert.equal(privatePropertyBoundary({x:0,z:0},bounds),null);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test);await page.click('#start');await page.keyboard.press('Enter');
 const start=await page.evaluate(()=>gameState().position);
 const positions=await page.evaluate(()=>{const t=__test,b=t.world.data.encounterBounds,result={};for(const edge of ['west','east','north','south']){for(let d=5;d<=10&&!result[edge];d++)for(let a=(edge==='west'||edge==='east'?b.minZ:b.minX)+25;a<(edge==='west'||edge==='east'?b.maxZ:b.maxX)-25&&!result[edge];a+=3){const x=edge==='west'?b.minX+d:edge==='east'?b.maxX-d:a,z=edge==='north'?b.minZ+d:edge==='south'?b.maxZ-d:a;if(!t.world.isWater(x,z)&&t.solver.penetration(new t.position.constructor(x,t.world.height(x,z),z))<.01)result[edge]=[x,z];}}return result;});
 assert.equal(Object.keys(positions).length,4,'dry accessible point on every border');
 await page.evaluate(()=>__test.updatePlayer(.01));assert(!await page.evaluate(()=>gameState().privateProperty.active),'interior ignored');
 let count=0;
 for(const edge of ['west','west','east','north','south']){
  await page.evaluate(({p})=>{__test.setPosition(...p);__test.updatePlayer(.01);},{p:positions[edge]});
  const encounter=await page.evaluate(()=>gameState().privateProperty);assert(encounter.active,`${edge} triggers`);assert.equal(encounter.edge,edge);assert.equal(encounter.count,++count);assert(encounter.carVisible,'car visible when encounter starts');assert(encounter.approach.every(Number.isFinite)&&encounter.stop.every(Number.isFinite));assert(Math.hypot(encounter.approach[0]-encounter.stop[0],encounter.approach[2]-encounter.stop[2])>=3,'visible car approach');
  if(count===1){const frozen=await page.evaluate(()=>({position:gameState().position,elapsed:gameState().elapsed}));for(const key of ['Space','Enter','KeyR','KeyM','KeyE','ArrowUp'])await page.keyboard.press(key);assert(await page.evaluate(()=>gameState().privateProperty.active));assert.equal(await page.evaluate(()=>gameState().elapsed),frozen.elapsed);assert.deepEqual(await page.evaluate(()=>gameState().position),frozen.position);}
  await page.evaluate(()=>{while(gameState().privateProperty.age<3)__test.updatePlayer(.25,.25);});await page.waitForFunction(()=>gameState().privateProperty.audioPlayed,{},{timeout:10000});
  if(edge==='east')await page.screenshot({path:'artifacts/private-property-boundary.png'});
  await page.evaluate(()=>{for(let i=0;i<40&&gameState().privateProperty.active;i++)__test.updatePlayer(.25,.25);});const after=await page.evaluate(()=>gameState());assert(!after.privateProperty.active);assert(!after.privateProperty.carVisible,'car removed after encounter');assert(Math.hypot(after.position.x-start.x,after.position.z-start.z)<.01);assert(after.penetration<.01);
 }
 await page.keyboard.press('KeyR');assert.equal(await page.evaluate(()=>gameState().privateProperty.count),0);assert.deepEqual(errors,[]);
 console.log('PASS: all four borders, repeat at same edge, unskippable controls, repeated original audio, safe return, reset, no browser errors.');
}finally{await browser.close();}
