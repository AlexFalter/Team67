import './scripts/browser-gpu.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:60000});await page.click('#start');await page.keyboard.press('Space');
 const results=await page.evaluate(()=>{
  const t=__test;t.pause();const out=[];
  for(const name of ['transport','polybahn']){
   const v=t[name];v.reset();if(name==='transport')v.setCrashProtection(true);
   const start=v.state().start,pos=t.position.clone().set(start[0],0,start.length===3?start[2]:start[1]);pos.y=t.world.height(pos.x,pos.z);
   const board=id=>name==='transport'?v.board(pos,id):v.board(pos,t.camera,id);
   const local=board('local');for(let i=0;i<40;i++)v.update(.05);
   const before=v.state();const second=board('friend');const after=v.state();
   for(let i=2;i<before.passengers.capacity+2;i++)board(`friend-${i}`);
   const full=v.state();const overflow=board('overflow');const positions=full.passengers.passengers.map(p=>v.passengerPosition(p.playerId).toArray().join(','));
   for(let i=0;i<80;i++)v.update(.05);const waiting=v.state();
   for(let i=0;i<65;i++)v.update(.05);const departing=v.state();const late=board('late');
   for(let i=0;i<20000&&!v.state().arrived;i++)v.update(.05);const arrived=v.state();
   out.push({name,local,second,before,after,full,overflow,positions,waiting,departing,late,arrived});
  }
  return out;
 });
 for(const r of results){assert(r.local&&r.second,r.name+' multiple boarding');assert.equal(r.before.distance,0);assert.equal(r.before.speed,0);assert.equal(r.before.departureIn,r.after.departureIn);assert.equal(r.full.passengers.occupancy,r.full.passengers.capacity);assert.equal(r.overflow,false);assert.equal(new Set(r.positions).size,r.full.passengers.capacity);assert.equal(r.waiting.distance,0);assert(r.departing.distance>0);assert.equal(r.late,false);assert(r.arrived.arrived);assert.equal(r.arrived.passengers.occupancy,r.name==='polybahn'?2:0);}
 assert.deepEqual(errors,[]);console.log('PASS: tram and Polybahn multiple passengers, capacity limits, unique cabin positions, countdown, late boarding rejection, arrival cleanup.');
}finally{await browser.close();}
