import * as THREE from 'three';
// Animation only: locomotion and the collision capsule stay in the player controller.
export function createKnifeMotion(){
 let run=0,sprint=0,slide=0,air=0,landing=0,step=0,swayX=0,swayY=0,lastYaw=null,lastPitch=0,grounded=true,lastFall=0;
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 return {
  update(dt,m={}){
   dt=Math.min(Math.max(dt,0),.05);
   const speed=m.speed??0,onGround=m.grounded??true;
   if(!grounded&&onGround)landing=Math.min(.065,.012+lastFall*.005);
   grounded=onGround;lastFall=Math.max(0,-(m.verticalSpeed??0));
   run=THREE.MathUtils.damp(run,Math.min(speed/6,1),10,dt);
   sprint=THREE.MathUtils.damp(sprint,speed>8?1:0,8,dt);
   slide=THREE.MathUtils.damp(slide,m.sliding?1:0,14,dt);
   air=THREE.MathUtils.damp(air,onGround?0:1,10,dt);landing*=Math.exp(-12*dt);
   const yaw=m.yaw??0,pitch=m.pitch??0;
   const yawDelta=lastYaw===null?0:wrap(yaw-lastYaw),pitchDelta=lastYaw===null?0:pitch-lastPitch;
   lastYaw=yaw;lastPitch=pitch;
   const turning=Math.abs(yawDelta)<.4?THREE.MathUtils.clamp(yawDelta/Math.max(dt,.001),-3,3):0;
   swayX=THREE.MathUtils.damp(swayX,-turning*.012,12,dt);
   swayY=THREE.MathUtils.damp(swayY,-THREE.MathUtils.clamp(pitchDelta/Math.max(dt,.001),-3,3)*.009,12,dt);
   step+=dt*(sprint> .5?12:8);
   const bob=run*(1-air)*(1-slide),stride=Math.sin(step),vertical=Math.cos(step*2);
   return {x:swayX+stride*.016*bob+sprint*.018-slide*.07,
    y:swayY+vertical*.009*bob-sprint*.045-slide*.055+air*.035-landing,
    z:Math.cos(step)*.014*bob+sprint*.035-slide*.025,
    pitch:vertical*.028*bob-air*.16+landing*2.4-slide*.25,
    yaw:swayX*2.5+stride*.045*bob+slide*.16,
    roll:stride*.06*bob-sprint*.3-slide*.18,
    run,sprint,slide,air,landing};
  },
  reset(){run=sprint=slide=air=landing=step=swayX=swayY=0;lastYaw=null;lastPitch=lastFall=0;grounded=true;}
 };
}
