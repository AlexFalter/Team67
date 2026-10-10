import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');await page.keyboard.press('Enter');
 const markers=await page.evaluate(()=>__test.encounterMarkers());for(const id of ['mate','finance','interview','polybahn','ticket-0','ticket-1','bikes','scooter','tram'])assert(markers.some(m=>m.id===id),id);assert(markers.every(m=>Number.isFinite(m.x)&&Number.isFinite(m.z)));assert.equal(new Set(markers.map(m=>m.id)).size,markers.length);
 assert(markers.some(m=>m.id==='tourists'),'Visible tourists have a map marker');
 assert(!markers.some(m=>m.id.startsWith('property-')||['kid','butler'].includes(m.id)),'No markers for empty locations or unavailable passengers');
 const coordinates=await page.evaluate(()=>{const m=__test.encounterMarkers();return {mate:m.find(m=>m.id==='mate'),machine:__test.mateMachine.machine.position.toArray()};});assert.equal(coordinates.mate.x,coordinates.machine[0]);assert.equal(coordinates.mate.z,coordinates.machine[2]);
 const ticket=await page.evaluate(()=>{const p=__test.polybahn.ticketPoints[0];const collected=__test.polybahn.collectTicket(p);return {collected,markers:__test.encounterMarkers()};});assert(ticket.collected,'Marked ticket can actually be collected');assert(!ticket.markers.some(m=>m.id.startsWith('ticket-')),'Collected tickets disappear from map');await page.evaluate(()=>__test.polybahn.reset());
 const painted=await page.evaluate(()=>{const count=(id,draw)=>{const ctx=document.getElementById(id).getContext('2d'),original=ctx.fillText;let n=0;ctx.fillText=function(text,...args){if(text==='?')n++;return original.call(this,text,...args);};try{draw();}finally{ctx.fillText=original;}return n;};return {full:count('route-map-canvas',__test.drawRouteMap),mini:count('map',__test.drawMap)};});assert.equal(painted.full,markers.length);assert(painted.mini>0);await page.keyboard.press('KeyM');await page.screenshot({path:'artifacts/encounter-question-marks.png'});assert.deepEqual(errors,[]);console.log(`PASS: ${markers.length} unique encounter locations, exact NPC positions, full-map and nearby minimap question marks, no browser errors.`);
}finally{await browser.close();}
