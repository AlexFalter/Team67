import * as THREE from 'three';
export function createRiderAnimation({player,limbs,knees,elbows}){
 let phase=0,dismount=null;
 const basePositions=limbs.map(l=>l.position.clone());
 return {reset(){phase=0;dismount=null;player.rotation.x=player.rotation.z=0;},startDismount(kind,start,end,heading){dismount={kind,start:start.clone(),end:end.clone(),heading,age:0,duration:1.05};},active(){return !!dismount;},state(){return {mode:dismount?'dismount':player.userData.animationMode,phase,dismountAge:dismount?.age??0};},update(dt,{position,heading,mode,speed,pedaling,groundPitch=0}){
  phase+=Math.abs(speed)*dt/(mode==='bike'?1.6:2.7);
  player.userData.animationMode=mode;player.position.copy(position);player.position.y+=.1;player.rotation.set(0,heading,0);
  limbs.forEach((l,i)=>{l.rotation.set(0,0,0);l.position.copy(basePositions[i]);});knees.forEach(k=>k.rotation.x=0);elbows.forEach(e=>e.rotation.x=0);
  if(mode==='bike'){
   player.position.y+=.6;player.translateZ(.35);player.rotation.x=.18+groundPitch;
   limbs[0].rotation.x=limbs[2].rotation.x=1.05;elbows.forEach(e=>e.rotation.x=.35);
   for(let i=0;i<2;i++){const cycle=pedaling?Math.sin(phase*4+i*Math.PI):0;limbs[i*2+1].rotation.x=.95+cycle*.2;knees[i].rotation.x=-1.45-cycle*.35;}
  }else if(mode==='scooter'){
   player.position.y+=.28;player.rotation.x=.06+groundPitch;
   limbs[0].rotation.x=limbs[2].rotation.x=1.08;elbows.forEach(e=>e.rotation.x=.25);
   limbs[1].rotation.x=.06;limbs[3].rotation.x=-.12;limbs[3].position.z+=.22;knees[0].rotation.x=-.09;knees[1].rotation.x=-.16;
  }else if(mode==='walk'&&Math.abs(speed)>.15){const swing=Math.sin(phase*4)*.65;limbs[0].rotation.x=-swing;limbs[2].rotation.x=swing;limbs[1].rotation.x=swing;limbs[3].rotation.x=-swing;knees[0].rotation.x=-Math.max(0,-swing)*.7;knees[1].rotation.x=-Math.max(0,swing)*.7;}
  if(dismount){
   const d=dismount;d.age+=dt;const t=Math.min(1,d.age/d.duration),landing=.42,fall=Math.min(1,t/landing),ease=fall*fall;
   player.position.lerpVectors(d.start,d.end,THREE.MathUtils.smoothstep(t,0,.7));player.position.y=THREE.MathUtils.lerp(d.start.y,d.end.y,ease)+.1;player.rotation.y=d.heading;
   if(t<landing){player.rotation.z=-.2*Math.sin(fall*Math.PI);player.rotation.x=.12+fall*.28;limbs[0].rotation.z=.7;limbs[2].rotation.z=-.7;limbs[1].rotation.x=.5;knees[0].rotation.x=-.6;limbs[3].rotation.x=-.2;knees[1].rotation.x=-.4;}
   else{const recovery=(t-landing)/(1-landing),impact=Math.exp(-recovery*6),step=Math.sin(recovery*Math.PI*3)*(1-recovery);player.position.y-=.2*impact;player.rotation.x=.4*impact;player.rotation.z=step*.12;limbs[0].rotation.x=.6*impact;limbs[2].rotation.x=.35*impact;limbs[1].rotation.x=step*.55;limbs[3].rotation.x=-step*.55;knees[0].rotation.x=-.55*impact;knees[1].rotation.x=-.4*impact;}
   if(t===1)dismount=null;
  }
 }};
}
