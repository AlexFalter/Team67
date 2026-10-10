import {featurePlacement,placementRoute} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {VEHICLE_SEATS} from '../../vehicles/passengers/vehicle-seats.js';
import {createVehiclePassengers} from '../../vehicles/passengers/vehicle-passengers.js';
import * as THREE from 'three';
import {createMapNavigation} from '../../world/core/map-navigation.js';
import {createGroundVehiclePath,withVehicleWalls} from '../../world/core/vehicle-path.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {createStudent} from '../../player/student-model.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Validate this tiny exercise as data: player input is never executed.
export function solvesInterviewLoop(code){
 return /^3$/.test(code.trim());
}
export async function createInterviewLimo(scene,world,solver,{onClose,onBoard,onArrive,onInvitation=()=>{},onRejection=()=>{},onEject=()=>{},obstacles=()=>[],reservedParking=[],placement }){
 placement=featurePlacement(world,'interview',placement);
 world=withVehicleWalls(world);
 const access=createWorldAccess(world,solver);
 const route=placementRoute(placement.railRoute,'interview rail clearance route');
 const ground=([x,z])=>new THREE.Vector3(x,world.height(x,z),z),start=ground(route.points[0]);
 const limo=new THREE.Group();
 const laptop=new THREE.Group();laptop.name='Unattended Jane Street laptop';scene.add(laptop);
 let site=null;
 const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);};
 const heading=start.clone().sub(ground(route.points[1])).normalize(),tail=start.clone().addScaledVector(heading,23);
 const railClearance=p=>Math.min(segmentDistance(p,[tail.x,tail.z],route.points[0]),...route.points.slice(1).map((b,i)=>segmentDistance(p,route.points[i],b)));
 search:for(const radius of [14,18,22,26])candidates:for(let i=0;i<32;i++){
  const a=i*Math.PI/16,p=start.clone().add(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));p.y=world.height(p.x,p.z);
  if(railClearance(p)<9)continue;
  for(const dx of [-1,0,1])for(const dz of [-.8,0,.8]){const q=p.clone().add(new THREE.Vector3(dx,0,dz));q.y=world.height(q.x,q.z);if(world.isWater(q.x,q.z)||world.bridgeAt(q.x,q.z)||world.blocked(q.x,q.z)||solver.penetration(q)>.01||Math.abs(q.y-p.y)>.25)continue candidates;}
  const access=placement.accessRoute.map(ground).sort((a,b)=>a.distanceToSquared(p)-b.distanceToSquared(p)).slice(0,8).find(anchor=>{
   for(let j=0;j<=16;j++){const q=p.clone().lerp(anchor,j/16);q.y=world.height(q.x,q.z);if(world.blocked(q.x,q.z)||world.isWater(q.x,q.z)||solver.penetration(q)>.01)return false;}return true;
  });if(!access)continue;
  site=p;break search;
 }
 if(!site)throw Error('No reachable laptop site at Central');laptop.position.copy(site);
 const mats=new Map();function mat(c,metal=false){const key=c+metal;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color:c,metalness:metal?.85:0,roughness:metal?.22:.6}));return mats.get(key);}
 function box(parent,x,y,z,w,h,d,c,metal=false){const mesh=new THREE.Mesh((parent===limo&&w>1&&d>1?new RoundedBoxGeometry(w,h,d,3,Math.min(.12,h*.23)):new THREE.BoxGeometry(w,h,d)),mat(c,metal));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 function label(parent,text,y,w){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#101c2e';c.fillRect(0,0,1024,128);c.fillStyle='#f7d584';c.font='bold 42px monospace';c.textAlign='center';c.fillText(text,512,82);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex}));sprite.position.y=y;sprite.scale.set(w,w/8,1);parent.add(sprite);return sprite;}
 box(laptop,0,.9,0,1.7,.1,1,'#68482c');for(const x of [-.65,.65])for(const z of [-.32,.32])box(laptop,x,.43,z,.08,.86,.08,'#c7ac72',true);
 box(laptop,0,1,0,.82,.05,.55,'#c4cad2',true);const screen=box(laptop,0,1.28,-.22,.82,.5,.035,'#172634');screen.rotation.x=-.15;
 const display=box(laptop,0,1.29,-.194,.73,.4,.008,'#55d9bc');display.rotation.x=-.15;
 for(let i=0;i<4;i++)box(laptop,0,1.034,-.1+i*.075,.64,.01,.026,'#28394a');box(laptop,0,1.034,.18,.23,.008,.07,'#7c8895');
 const terminal=document.createElement('canvas');terminal.width=512;terminal.height=256;const terminalCtx=terminal.getContext('2d');terminalCtx.fillStyle='#122438';terminalCtx.fillRect(0,0,512,256);terminalCtx.fillStyle='#e2eaf2';terminalCtx.font='32px monospace';terminalCtx.fillText('Jane Street',28,60);terminalCtx.fillStyle='#69d9b5';terminalCtx.font='24px monospace';terminalCtx.fillText('> _',28,160);const terminalTex=new THREE.CanvasTexture(terminal);terminalTex.colorSpace=THREE.SRGBColorSpace;const terminalFace=new THREE.Mesh(new THREE.PlaneGeometry(.73,.4),new THREE.MeshBasicMaterial({map:terminalTex}));terminalFace.position.set(0,1.29,-.188);terminalFace.rotation.x=-.15;laptop.add(terminalFace);
 limo.name='Jane Street’s complimentary interview limousine';limo.visible=false;scene.add(limo);
 box(limo,0,.65,0,2.1,.45,7.6,'#111827',true);box(limo,0,1.03,-2.12,2.08,.46,3.11,'#101824',true);box(limo,0,1.03,2.58,2.08,.46,2.15,'#101824',true);box(limo,-1.01,1.03,.83,.06,.46,2.8,'#101824',true);box(limo,1.01,1.03,-.15,.06,.46,.8,'#101824',true);box(limo,1.01,1.03,1.86,.06,.46,.92,'#101824',true);
 for(const seat of VEHICLE_SEATS.limousine){const [x,y,z]=seat.surface;box(limo,x,y-.07,z,.62,.14,.65,'#26333f');box(limo,x,y+.22,z+Math.cos(seat.yaw)*.29,.62,.55,.08,'#26333f');}
 box(limo,0,1.95,.15,2.03,.13,4.5,'#111827',true);box(limo,0,1.4,-2.72,2.04,.24,1.65,'#182433',true);
 box(limo,0,1.55,-2.12,1.85,.64,.05,'#193c4b');box(limo,0,1.55,2.42,1.85,.64,.05,'#193c4b');
 for(const side of [-1,1]){
  for(const z of [-1.55,-.35,.85,1.85])if(!(side===1&&z===.85))box(limo,side*1.025,1.55,z,.035,.66,.96,'#193c4b');
  for(const z of [-2.1,-1,-.0,1.35,2.42])box(limo,side*1.04,1.58,z,.05,.74,.06,'#111827',true);
  box(limo,side*1.061,1.17,0,.025,.045,6.8,'#d1ad61',true);box(limo,side*1.061,.63,0,.03,.05,7.3,'#becbd5',true);
  for(const z of [-1.5,1.35])box(limo,side*1.08,1.16,z,.05,.05,.27,'#e1c882',true);
  box(limo,side*1.19,1.47,-2.1,.28,.15,.26,'#111827',true);
 }
 const wheels=[];for(const z of [-2.7,2.6]){const axle=new THREE.Group();axle.position.set(0,.48,z);limo.add(axle);wheels.push(axle);for(const side of [-1,1]){
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(.47,.47,.24,24),mat('#0c1016'));tire.rotation.z=Math.PI/2;tire.position.x=side*1.04;axle.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.26,20),mat('#d6c497',true));hub.rotation.z=Math.PI/2;hub.position.x=side*1.05;axle.add(hub);
  for(let i=0;i<8;i++){const spoke=box(axle,side*1.2,Math.sin(i*Math.PI/4)*.16,Math.cos(i*Math.PI/4)*.16,.015,.045,.2,'#fff0c5',true);spoke.rotation.x=-i*Math.PI/4;}
 }}
 box(limo,0,1.05,-3.79,1.08,.38,.05,'#d3be89',true);for(let x=-.45;x<=.45;x+=.09)box(limo,x,1.05,-3.83,.026,.31,.03,'#24303b');
 for(const side of [-1,1]){box(limo,side*.8,1.09,-3.8,.42,.17,.06,'#fff4c9');box(limo,side*.83,1.1,3.72,.18,.29,.06,'#d93b49');}
 box(limo,0,.72,-3.8,2.13,.12,.12,'#bbc7d3',true);box(limo,0,.72,3.75,2.13,.12,.12,'#bbc7d3',true);
 label(limo,'UBER BLACK · CHF 0',2.8,4);
 const door=new THREE.Group();door.position.set(1.065,0,1.4);limo.add(door);box(door,0,1.08,-.58,.055,.45,1.12,'#111827',true);box(door,0,1.55,-.58,.05,.65,1.08,'#193c4b');
 const butlerRig=createStudent(),butler=butlerRig.player;butler.name='Limousine butler';limo.add(butler);butler.visible=false;
 butler.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(['cf633d','a9432d'].includes(c)){o.visible=false;return;}if(['f4e7cc','284b60','f0eee5','52666d'].includes(c)){o.material=o.material.clone();o.material.color.set('#171d29');}});
 box(butler,0,1.2,-.16,.15,.36,.025,'#f2f0e8');for(const side of [-1,1]){const lapel=box(butler,side*.095,1.27,-.18,.055,.21,.035,'#bec4cb');lapel.rotation.z=side*.35;box(butler,side*.044,1.39,-.183,.075,.045,.025,'#080b11');box(butler,side*.055,1.11,-.185,.02,.02,.015,'#d7be88');}
 for(const i of [0,2]){const glove=new THREE.Mesh(new THREE.SphereGeometry(.073,10,8),mat('#faf8ef'));glove.position.set(0,-.225,-.01);butlerRig.elbows[i/2].add(glove);}
 function serveDoor(t){
  butler.visible=true;const walk=THREE.MathUtils.smoothstep(t,0,1.5),open=THREE.MathUtils.smoothstep(t,1.5,2.5);
  butler.position.set(2.1,0,THREE.MathUtils.lerp(-1.6,1.65,walk));butler.rotation.y=walk<1?Math.PI:Math.PI/2;
  butlerRig.limbs[1].rotation.x=walk<1?Math.sin(t*9)*.45:0;butlerRig.limbs[3].rotation.x=-butlerRig.limbs[1].rotation.x;
  butlerRig.limbs[0].rotation.x=0;butlerRig.limbs[2].rotation.x=-open*.75;butlerRig.limbs[2].rotation.z=-open*.65;door.rotation.y=-.8*open;
 }
 const startTangent=ground(route.points[1]).sub(start).normalize(),right=new THREE.Vector3(-startTangent.z,0,startTangent.x),pickup=start.clone().addScaledVector(right,4.5);pickup.y=world.height(pickup.x,pickup.z);
 const landing=ground(placement.destination),vehicleRadius=4.5;
 const parked=[...reservedParking,...obstacles().filter(o=>o.visible).map(o=>new THREE.Box3().setFromObject(o))];
 const roadWorld={...world,bodyBlocked:(x,y,z,r,h)=>world.bodyBlocked(x,y,z,r,h)||parked.some(b=>b.min.x<=x+r&&b.max.x>=x-r&&b.min.z<=z+r&&b.max.z>=z-r&&b.min.y<=y+h&&b.max.y>=y)};
 const navigation=createMapNavigation(roadWorld,{penetration:p=>roadWorld.bodyBlocked(p.x,p.y,p.z,vehicleRadius,2.2)?1:0},{clearance:vehicleRadius});
 // The campus marker can sit inside a road island after map props change.
 // Use the nearest connected approach, rather than aborting game startup.
 let road,lastRouteError;
 searchApproach:for(const radius of [0,12,24,36])for(let i=0;i<(radius?8:1);i++){
  const angle=i*Math.PI/4,target=[landing.x+Math.cos(angle)*radius,landing.z+Math.sin(angle)*radius];
  try{road=navigation.path([pickup.x,pickup.z],target);break searchApproach;}catch(error){lastRouteError=error;}
 }
 if(!road)throw lastRouteError;
 const path=createGroundVehiclePath(roadWorld,road,{radius:vehicleRadius,height:2.2}),length=path.length;
 // End the joke at the first substantial corner, rather than driving to ETH.
 const initialDirection=path.tangent(Math.min(5,length));initialDirection.y=0;initialDirection.normalize();
 let endDistance=Math.min(length,80);
 for(let d=12;d<length;d+=.5){const direction=path.tangent(d);direction.y=0;direction.normalize();if(initialDirection.dot(direction)<Math.cos(Math.PI/4)){endDistance=d;break;}}
 pickup.copy(path.sample(0));landing.copy(path.sample(endDistance));
 const ejectRig=createStudent();scene.add(ejectRig.player);ejectRig.player.visible=false;const ejectStart=new THREE.Vector3(),drop=new THREE.Vector3(),cinematicEye=new THREE.Vector3(),sight=new THREE.Raycaster();
 let phase='idle',age=0,distance=0,speed=0,solved=false,rides=0;
 const ui=document.createElement('div');ui.id='interview-laptop';ui.hidden=true;ui.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="interview-title"><div class="interview-kicker">CODE CHALLENGE</div><h2 id="interview-title">Fill in the blank.</h2><p id="interview-hint">Print <strong>0, 1, 2</strong>. Fill in the missing number.</p><form><pre class="interview-editor"><code><span class="code-keyword">for</span> (let i = 0; i &lt; <input id="interview-code" aria-label="Missing number in the loop condition" autocomplete="off" spellcheck="false" inputmode="numeric" placeholder="___" maxlength="8" aria-describedby="interview-hint interview-feedback">; i++) {
  console.log(i);
}</code></pre><p id="interview-feedback" role="status" aria-live="polite"></p><button type="submit">RUN CODE ↗</button></form><button class="interview-close" type="button">CLOSE</button></section>`;document.body.append(ui);
 const panel=ui.querySelector('section'),form=ui.querySelector('form'),input=ui.querySelector('input'),feedback=ui.querySelector('#interview-feedback'),close=ui.querySelector('.interview-close');
 function hide(){ui.hidden=true;onClose();}
 close.onclick=()=>{if(phase==='coding'){phase='idle';hide();}};
 form.onsubmit=e=>{e.preventDefault();if(phase!=='coding')return;if(!solvesInterviewLoop(input.value)){feedback.textContent='Almost! Try another number.';input.focus();input.select();return;}
 solved=true;phase='invitation';hide();onInvitation();};
 function pose(d,reverse=false){const f=path.frame(d,reverse);limo.position.copy(f.position);limo.quaternion.copy(f.quaternion);}
 pose(0);
 const passengers=createVehiclePassengers('limousine');
 return {passengers,passengerPosition(playerId='local'){const seat=passengers.seat(playerId);if(!seat)return null;limo.updateMatrixWorld(true);return limo.localToWorld(new THREE.Vector3(...seat.position));},laptop,limo,landing,butler,door,path,active:()=>['coding','invitation','pickup','servicing','waiting','boarding','driving','arriving','stopped','rejection-read','ejecting','fleeing'].includes(phase),modal:()=>phase==='coding',riding:()=>['boarding','driving','arriving','stopped','rejection-read','ejecting','fleeing'].includes(phase),
  state:()=>({passengers:passengers.state(),phase,solved,age,distance,speed,rides,fare:0,length:endDistance,fullRouteLength:length,laptop:site.toArray(),railClearance:railClearance(site),butlerVisible:butler.visible,doorOpen:-door.rotation.y/.8,pickup:pickup.toArray(),landing:landing.toArray()}),
  requestRide(){if(phase!=='invitation')return false;phase='pickup';age=0;limo.visible=true;onClose();return true;},
  readRejection(){if(phase!=='stopped')return false;phase='rejection-read';age=0;return true;},
  interact(position){if(phase==='waiting'&&access.canInteract(position,pickup,gameConfig.npcs.interview.boardingDistance)){if(!passengers.board())return false;phase='boarding';age=0;onBoard();return true;}if(phase==='idle'&&access.canInteract(position,site,gameConfig.npcs.interview.interactionDistance)){phase='coding';ui.hidden=false;feedback.textContent='';input.focus();input.select();onClose();return true;}if(solved&&access.canInteract(position,site,gameConfig.npcs.interview.interactionDistance))return true;return false;},
  keydown(e){if(!this.modal())return false;e.stopPropagation();if(e.code==='Escape'&&phase==='coding'){e.preventDefault();close.click();}if(e.code==='Tab'){const focusable=[...panel.querySelectorAll('input,button')],first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return true;},
  update(dt,position,camera){age+=dt;if(phase==='pickup'){pose(Math.min(14,length)*(1-THREE.MathUtils.smoothstep(age,0,4)));if(age>=4){phase='servicing';age=0;pose(0);butler.visible=true;}return;}
   if(phase==='servicing'){serveDoor(age);if(age>=3){phase='waiting';age=0;}}
   if(phase==='boarding'){butler.position.x=2.1+THREE.MathUtils.smoothstep(age,0,1.2)*.7;butler.rotation.z=Math.sin(Math.min(1,age/1.2)*Math.PI)*.15;door.rotation.y=-.8*(1-THREE.MathUtils.smoothstep(age,0,1.2));if(age>=1.2){phase='driving';age=0;butler.visible=false;butler.rotation.z=0;}}
   if(phase==='driving'){speed=Math.min(24,speed+dt*5,Math.sqrt(Math.max(0,2*5*(endDistance-distance))));distance=Math.min(endDistance,distance+Math.max(.5,speed)*dt);pose(distance);wheels.forEach(w=>w.rotation.x+=speed*dt/.47);if(distance>=endDistance){phase='arriving';age=0;speed=0;}}
   if(this.riding()){position.copy(this.passengerPosition()??limo.position);const eye=limo.localToWorld(new THREE.Vector3(7,4.6,8)),target=limo.localToWorld(new THREE.Vector3(0,1,-1));const view=eye.clone().sub(target),viewDistance=view.length();sight.set(target,view.normalize());sight.near=.25;sight.far=viewDistance;const hit=sight.intersectObjects([...world.buildings,world.groundMesh],true)[0];if(hit)eye.copy(target).addScaledVector(view,Math.max(.4,hit.distance-.35));camera.up.set(0,1,0);camera.position.copy(eye);camera.lookAt(target);}
   if(phase==='arriving'){phase='stopped';age=0;door.rotation.y=0;onRejection();}
   if(phase==='rejection-read'&&age>=2.4){passengers.leave();phase='ejecting';age=0;door.rotation.y=-1.1;ejectStart.copy(limo.localToWorld(new THREE.Vector3(.3,.65,.8)));drop.copy(landing);
    search:for(const radius of [4,5,6,8,10])for(let i=0;i<24;i++){const a=i*Math.PI/12,p=landing.clone().add(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));p.y=world.height(p.x,p.z);if(!world.blocked(p.x,p.z)&&!world.isWater(p.x,p.z)&&solver.penetration(p)<.01&&!obstacles().some(o=>o.visible&&new THREE.Box3().setFromObject(o).expandByScalar(.8).containsPoint(p.clone().add(new THREE.Vector3(0,1,0))))){drop.copy(p);break search;}}
    const target=drop.clone().add(new THREE.Vector3(0,1.5,0));cinematicEye.copy(target).add(new THREE.Vector3(0,12,.1));for(let i=0;i<16;i++){const a=i*Math.PI/8,eye=target.clone().add(new THREE.Vector3(Math.cos(a)*9,5,Math.sin(a)*9)),direction=eye.clone().sub(target);sight.set(target,direction.clone().normalize());sight.near=.3;sight.far=direction.length();if(!sight.intersectObjects([...world.buildings,...obstacles().filter(o=>o.visible).flatMap(o=>{const meshes=[];o.traverse(m=>{if(m.isMesh&&m.visible)meshes.push(m);});return meshes;})],false).length){cinematicEye.copy(eye);break;}}
    ejectRig.player.visible=true;onEject();}
   if(phase==='ejecting'){const t=THREE.MathUtils.clamp(age/1.3,0,1);ejectRig.player.position.lerpVectors(ejectStart,drop,t);ejectRig.player.position.y+=Math.sin(t*Math.PI)*1.7;ejectRig.player.rotation.set(Math.sin(t*Math.PI)*1.1,limo.rotation.y,-Math.sin(t*Math.PI)*1.2);ejectRig.limbs.forEach((l,i)=>l.rotation.x=Math.sin(t*Math.PI)*(i%2?-.8:1.5));position.copy(ejectRig.player.position);if(t>=1){phase='fleeing';age=0;door.rotation.y=0;speed=0;}}
   if(phase==='fleeing'){speed=Math.min(48,speed+dt*28);distance=Math.max(0,distance-speed*dt);pose(distance,true);wheels.forEach(w=>w.rotation.x-=speed*dt/.47);position.copy(drop);ejectRig.player.position.copy(drop);ejectRig.player.rotation.z=0;if(age>=3||distance===0){phase='complete';rides++;limo.visible=false;ejectRig.player.visible=false;onArrive(drop.clone());}}
   if(['ejecting','fleeing'].includes(phase)){camera.up.set(0,1,0);camera.position.copy(cinematicEye);camera.lookAt(ejectRig.player.position.clone().add(new THREE.Vector3(0,1,0)));}

  },
  reset(){passengers.clear();ejectRig.player.visible=false;phase='idle';age=0;distance=0;speed=0;solved=false;rides=0;limo.visible=false;butler.visible=false;butler.rotation.z=0;door.rotation.y=0;ui.hidden=true;pose(0);input.value='';feedback.textContent='';onClose();}
 };
}
