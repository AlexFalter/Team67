import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {physicsHarness} from './physics-harness.mjs';
import {createMapNavigation} from './map-navigation.js';
const browser=await chromium.launch();let sites;
try{const page=await browser.newPage();await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:4173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});sites=await page.evaluate(()=>{const s=gameState();return [{name:'laptop',p:s.interviewLimo.laptop},{name:'finance',p:s.financeGuy.position},{name:'mate',p:s.mateMachine.position},{name:'tram',p:[s.tram.start[0],0,s.tram.start[1]]},{name:'scooter',p:[s.scooterPickup.x,0,s.scooterPickup.z]},...s.bikeStation.bikes.map(b=>({name:`bike ${b.id}`,p:[b.x,0,b.z]})),...s.polybahn.ticketPickups.map((p,i)=>({name:`ticket ${i+1}`,p}))];});}finally{await browser.close();}
const {world,solver,sim,walkTo}=await physicsHarness(),navigation=createMapNavigation(world,solver);
for(const site of sites){const p=site.p,nearest=world.data.route.reduce((a,b)=>Math.hypot(b[0]-p[0],b[1]-p[2])<Math.hypot(a[0]-p[0],a[1]-p[2])?b:a),path=navigation.path(nearest,[p[0],p[2]]);sim.set(...path[0]);for(const point of [...path.slice(1),[p[0],p[2]]]){const walked=walkTo(point,{maxSeconds:30});assert(walked.remaining<.6,`${site.name} inaccessible: ${JSON.stringify(walked)}`);}console.log(`PASS: walk from native route to ${site.name}`);}
