import {featurePlacement,placementRoute} from '../../world/placements/feature-placement.js';
import {VEHICLE_SEATS} from '../passengers/vehicle-seats.js';
import {createPassengerActors} from '../passengers/vehicle-passenger-actors.js';
import {createVehiclePassengers} from '../passengers/vehicle-passengers.js';
import {AISLE_LIMIT} from './polybahn-seated.js';
import * as THREE from 'three';
import {addPolybahnInterior} from './polybahn-interior.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {loadTransitModel} from './transit-models.js';
import {createPolybahnPath} from './polybahn-motion.js';
import {createMapNavigation} from '../../world/core/map-navigation.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export async function createPolybahn(scene,world,solver,{placement}={}){
 placement=featurePlacement(world,'polybahn',placement);
 const access=createWorldAccess(world,solver);
 const data=placementRoute(placement.route,'Polybahn route');
 // Keep the original city intact: place station props on clear native ground.
 function platform(source){for(let radius=0;radius<40;radius+=2)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/16){const x=source[0]+Math.cos(angle)*radius,z=source[1]+Math.sin(angle)*radius;let clear=true;for(let dx=-4;dx<=4;dx+=1)for(let dz=-3;dz<=3;dz+=1){const p=new THREE.Vector3(x+dx,world.height(x+dx,z+dz),z+dz);if(world.blocked(p.x,p.z)||solver.penetration(p)>.01)clear=false;}if(clear)return [x,z];}throw Error('No clear native Polybahn platform');}
 const original=data.points,exterior=[platform(original[0]),platform(original.at(-1))],lower=original[0],upper=original.at(-1);
 const native=p=>new THREE.Vector3(p[0],world.ground(...p),p[1]),stationNodes=original.map(native);
 const firstDirection=stationNodes[1].clone().sub(stationNodes[0]).normalize(),lastDirection=stationNodes.at(-1).clone().sub(stationNodes.at(-2)).normalize();
 const tunnelNodes=[stationNodes[0].clone().addScaledVector(firstDirection,-6),...stationNodes,stationNodes.at(-1).clone().addScaledVector(lastDirection,6)];
 const passages=tunnelNodes.slice(1).map((b,i)=>({a:tunnelNodes[i],b,width:3.6,clearance:4.4}));
 for(const [i,p] of exterior.entries())passages.push({a:native(p),b:stationNodes[i?stationNodes.length-1:0],width:1.7,clearance:3.3});
 const cutTriangles=world.addStationPassages(passages);
 const points=[];for(let i=1;i<original.length;i++){const a=original[i-1],b=original[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));if(i===1)points.push(a);for(let j=1;j<=steps;j++)points.push([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]);}data.points=points;
 const trackHeights=points.map(p=>world.ground(...p)),trackNodes=points.map((p,i)=>new THREE.Vector3(p[0],trackHeights[i],p[1]));
 const path=createPolybahnPath(trackNodes),total=path.length,sample=path.sample;
 const cream=new THREE.MeshStandardMaterial({color:'#eee5cc'}),metal=new THREE.MeshStandardMaterial({color:'#6d7579'});
 function box(g,x,y,z,w,h,d,m){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);}
 function rod(g,a,b,r,m){const d=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),m);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());g.add(mesh);}

 const entrances=[lower,upper].map(p=>new THREE.Vector3(p[0],world.height(...p),p[1])),cars=[];
 const navigation=createMapNavigation(world,solver),nearest=p=>placement.accessRoute.reduce((a,b)=>Math.hypot(b[0]-p.x,b[1]-p.z)<Math.hypot(a[0]-p.x,a[1]-p.z)?b:a);
 const accessPaths=entrances.map((p,i)=>[...navigation.path(nearest(native(exterior[i])),exterior[i]),[p.x,p.z]]);

 function station(point,name){const g=new THREE.Group();g.position.copy(point);const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#9f1d2f';ctx.fillRect(0,0,768,128);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 34px Arial';ctx.fillText(name,384,55);ctx.font='26px Arial';ctx.fillText('BUY A TICKET · E TO BOARD',384,102);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false,depthTest:false}));sign.position.y=3.6;sign.scale.set(7,7/6,1);g.add(sign);box(g,0,1.5,0,.12,3,.12,metal);scene.add(g);}

 const makeCar=await loadTransitModel('polybahn');
 for(let i=0;i<2;i++){const g=makeCar();scene.add(g);cars.push(g);addPolybahnInterior(g);}
 const rails=new THREE.Group();for(let d=0;d<total;d+=3)for(const lane of [-1.25,1.25])for(const side of [-.5,.5]){const a=sample(d,lane),b=sample(Math.min(total,d+3),lane),delta=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-delta.z,0,delta.x);a.addScaledVector(normal,side);b.addScaledVector(normal,side);rod(rails,a,b,.035,metal);}for(let d=0;d<total;d+=6){const a=sample(d),b=sample(Math.min(total,d+6));a.y+=.13;b.y+=.13;rod(rails,a,b,.025,metal);}const geometries=rails.children.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);}),merged=mergeGeometries(geometries);rails.clear();rails.add(new THREE.Mesh(merged,metal));geometries.forEach(g=>g.dispose());scene.add(rails);
 const ticketPoints=entrances.slice(0,1).map((entry,index)=>{
  for(const offset of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,-3]]){const x=entry.x+offset[0],z=entry.z+offset[1],p=new THREE.Vector3(x,world.height(x,z),z);if(!world.blocked(x,z)&&!world.isWater(x,z)&&solver.penetration(p)<.01&&Array.from({length:9},(_,j)=>{const q=entry.clone().lerp(p,j/8);q.y=world.height(q.x,q.z);return !world.blocked(q.x,q.z)&&!world.isWater(q.x,q.z)&&solver.penetration(q)<.01;}).every(Boolean))return p;}
  throw new Error('No safe Polybahn ticket pickup');
 });
 station(ticketPoints[0],'CENTRAL / POLYBAHN');station(entrances[1],'POLYTERRASSE ETH');
 const gold=new THREE.MeshStandardMaterial({color:'#ffd174',roughness:.5}),navy=new THREE.MeshStandardMaterial({color:'#183847',roughness:.6});
 const silver=new THREE.MeshStandardMaterial({color:'#bdc6cd',metalness:.65,roughness:.35}),red=new THREE.MeshStandardMaterial({color:'#d62935'}),dark=new THREE.MeshStandardMaterial({color:'#09151c'});
 const ticketProps=ticketPoints.map((point,i)=>{
  const g=new THREE.Group();g.name=`Polybahn ticket machine ${i+1}`;g.position.copy(point);
  box(g,0,.12,0,.88,.24,.64,silver);box(g,0,1.37,0,.82,1.22,.56,silver);box(g,0,1.94,0,.82,.12,.56,red);
  box(g,-.37,.50,0,.08,.52,.56,silver);box(g,.37,.50,0,.08,.52,.56,silver);box(g,0,.50,.20,.66,.52,.12,silver);
  box(g,0,1.46,-.29,.65,.58,.025,dark);box(g,0,1.46,-.31,.55,.46,.025,navy);
  box(g,.20,.96,-.30,.21,.16,.06,dark);box(g,.20,.96,-.34,.16,.025,.015,gold);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)box(g,-.22+col*.06,1.04-row*.06,-.30,.045,.04,.035,dark);
  box(g,0,.32,-.36,.68,.035,.34,silver);box(g,0,.72,-.29,.68,.06,.08,dark);
  const slot=new THREE.Mesh(new THREE.BoxGeometry(.65,.34,.025),dark);slot.name='Ticket collection box';slot.position.set(0,.52,-.265);g.add(slot);
  const paper=document.createElement('canvas');paper.width=512;paper.height=256;const pc=paper.getContext('2d');pc.fillStyle='#fff8e5';pc.fillRect(0,0,512,256);pc.fillStyle='#cd2635';pc.fillRect(0,0,512,40);pc.fillStyle='#172b38';pc.font='bold 44px Arial';pc.fillText('POLYBAHN',28,100);pc.font='28px Arial';pc.fillText('1 JOURNEY · CHF 1.20',28,150);for(let n=0;n<65;n++)pc.fillRect(28+n*7,180,n%3===0?4:2,48);
  const texture=new THREE.CanvasTexture(paper);texture.colorSpace=THREE.SRGBColorSpace;
  const ticket=new THREE.Mesh(new THREE.PlaneGeometry(.44,.22),new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide}));ticket.rotation.x=-Math.PI/2;ticket.rotation.z=Math.PI;ticket.position.set(0,.51,-.30);ticket.visible=false;ticket.name='Printed Polybahn ticket';g.add(ticket);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#122c38';ctx.fillRect(0,0,512,256);ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='bold 54px Arial';ctx.fillText('POLYBAHN',256,75);ctx.font='36px Arial';ctx.fillText('Tickets / Billette',256,140);ctx.fillStyle='#ffd174';ctx.fillText('E · CHF 1.20',256,210);const screenTexture=new THREE.CanvasTexture(canvas);screenTexture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.54,.45),new THREE.MeshBasicMaterial({map:screenTexture}));screen.rotation.y=Math.PI;screen.position.set(0,1.46,-.33);g.add(screen);
  scene.add(g);return {group:g,ticket,slot,screen};
 });
 const passengers=createVehiclePassengers('polybahn');
 const passengerLocal=new THREE.Vector3(0,.54,.3);let transition=null,passenger=null;
 let distance=0,destination=total,speed=0,aboard=false,arrived=false,moving=false,phase='idle',phaseAge=0,rideAge=0,ticketCount=0,tripTicketed=false,inspectionPending=false,inspected=false,view=null,time=0;
 const syncPassengerActors=createPassengerActors(scene,passengers,slot=>{const seat=VEHICLE_SEATS.polybahn[slot],car=cars[seat.part];car.updateMatrixWorld(true);return {position:car.localToWorld(new THREE.Vector3(...seat.position)),quaternion:car.quaternion,yaw:seat.yaw,kind:seat.kind};});
 const doors=cars.map(car=>[-1,1].flatMap(side=>[-1,1].map(leaf=>({node:car.getObjectByName(`Door_${side}_${leaf}`),leaf}))));
 const axles=cars.map(car=>['front','rear'].map(name=>car.getObjectByName(`Axle_${name}`)));
 if(doors.flat().some(d=>!d.node)||axles.flat().some(a=>!a))throw new Error('Polybahn model is missing its door or wheel pivots');
 function pose(){for(let i=0;i<2;i++){const d=i?total-distance:distance,f=path.frame(d,i?-1.25:1.25);cars[i].position.copy(f.position);cars[i].position.y+=.04;cars[i].quaternion.copy(f.quaternion);
   axles[i].forEach(a=>a.rotation.x=(i?-distance:distance)/.24);
   const openness=phase==='waiting'||phase==='boarding'||phase==='disembarking'?1:phase==='closing'?1-THREE.MathUtils.smoothstep(phaseAge,0,.9):phase==='opening'?THREE.MathUtils.smoothstep(phaseAge,0,.9):phase==='idle'?1:0;
   doors[i].forEach(d=>d.node.position.z=d.leaf*openness*.52);
  }cars.forEach(c=>c.updateMatrixWorld(true));syncPassengerActors();
 }
 function reserveSeats(){passengers.clear();VEHICLE_SEATS.polybahn.forEach((seat,slot)=>{if(seat.reservedFor)passengers.board(seat.reservedFor,slot);});}
 function reset(){reserveSeats();distance=0;destination=total;speed=0;aboard=false;arrived=false;moving=false;phase='idle';phaseAge=0;rideAge=0;ticketCount=0;tripTicketed=false;inspectionPending=false;inspected=false;view=null;time=0;transition=null;passenger=null;passengerLocal.set(0,.54,.3);pose();}
 reset();
 function doorPoints(){cars[0].updateMatrixWorld(true);return [-1,1].map(side=>{const p=cars[0].localToWorld(new THREE.Vector3(side*1.65,.54,0));p.y=world.height(p.x,p.z);return p;});}
 function cabinPosition(){return cars[0].localToWorld(passengerLocal.clone());}
 function stepTransition(){const t=THREE.MathUtils.smoothstep(phaseAge,0,2),scaled=t*2,index=scaled<1?0:1;passenger=transition[index].clone().lerp(transition[index+1],Math.min(1,scaled-index));}
 function stationDoor(index){const f=path.frame(index?total:0,1.25);const points=[-1,1].map(side=>{const p=new THREE.Vector3(side*1.65,.54,0).applyQuaternion(f.quaternion).add(f.position);p.y=world.height(p.x,p.z);return p;});return points.find(p=>!world.isWater(p.x,p.z)&&solver.penetration(p)<.01)??points[0];}
 return {passengers,passengerPosition(playerId='local'){const slot=passengers.slot(playerId);if(slot===null)return null;cars[0].updateMatrixWorld(true);return cars[0].localToWorld(new THREE.Vector3(...VEHICLE_SEATS.polybahn[slot].position));},data,entrances,accessPaths,cutTriangles,ticketPoints,ticketProps,cars,path,
  nearTicketIndex:pos=>ticketPoints.findIndex(p=>access.canInteract(pos,p,1.65)),
  collectTicket(pos){if(ticketCount)return false;const index=ticketPoints.findIndex(p=>access.canInteract(pos,p,1.65));if(index<0)return false;ticketCount=1;return true;},
  rideView(dt=.016){const car=cars[0],direction=destination>total/2?1:-1,seated=passengerLocal.y<.54,seatYaw=passengers.seat()?.yaw??0,eyeHeight=seated?1.5875:1.42;car.updateMatrixWorld(true);const transitioning=phase==='boarding'||phase==='disembarking',eye=transitioning?(passenger??cabinPosition()).clone().add(new THREE.Vector3(4,3,4)):car.localToWorld(passengerLocal.clone().add(new THREE.Vector3(0,eyeHeight,0))),target=transitioning?(passenger??cabinPosition()).clone().add(new THREE.Vector3(0,1,0)):car.localToWorld(passengerLocal.clone().add(new THREE.Vector3(seated?-Math.sin(seatYaw)*5:0,eyeHeight,seated?-Math.cos(seatYaw)*5:-5*direction))),up=new THREE.Vector3(0,1,0).applyQuaternion(car.quaternion);
   if(!view||dt===0)view={eye:eye.clone(),target:target.clone()};const alpha=1-Math.exp(-10*Math.max(0,dt));view.eye.lerp(eye,alpha);view.target.lerp(target,alpha);return {eye:view.eye,target:view.target,up};
  },
  reset,
  movePassenger(dx,dz,dt){
   if(dx===0&&dz===0)return;
   if(!aboard||['boarding','disembarking','inspection'].includes(phase)||!Number.isFinite(dx+dz+dt))return;
   passengerLocal.y=.54;
   const nextZ=THREE.MathUtils.clamp(passengerLocal.z+dz*Math.max(0,dt),-2,2);
   // Slide into the clear centre aisle when passing a seated passenger's feet.
   const crosses=z=>Math.min(passengerLocal.z,nextZ)<=z+.45&&Math.max(passengerLocal.z,nextZ)>=z-.45;
   const left=crosses(1.2)?-.02:-AISLE_LIMIT,right=crosses(-1.35)?.02:AISLE_LIMIT;
   passengerLocal.x=THREE.MathUtils.clamp(passengerLocal.x+dx*Math.max(0,dt),left,right);
   passengerLocal.z=nextZ;
  },
  board(pos,camera,playerId='local'){const index=distance>total/2?1:0,door=doorPoints().sort((a,b)=>a.distanceTo(pos)-b.distanceTo(pos))[0];if(['idle','boarding','waiting'].includes(phase)&&access.canInteract(pos,door,1.5)){if(!passengers.board(playerId))return false;if(moving&&playerId!=='local')return true;const joining=moving;passengers.beginBoarding();passengerLocal.fromArray(passengers.seat()?.position??[0,.54,.3]);destination=index?0:total;aboard=passengers.slot('local')!==null;arrived=false;moving=true;phase=joining?'waiting':'boarding';phaseAge=0;rideAge=0;tripTicketed=playerId==='local'&&ticketCount>0;if(tripTicketed)ticketCount--;inspectionPending=false;inspected=false;passenger=pos.clone();transition=[pos.clone(),door.clone().setY(cabinPosition().y),cabinPosition()];if(joining){transition=null;passenger=null;}view=camera?{eye:camera.position.clone(),target:pos.clone().add(new THREE.Vector3(0,1,0))}:null;return true;}return false;},
  resolveInspection(camera){if(!inspectionPending)return;inspectionPending=false;inspected=true;phaseAge=0;view=camera?{eye:camera.position.clone(),target:camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()),3)}:null;},
  update(dt){dt=Number.isFinite(dt)?Math.max(0,dt):0;time+=dt;
   if(moving){phaseAge+=dt;passengers.tick(dt);
    if(phase==='boarding'){stepTransition();if(phaseAge>=2){phase='waiting';phaseAge=0;transition=null;passenger=null;}}
    else if(phase==='waiting'&&passengers.state().departureIn===0){passengers.closeBoarding();phase='closing';phaseAge=0;}
    else if(phase==='disembarking'){stepTransition();if(phaseAge>=2){phase='idle';phaseAge=0;moving=false;arrived=true;aboard=false;const localRode=passengers.slot('local')!==null;reserveSeats();inspectionPending=localRode&&!tripTicketed&&!inspected;transition=null;}}
    else if(phase==='closing'&&phaseAge>=.9){phase='travelling';phaseAge=0;}
    else if(phase==='opening'&&phaseAge>=.9){phase='disembarking';phaseAge=0;const landing=stationDoor(destination>0?1:0);transition=[cabinPosition(),landing.clone().setY(cabinPosition().y),landing];passenger=cabinPosition();}
    if(phase==='travelling'){
     rideAge+=dt;const remaining=Math.abs(destination-distance),target=Math.min(8,Math.sqrt(6*remaining)),rate=speed>target?3:2.5;speed+=THREE.MathUtils.clamp(target-speed,-rate*dt,rate*dt);const step=Math.min(remaining,speed*dt);distance+=Math.sign(destination-distance)*step;
     if(Math.abs(destination-distance)<.04){distance=destination;speed=0;phase='opening';phaseAge=0;}
    }
    pose();
   }
   return {aboard,arrived,position:passenger??cabinPosition(),landing:passenger??stationDoor(destination>0?1:0),speed,inspectionRequired:inspectionPending};
  },
  state(){return {passengers:passengers.state(),departureIn:passengers.state().departureIn,aboard,arrived,moving,phase,distance,destination,length:total,speed,ticketCount,tripTicketed,inspectionPending,inspected,doorsOpen:['idle','boarding','waiting','opening','disembarking'].includes(phase),doorAmount:Math.abs(doors[0][0].node.position.z)/.52,carPitch:new THREE.Euler().setFromQuaternion(cars[0].quaternion,'YXZ').x,start:stationDoor(0).toArray(),end:stationDoor(1).toArray(),passengerLocal:passengerLocal.toArray(),stationAccess:entrances.map(p=>p.toArray()),transitioning:phase==='boarding'||phase==='disembarking',ticketPickups:ticketPoints.map(p=>p.toArray())};}
 };
}
