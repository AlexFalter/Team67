import * as THREE from 'three';

// A comic throw reaction: airborne tumble, landing, kneeling and standing.
export function createNpcKnockdown(rig,world){
 let hit=null,count=0;
 const actor=rig.player,home=rig.player.position.clone(),homeRotation=rig.player.rotation.clone(),pose=[...rig.limbs,...rig.knees,...rig.elbows].map(o=>({o,rotation:o.rotation.clone()}));
 const worldPosition=()=>actor.getWorldPosition(new THREE.Vector3());
 function place(position){actor.position.copy(actor.parent?actor.parent.worldToLocal(position.clone()):position);}
 function face(heading){const q=new THREE.Quaternion();if(actor.parent)actor.parent.getWorldQuaternion(q);const parentHeading=new THREE.Euler().setFromQuaternion(q,'YXZ').y;actor.rotation.set(0,heading-parentHeading,0);}
 function clear(p){return !world.blocked(p.x,p.z)&&!world.isWater(p.x,p.z)&&!world.bodyBlocked(p.x,world.height(p.x,p.z)+.15,p.z,.45,1.8);}
 return {active:()=>!!hit,reset(){hit=null;count=0;actor.position.copy(home);actor.rotation.copy(homeRotation);pose.forEach(p=>p.o.rotation.copy(p.rotation));},
  strike(from,to,velocity){
   if(hit||!actor.visible||velocity.length()<2)return false;
   const center=worldPosition().add(new THREE.Vector3(0,.9,0)),segment=to.clone().sub(from),length=segment.lengthSq();
   const closest=from.clone().addScaledVector(segment,length?THREE.MathUtils.clamp(center.clone().sub(from).dot(segment)/length,0,1):0);
   if(closest.distanceTo(center)>.9)return false;
   const direction=velocity.clone().setY(0).normalize(),start=worldPosition(),end=start.clone();
   for(let d=.2;d<=4;d+=.2){const p=start.clone().addScaledVector(direction,d);if(!clear(p))break;p.y=world.height(p.x,p.z)+.1;end.copy(p);}
   hit={age:0,start,end,heading:Math.atan2(-direction.x,-direction.z)};count++;return true;
  },
  update(dt){if(!hit)return;const h=hit;h.age+=dt;const t=h.age;
   rig.limbs.forEach(l=>l.rotation.set(0,0,0));rig.knees.forEach(k=>k.rotation.x=0);rig.elbows.forEach(e=>e.rotation.x=0);
   face(h.heading);
   if(t<.85){const u=t/.85;place(h.start.clone().lerp(h.end,u).add(new THREE.Vector3(0,Math.sin(Math.PI*u)*1.7,0)));actor.rotation.x=-Math.PI*2*u;actor.rotation.z=Math.sin(Math.PI*u)*.45;rig.limbs[0].rotation.z=.9;rig.limbs[2].rotation.z=-.9;rig.limbs[1].rotation.x=.7;rig.limbs[3].rotation.x=-.6;rig.knees.forEach(k=>k.rotation.x=-.8);}
   else {const recovery=THREE.MathUtils.smoothstep(t,1.5,3.1),fold=1-recovery;place(h.end.clone().add(new THREE.Vector3(0,.75*fold,0)));actor.rotation.x=-Math.PI/2*fold;rig.limbs[0].rotation.x=rig.limbs[2].rotation.x=.9*fold;rig.limbs[1].rotation.x=rig.limbs[3].rotation.x=.9*fold;rig.knees.forEach(k=>k.rotation.x=-1.4*fold);rig.elbows.forEach(e=>e.rotation.x=.6*fold);}
   if(t>=3.1){place(h.end);face(h.heading);hit=null;}
  },state:()=>({phase:!hit?'standing':hit.age<.85?'flying':hit.age<1.5?'down':'getting-up',hits:count,position:worldPosition().toArray()})};
}
