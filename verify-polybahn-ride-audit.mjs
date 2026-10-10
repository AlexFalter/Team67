import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',ws=>ws.onMessage(()=>{}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>raf(t=>{if(!window.__freezeAudit)callback(t);});});
 await page.goto('http://127.0.0.1:5173/?debug=1');await page.waitForFunction(()=>window.__test,{},{timeout:60000});
 await page.evaluate(()=>{document.querySelector('#start').click();__test.finishIntro();window.__freezeAudit=true;});
 await page.waitForTimeout(100);
 const report=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),t=__test,p=t.polybahn,phases=[],snapshots=[];
  function checkSeats(){
   p.cars[0].updateMatrixWorld(true);
   for(const actor of [t.polybahnEater.actor,t.sixSevenKid.actor]){
    // Test the real mesh in carriage coordinates, including its animated hierarchy.
    const inverse=p.cars[0].matrixWorld.clone().invert();
    actor.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));if(b.min.x<-1.05||b.max.x>1.05||b.min.y<.5399||b.max.y>2.23||b.min.z<-2.32||b.max.z>2.32)throw Error('Animated passenger escapes cabin');});
    for(const leg of actor.children.filter(c=>c.isGroup&&Math.abs(c.position.y-.9)<.001)){
     const knee=leg.children.find(c=>c.isGroup),thigh=leg.children.find(c=>c.isMesh);
     const bounds=mesh=>{mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));};
     const hip=leg.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse),kp=knee.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
     if(!(Math.abs(kp.x)<Math.abs(hip.x)-.2&&Math.abs(kp.x)>.3&&Math.abs(kp.x)<.4))throw Error('Knee points into wall/aisle');
     if(Math.abs(bounds(thigh).min.y-1.001)>.0001)throw Error('Thigh clips seat');
     const calf=bounds(knee.children[0]);if(calf.min.x<-.44||calf.max.x>.44)throw Error('Calf clips bench front');
     const sole=bounds(knee.children[2]);if(Math.abs(sole.min.y-.54)>.0001)throw Error('Feet do not reach floor');
     if(sole.min.x<-1.05||sole.max.x>1.05)throw Error('Feet escape carriage');
    }
   }
  }
  for(const index of [0,1]){
   if(!p.collectTicket(p.ticketPoints[index]))throw Error('Ticket unavailable');
   const q=p.state()[index?'end':'start'];t.setPosition(q[0],q[2]);t.interactVehicle();
   if(!p.state().aboard)throw Error('Board failed');
   let prev=t.position.clone(),maxStep=0,ticks=0;
   while(!p.state().arrived&&ticks++<12000){
    t.advancePolybahn(1/60);t.polybahnEater.update(1/60,p.state().aboard,false,t.position);t.sixSevenKid.update(1/60,p.state().aboard);
    checkSeats();const s=p.state();if(phases.at(-1)!==s.phase)phases.push(s.phase);
    maxStep=Math.max(maxStep,prev.distanceTo(t.position));prev.copy(t.position);
    if(s.phase==='travelling'){
     p.movePassenger(100,100,1);if(p.state().passengerLocal[0]>.220001||p.state().passengerLocal[2]>2.000001)throw Error('Cabin boundary escaped');
     p.movePassenger(-100,-100,1);if(p.state().passengerLocal[0]<-.220001||p.state().passengerLocal[2]<-2.000001)throw Error('Opposite boundary escaped');
     p.movePassenger(.22,2.3,1);
     const view=p.rideView(0);if(!view.eye.toArray().every(Number.isFinite))throw Error('Invalid camera');
    }
   }
   if(!p.state().arrived||p.state().aboard||p.state().moving)throw Error('Ride did not end');
   if(t.solver.penetration(t.position)>.02)throw Error('Blocked exit');
   snapshots.push({direction:index?'down':'up',ticks,maxStep,landing:t.position.toArray()});
   if(gameState().touristPhoto?.active){document.querySelector('#tourist-center').click();document.querySelector('#tourist-shutter').click();document.querySelector('#tourist-hand-back').click();document.querySelector('#tourist-shutter').click();document.querySelector('#tourist-hand-back').click();}
  }
  // Exercise the animated seated kid, reset, and another boarding after a round trip.
  t.reset();t.finishIntro();p.collectTicket(p.ticketPoints[0]);const q=p.state().start;t.setPosition(q[0],q[2]);t.interactVehicle();for(let i=0;i<190;i++)t.advancePolybahn(1/60);
  const kid=t.sixSevenKid,near=p.cars[0].localToWorld(new THREE.Vector3(0,.54,-1.35));kid.update(0,true);kid.interact(near);kid.keydown({code:'ArrowDown',preventDefault(){}});kid.keydown({code:'Enter',repeat:false,preventDefault(){}});
  for(let i=0;i<360;i++){kid.update(1/60,true);t.polybahnEater.update(1/60,true,false,t.position);checkSeats();}
  return {phases,snapshots,seatingFrames: snapshots.reduce((n,s)=>n+s.ticks,360)};
 });
 assert(report.phases.includes('boarding')&&report.phases.includes('closing')&&report.phases.includes('travelling')&&report.phases.includes('opening')&&report.phases.includes('disembarking')&&report.phases.includes('idle'));
 // Record unobstructed full-body views so pose errors cannot hide behind dialogue UI.
 await page.addStyleTag({content:'body > :not(#game) {visibility:hidden !important}'});
 for(const [name,z] of [['eater',1.2],['kid',-1.35]]){
  await page.evaluate(({z})=>{const t=__test,car=t.polybahn.cars[0],v=t.position.clone();v.set(0,1.5,z+(z>0?-1.25:1.25));t.camera.position.copy(car.localToWorld(v));v.set(z>0?-.88:.88,1.1,z);t.camera.up.set(0,1,0).applyQuaternion(car.quaternion);t.camera.lookAt(car.localToWorld(v));t.renderer.render(t.scene,t.camera);},{z});
  await page.screenshot({path:`artifacts/polybahn-seated-${name}-audit.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS: full round trip, all door phases, actual seated mesh direction/floor/bench clearance every frame, extreme cabin movement, safe exits, reset/reboarding, animated kid.',JSON.stringify(report));
}finally{await browser.close();}
