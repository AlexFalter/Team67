import {featurePlacement,placementPoint,navigatePlacement} from '../../world/placements/feature-placement.js';
import {createVehiclePassengers} from '../passengers/vehicle-passengers.js';
import * as THREE from 'three';
import {addETHLinkCabin} from './eth-link-cabin.js';
import {createNpcKnockdown} from '../../interactions/knife/npc-knockdown.js';
import {createMapNavigation} from '../../world/core/map-navigation.js';
import {createGroundVehiclePath,withVehicleWalls} from '../../world/core/vehicle-path.js';
import {createStudent} from '../../player/student-model.js';
import {createRiderAnimation} from '../../player/rider-animation.js';
import {createShuttleExplosion} from './shuttle-explosion.js';

// Match the parked ETH Link with a hollow cabin, real door opening and local ride physics.
export function createShuttleIntro(scene,world,start,heading,sourceModel=null,{placement}={}){
 placement=featurePlacement(world,'shuttle',placement);
 const arrival=placementPoint(placement.arrival,'bus arrival');
 start=new THREE.Vector3(arrival[0],world.height(...arrival),arrival[1]);
 heading=placement.heading;
 if(!Number.isFinite(heading))throw Error('Bus placement requires a finite heading');
 world=withVehicleWalls(world);
 const passengerSlots=createVehiclePassengers('bus');
 const bus=sourceModel?.clone(true)??new THREE.Group();bus.name='Arriving ETH Link';scene.add(bus);bus.visible=false;
 const cabin=addETHLinkCabin(bus);let doorAmount=0;
 const busHeading=heading+Math.PI;
 const right=new THREE.Vector3(Math.cos(busHeading),0,-Math.sin(busHeading));
 const forward=new THREE.Vector3(-Math.sin(busHeading),0,-Math.cos(busHeading));
 const doorPoint=start.clone().addScaledVector(right,-2.7),inside=doorPoint.clone().addScaledVector(right,-.85);
 const origin=doorPoint.clone().addScaledVector(right,-1.35).addScaledVector(forward,-2.6);origin.y=world.height(origin.x,origin.z);
 bus.position.copy(origin);bus.rotation.y=busHeading;
 const bounds=world.data.playableBounds;let approachDistance=100;while(approachDistance<2000){const p=origin.clone().addScaledVector(forward,-approachDistance);if(p.x<bounds.minX-80||p.x>bounds.maxX+80||p.z<bounds.minZ-80||p.z>bounds.maxZ+80)break;approachDistance+=20;}
 const voidStart=origin.clone().addScaledVector(forward,-approachDistance);voidStart.y=origin.y+85;
 const entryCurve=new THREE.CubicBezierCurve3(voidStart,voidStart.clone().addScaledVector(forward,approachDistance*.42),origin.clone().addScaledVector(forward,-28),origin.clone());entryCurve.arcLengthDivisions=768;
 const arrivalDuration=7;
 function entryPose(t){const u=THREE.MathUtils.smoothstep(t,0,1),p=entryCurve.getPointAt(u),f=entryCurve.getTangentAt(u).normalize(),back=f.clone().negate(),r=new THREE.Vector3(0,1,0).cross(back).normalize(),up=back.clone().cross(r).normalize();bus.position.copy(p);bus.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,up,back));bus.updateMatrixWorld(true);}
 function rideView(){bus.updateMatrixWorld(true);const seat=passengerSlots.seat(),eye=seat?new THREE.Vector3(...seat.eye):cabin.eye.clone();return {eye:bus.localToWorld(eye.clone()),target:bus.localToWorld(eye.clone().add(new THREE.Vector3(0,0,-4))),up:new THREE.Vector3(0,1,0).applyQuaternion(bus.quaternion)};}
 const passengers=[0,1,2].map(i=>{const rig=createStudent();rig.player.scale.setScalar(i?.95:1.03);scene.add(rig.player);rig.player.visible=false;return {rig,knockdown:createNpcKnockdown(rig,world),animation:createRiderAnimation(rig),destination:start.clone().addScaledVector(forward,3+i*1.7).addScaledVector(right,1.2)};});
 // Aim at actual open river water, outside bridge footprints.
 let waterTarget=null,best=Infinity;
 for(let dx=-85;dx<=85;dx+=2)for(let dz=-85;dz<=85;dz+=2){const x=origin.x+dx,z=origin.z+dz,d=Math.hypot(dx,dz);if(d<10||d>85||!world.isWater(x,z)||![[6,0],[-6,0],[0,6],[0,-6]].every(([a,b])=>world.isWater(x+a,z+b)))continue;const score=d+Math.max(0,-(dx*forward.x+dz*forward.z))*.2;if(score<best){best=score;waterTarget=new THREE.Vector3(x,world.ground(x,z),z);}}
 // Map variants may have no open river near the spawn. Keep startup and
 // the arrival playable, then use a normal departure without an explosion.
 if(placement.departureTarget){const target=placementPoint(placement.departureTarget,'bus departure target');waterTarget=new THREE.Vector3(target[0],world.ground(...target),target[1]);}
 const riverFinale=placement.riverFinale!==false&&waterTarget!==null&&world.isWater(waterTarget.x,waterTarget.z);
 if(!waterTarget){waterTarget=origin.clone().addScaledVector(forward,45);waterTarget.y=world.ground(waterTarget.x,waterTarget.z);}
 // The river gag can enter water, but its approach must still clear buildings
 // and bridge abutments with the whole bus, rather than cutting through them.
 const departureWorld={...world,blocked:(x,z)=>x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ};
 const navigation=createMapNavigation(departureWorld,{penetration:p=>world.bodyBlocked(p.x,p.y,p.z,4.6,2.9)?1:0});
 const road=navigatePlacement(navigation,[origin.x,origin.z],placement.departureWaypoints,[waterTarget.x,waterTarget.z]);
 if(Math.hypot(road[0][0]-origin.x,road[0][1]-origin.z)>.01)road.unshift([origin.x,origin.z]);
 // Navigation snaps to a grid; start at the parked bus to avoid a sideways jump.
 if(navigation.line(origin,new THREE.Vector3(road[1][0],world.height(...road[1]),road[1][1])))road[0]=[origin.x,origin.z];
 else if(Math.hypot(road[0][0]-origin.x,road[0][1]-origin.z)>.001)road.unshift([origin.x,origin.z]);
 const departure=createGroundVehiclePath(departureWorld,road,{radius:4.6,height:3.5,halfWidth:1.6,halfLength:9.1});
 const pathLength=departure.length,explosion=createShuttleExplosion(scene);
 waterTarget.copy(departure.sample(pathLength));
 const battleBusAudio=new Audio('/audio/fortnite-battle-bus.mp3');battleBusAudio.preload='auto';battleBusAudio.volume=.55;
 let battleBusPlayed=false,battleBusFailed=false,soundGeneration=0;
 function stopBattleBus(){soundGeneration++;battleBusAudio.pause();battleBusAudio.currentTime=0;}
 let time=0,thanked=false,active=false,startedAt=0,departing=false,travel=0,speed=0,departTick=performance.now();
 function setDoor(amount){doorAmount=amount;cabin.setDoor(amount);}
 function exit(person,animation,destination,begin,end,dt){
  const t=THREE.MathUtils.clamp((time-begin)/(end-begin),0,1),out=THREE.MathUtils.smoothstep(t,0,.6),along=THREE.MathUtils.smoothstep(t,.6,1);
  const position=inside.clone().lerp(doorPoint.clone().addScaledVector(right,1.35),out).lerp(destination,along);
  position.y=THREE.MathUtils.lerp(origin.y+cabin.floorHeight,world.height(position.x,position.z),THREE.MathUtils.smoothstep(out,.42,.85));
  const face=t<.6?busHeading-Math.PI/2:Math.atan2(-(destination.x-doorPoint.x),-(destination.z-doorPoint.z));person.rotation.y=face;
  animation.update(dt,{position,heading:face,mode:'walk',speed:t>0&&t<1?1.8:0,pedaling:false,groundPitch:0});return position;
 }
 return {passengerSlots,passengerPosition(playerId='local'){const seat=passengerSlots.seat(playerId);if(!seat)return null;bus.updateMatrixWorld(true);return bus.localToWorld(new THREE.Vector3(...seat.position));},bus,cabin,rideView,battleBusAudio,passengers,hitPassengers(from,to,velocity){return passengers.some(p=>p.knockdown.strike(from,to,velocity));},inCabin:()=>active&&time<0&&time>-arrivalDuration+1.2,
  start(elapsed=0){passengerSlots.clear();passengerSlots.board();for(let i=0;i<3;i++)passengerSlots.board(`student-${i}`);stopBattleBus();battleBusPlayed=false;battleBusFailed=false;if(elapsed<arrivalDuration){const token=soundGeneration;battleBusAudio.currentTime=Math.max(0,elapsed);battleBusAudio.play().then(()=>{if(token===soundGeneration)battleBusPlayed=true;}).catch(()=>{if(token===soundGeneration)battleBusFailed=true;});}explosion.reset();explosion.prime();time=-arrivalDuration+elapsed;thanked=false;startedAt=performance.now()-elapsed*1000;active=true;departing=false;departTick=performance.now();travel=0;speed=0;entryPose(THREE.MathUtils.clamp(elapsed/arrivalDuration,0,1));bus.visible=true;setDoor(0);passengers.forEach(p=>{p.knockdown.reset();p.rig.player.visible=false;});},
  active:()=>active,
  thankDriver(){if(!active||time>=0||thanked)return false;thanked=true;return true;},
  finish(){passengerSlots.clear();stopBattleBus();active=false;if(!departing)departTick=performance.now();departing=true;time=Math.max(time,8);setDoor(0);passengers.forEach((p,i)=>{p.rig.player.visible=true;exit(p.rig.player,p.animation,p.destination,1.05+i*.9,1.85+i*.9,0);});},
  state:()=>({departureRoute:road.map(p=>[...p]),passengerManifest:passengerSlots.state(),active,time,thanked,battleBusPlayed,battleBusFailed,battleBusPlaying:!battleBusAudio.paused,passengers:passengers.map(p=>p.knockdown.state()),phase:time<0?'arrival':explosion.age()>=0?'explosion':departing?'departure':'exit',departing,travel,doorsOpen:doorAmount>0,modelSource:"eth-link",interiorModeled:true,cabinFloor:cabin.floorHeight,cabinEye:cabin.eye.toArray(),explosionAge:explosion.age(),riverFinale,impactInWater:riverFinale&&world.isWater(waterTarget.x,waterTarget.z),arrivalDuration,fromVoid:true,voidStart:voidStart.toArray(),position:bus.position.toArray(),inCabin:active&&time<0&&time>-arrivalDuration+1.2}),
  depart(dt){passengers.forEach(p=>p.knockdown.update(dt));if(!departing)return;const now=performance.now();dt=Math.max(dt,Math.min(.5,(now-departTick)/1000));departTick=now;explosion.update(dt);if(explosion.age()>=0)return;
   speed=Math.min(13,speed+dt*4);travel=Math.min(pathLength,travel+speed*dt);const t=travel/pathLength,location=departure.sample(travel);const previous=bus.position.clone();bus.position.copy(location);bus.position.y=world.height(location.x,location.z);const motion=bus.position.clone().sub(previous);if(motion.lengthSq()>1e-8)bus.rotation.set(Math.atan2(motion.y,Math.hypot(motion.x,motion.z)),Math.atan2(-motion.x,-motion.z),0,'YXZ');
   if(world.isWater(location.x,location.z)){bus.position.y-=THREE.MathUtils.smoothstep(t,.65,1)*1.4;bus.rotation.x=-.3;}
   if(t>=1){if(riverFinale)explosion.trigger(waterTarget.clone().add(new THREE.Vector3(0,1,0)));bus.visible=false;}
  },
  update(dt,position,student,animation,camera){
   time=(performance.now()-startedAt)/1000-arrivalDuration;
   if(time<0){entryPose((time+arrivalDuration)/arrivalDuration);bus.updateMatrixWorld(true);position.copy(this.passengerPosition()??bus.localToWorld(new THREE.Vector3(.12,cabin.floorHeight,-3.6)));student.visible=false;
    if(time>-arrivalDuration+1.2){const view=rideView();camera.position.copy(view.eye);camera.up.copy(view.up);camera.lookAt(view.target);}else{const eye=bus.localToWorld(new THREE.Vector3(12,5,9)),target=bus.localToWorld(new THREE.Vector3(0,1.3,0));camera.up.set(0,1,0);camera.position.copy(eye);camera.lookAt(target);}return false;}
   // Departure owns the vehicle pose after leaving the stop.
   if(!departing)bus.rotation.set(0,busHeading,0);if(!battleBusAudio.paused)stopBattleBus();camera.up.set(0,1,0);
   if(!departing)bus.position.copy(origin);
   setDoor(THREE.MathUtils.smoothstep(time,.25,1.0)*(1-THREE.MathUtils.smoothstep(time,5.65,6.3)));
   passengers.forEach((p,i)=>{p.rig.player.visible=time>=1.05+i*.9;if(!p.knockdown.active())exit(p.rig.player,p.animation,p.destination,1.05+i*.9,1.85+i*.9,dt);});
   student.visible=time>=3.8;position.copy(exit(student,animation,start,3.8,5.6,dt));
   if(time>=6.35&&!departing){departing=true;departTick=performance.now();}
   const focus=doorPoint.clone().lerp(start,THREE.MathUtils.smoothstep(time,3.8,5.6)*.65).add(new THREE.Vector3(0,1.3,0));
   camera.position.copy(start).addScaledVector(right,6.5).addScaledVector(forward,6);camera.position.y=start.y+3.7;camera.lookAt(focus);
   if(departing){const focus=explosion.age()>=0?waterTarget:bus.position;camera.position.copy(focus).addScaledVector(right,27).addScaledVector(forward,20);camera.position.y=focus.y+14;camera.lookAt(focus.x,focus.y+2,focus.z);const shake=Math.max(0,1-explosion.age()/1.2);if(explosion.age()>=0){camera.position.x+=Math.sin(explosion.age()*77)*shake*.6;camera.position.y+=Math.cos(explosion.age()*91)*shake*.4;}}
   return riverFinale?explosion.age()>=2.4:departing&&travel>=pathLength;
  }
 };
}
