import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.goto(`${process.env.GAME_URL??'http://127.0.0.1:5173'}/?debug=1`);await page.waitForFunction(()=>window.__test,{},{timeout:90000});
 const result=await page.evaluate(()=>{
  window.requestAnimationFrame=()=>0;
  const {world,transport,interviewLimo,polybahn}=__test,V=__test.position.constructor;
  const failures=[],counts={limousine:0,tram:0,polybahn:0,parkedBus:0,shuttle:0,arrival:0,tramWreck:0};
  function footprint(position,quaternion,width,halfLength,height,name,allowWater=false){if(transport.path.wallBlocked(position,quaternion,width,halfLength,height)&&failures.length<8)failures.push({name,geometry:true,p:position.toArray()});for(let x=-width;x<=width+.01;x+=width)for(let z=-halfLength;z<=halfLength+.01;z+=halfLength/Math.ceil(halfLength)){const p=new V(x,.1,z).applyQuaternion(quaternion).add(position);counts[name]++;if(world.bodyBlocked(p.x,p.y,p.z,.1,height)||(!allowWater&&world.blocked(p.x,p.z))||(name==='limousine'&&transport.parkingBounds.some(b=>b.containsPoint(p)))){if(failures.length<8)failures.push({name,p:p.toArray()});}}}
  for(let d=0;d<=interviewLimo.path.length;d+=.25)for(const reverse of [false,true]){const f=interviewLimo.path.frame(d,reverse);footprint(f.position,f.quaternion,1.34,3.9,1.9,'limousine');}
  transport.reset();transport.setCrashProtection(true);let completed=0;
  for(let trip=0;trip<2;trip++){const s=transport.state(),p=trip?s.end:s.start;if(!transport.board(new V(p[0],world.height(...p),p[1])))throw Error('Tram cannot board');for(let i=0;i<12000;i++){const s=transport.update(1/60);for(const car of transport.cars)footprint(car.position,car.quaternion,1.25,3.32,3.1,'tram');if(s.arrived){completed++;break;}}}
  for(let d=0;d<=polybahn.path.length;d+=.25)for(const lane of [-1.25,1.25]){const f=polybahn.path.frame(d,lane);footprint(f.position,f.quaternion,1.31,2.5,2.2,'polybahn');}
  transport.reset();transport.setCrashProtection(false);{const p=transport.state().start;transport.board(new V(p[0],world.height(...p),p[1]));}
  for(let i=0;i<800;i++){transport.update(1/60);for(const car of transport.cars)footprint(car.position,car.quaternion,1.25,3.32,3.1,'tramWreck');}
  const bus=transport.ethLink;footprint(bus.position,bus.quaternion,1.61,8.91,3.1,'parkedBus');
  const intro=__test.shuttleIntro;for(let t=0;t<=7;t+=.02){intro.start(t);footprint(intro.bus.position,intro.bus.quaternion,1.6,9.1,3.5,'arrival',true);}intro.start(7);intro.finish();
  for(let i=0;i<1200&&intro.bus.visible;i++){intro.depart(1/60);footprint(intro.bus.position,intro.bus.quaternion,1.6,9.1,3.5,'shuttle',true);}
  return {failures,counts,completed};
 });assert.deepEqual(result.failures,[]);assert.equal(result.completed,2);assert.deepEqual(errors,[]);console.log('PASS: full limousine hull, every tram carriage in both directions, both Polybahn lanes, parked ETH Link, and shuttle arrival/departure clear native map buildings; normal rides also clear water.',result.counts);
}finally{await browser.close();}
