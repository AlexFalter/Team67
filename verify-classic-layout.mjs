import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {physicsHarness} from './physics-harness.mjs';
const classic=JSON.parse(await readFile('public/gameplay/classic-layout.json','utf8'));
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');await page.keyboard.press('Space');
 const state=await page.evaluate(()=>gameState()),origin=await page.evaluate(()=>__test.world.data.origin),convert=p=>[p[0]+classic.origin[0]-origin[0],p[1]+origin[1]-classic.origin[1]],distance=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
 assert(distance([state.position.x,state.position.z],convert(classic.start))<.01);
 assert(distance([state.bikeStation.x,state.bikeStation.z],convert(classic.route[6]))<15,'station returns to early path');assert.equal(state.bikeStation.capacity,8);
 assert(distance([state.scooterPickup.x,state.scooterPickup.z],convert(classic.route[12]))<.01,'scooter returns to same relative location');
 assert(distance([state.mateMachine.position[0],state.mateMachine.position[2]],convert(classic.route[7]))<10,'Mate returns before bridge crossing');
 assert(distance([state.financeGuy.position[0],state.financeGuy.position[2]],convert(classic.route[38]))<20,'Finance Guy returns to hillside detour');
 const goal=await page.evaluate(()=>__test.world.data.route.at(-1));assert(distance(goal,convert(classic.goal))<2,'ETH finish returns to original area');
 await page.keyboard.press('KeyM');await page.screenshot({path:'artifacts/restored-classic-layout-map.png'});assert.deepEqual(errors,[]);
 console.log('PASS: historical spawn, early station with eight bikes, Mate machine, scooter, hillside encounter and ETH destination.');
}finally{await browser.close();}
const {world,sim,walkTo}=await physicsHarness({vehicles:false});
for(const hz of [30,60,120]){sim.set(...world.data.route[0]);for(const [i,p] of world.data.route.entries()){const result=walkTo(p,{hz,maxSeconds:60});assert(result.remaining<.6,`${hz}Hz guide point ${i}: ${JSON.stringify(result)}`);assert(!result.state.waterRecovery);assert(result.maxPenetration<.01);}console.log(`PASS: whole restored walking guide at ${hz}Hz without wall or water collisions.`);}
