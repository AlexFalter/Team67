import {helicopterEjectionPose,EJECTION_DURATION} from './helicopter-ejection.js';
import {createLimousineLook} from './limousine-look.js';
import {createInterviewHelicopter,createParachute} from './helicopter-model.js';
import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {featurePlacement,placementRoute} from '../../world/placements/feature-placement.js';
import {gameConfig} from '../../config/game-config.js';
import {VEHICLE_SEATS} from '../../vehicles/passengers/vehicle-seats.js';
import {createVehiclePassengers} from '../../vehicles/passengers/vehicle-passengers.js';
import * as THREE from 'three';

import {withVehicleWalls} from '../../world/core/vehicle-path.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {createStudent} from '../../player/student-model.js';
import {createFlightAvatar} from '../../../../multiplayer/flightAvatar.ts';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Validate this tiny exercise as data: player input is never executed.
export function solvesInterviewLoop(code){
 return /^3$/.test(code.trim());
}
export async function createInterviewLimo(scene,world,solver,{onClose,onBoard,onArrive,onInvitation=()=>{},onRejection=()=>{},onEject=()=>{},canCapture=()=>true,onLanding=()=>{},landingCamera=()=>{},playerAppearance=()=>({color:'#ffffff',character:0}),obstacles=()=>[],reservedParking=[],placement,uiRoot=document.body,renderCanvas }){
 placement=featurePlacement(world,'interview',placement);
 world=withVehicleWalls(world);
 const access=createWorldAccess(world,solver);
 const route=placementRoute(placement.railRoute,'interview rail clearance route');
 const ground=([x,z])=>new THREE.Vector3(x,world.height(x,z),z),start=ground(route.points[0]);
 const helicopter=createInterviewHelicopter(),limo=helicopter.root;
 const laptop=new THREE.Group();laptop.name='Unattended Jane Street laptop';scene.add(laptop);
 let site=new THREE.Vector3(...placement.fixedLaptop);
 const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);};
 const heading=start.clone().sub(ground(route.points[1])).normalize(),tail=start.clone().addScaledVector(heading,23);
 const railClearance=p=>Math.min(segmentDistance(p,[tail.x,tail.z],route.points[0]),...route.points.slice(1).map((b,i)=>segmentDistance(p,route.points[i],b)));
 search:for(const radius of (site?[]:[14,18,22,26]))candidates:for(let i=0;i<32;i++){
  const a=i*Math.PI/16,p=start.clone().add(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));p.y=world.height(p.x,p.z);
  if(railClearance(p)<9)continue;
  for(const dx of [-1,0,1])for(const dz of [-.8,0,.8]){const q=p.clone().add(new THREE.Vector3(dx,0,dz));q.y=world.height(q.x,q.z);if(world.isWater(q.x,q.z)||world.bridgeAt(q.x,q.z)||world.blocked(q.x,q.z)||solver.penetration(q)>.01||Math.abs(q.y-p.y)>.25)continue candidates;}
  const access=placement.accessRoute.map(ground).sort((a,b)=>a.distanceToSquared(p)-b.distanceToSquared(p)).slice(0,8).find(anchor=>{
   for(let j=0;j<=16;j++){const q=p.clone().lerp(anchor,j/16);q.y=world.height(q.x,q.z);if(world.blocked(q.x,q.z)||world.isWater(q.x,q.z)||solver.penetration(q)>.01)return false;}return true;
  });if(!access)continue;
  site=p;break search;
 }
 if(!site)throw Error('No reachable laptop site at Central');laptop.position.copy(site);laptop.rotation.y=Math.PI;
 const mats=new Map();function mat(c,metal=false){const key=c+metal;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color:c,metalness:metal?.85:0,roughness:metal?.22:.6}));return mats.get(key);}
 function box(parent,x,y,z,w,h,d,c,metal=false){const mesh=new THREE.Mesh((parent===limo&&w>1&&d>1?new RoundedBoxGeometry(w,h,d,3,Math.min(.12,h*.23)):new THREE.BoxGeometry(w,h,d)),mat(c,metal));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 box(laptop,0,.9,0,1.7,.1,1,'#68482c');for(const x of [-.65,.65])for(const z of [-.32,.32])box(laptop,x,.43,z,.08,.86,.08,'#c7ac72',true);
 box(laptop,0,1,0,.82,.05,.55,'#c4cad2',true);const screen=box(laptop,0,1.28,-.22,.82,.5,.035,'#172634');screen.rotation.x=-.15;
 const display=box(laptop,0,1.29,-.194,.73,.4,.008,'#55d9bc');display.rotation.x=-.15;
 for(let i=0;i<4;i++)box(laptop,0,1.034,-.1+i*.075,.64,.01,.026,'#28394a');box(laptop,0,1.034,.18,.23,.008,.07,'#7c8895');
 const terminal=document.createElement('canvas');terminal.width=512;terminal.height=256;const terminalCtx=terminal.getContext('2d');terminalCtx.fillStyle='#122438';terminalCtx.fillRect(0,0,512,256);terminalCtx.fillStyle='#e2eaf2';terminalCtx.font='32px monospace';terminalCtx.fillText('Jane Street',28,60);terminalCtx.fillStyle='#69d9b5';terminalCtx.font='24px monospace';terminalCtx.fillText('> _',28,160);const terminalTex=new THREE.CanvasTexture(terminal);terminalTex.colorSpace=THREE.SRGBColorSpace;const terminalFace=new THREE.Mesh(new THREE.PlaneGeometry(.73,.4),new THREE.MeshBasicMaterial({map:terminalTex}));terminalFace.position.set(0,1.29,-.188);terminalFace.rotation.x=-.15;laptop.add(terminalFace);
 limo.visible=false;scene.add(limo);const door=helicopter.door;
 const pilot=createStudent();pilot.player.name='Interview helicopter pilot';pilot.player.position.set(-.58,.25,-1.05);for(const i of [1,3])pilot.limbs[i].rotation.x=1.4;pilot.knees.forEach(joint=>joint.rotation.x=-1.4);for(const i of [0,2])pilot.limbs[i].rotation.x=-.8;limo.add(pilot.player);
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
 const landing=ground(placement.fixedRoad?.at(-1)??placement.destination);
 if(placement.fixedRoad)pickup.copy(ground(placement.fixedRoad[0]));
 const length=pickup.distanceTo(landing),endDistance=length,cruise=Math.max(pickup.y,landing.y)+42;
 const path={length,sample:d=>pickup.clone().lerp(landing,THREE.MathUtils.clamp(d/length,0,1)),tangent:()=>landing.clone().sub(pickup).normalize()};
 const approachPath=null;
 const chute=createParachute();scene.add(chute);chute.visible=false;
 const chuteHint=document.createElement('div');chuteHint.className='limo-look-hint';chuteHint.hidden=true;chuteHint.style.bottom='140px';uiRoot.append(chuteHint);
 const flightKeys=new Set(),flightAbort=new AbortController();window.addEventListener('keyup',e=>flightKeys.delete(e.code),{signal:flightAbort.signal});window.addEventListener('blur',()=>flightKeys.clear(),{signal:flightAbort.signal});
 let fallSpeed=0,deployed=false;
 const throwOrigin=new THREE.Vector3(),throwOrientation=new THREE.Quaternion(),throwEye=new THREE.Vector3(),throwCameraRotation=new THREE.Quaternion();
 const ejectRig=createFlightAvatar(playerAppearance);let ejectPlayer;const ejectStart=new THREE.Vector3(),drop=new THREE.Vector3(),landingEye=new THREE.Vector3(),landingRotation=new THREE.Quaternion();
 let phase='idle',age=0,distance=0,speed=0,solved=false,rides=0;
 const ui=document.createElement('div');ui.id='interview-laptop';ui.hidden=true;ui.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="interview-title"><div class="interview-kicker">CODE CHALLENGE</div><h2 id="interview-title">Fill in the blank.</h2><p id="interview-hint">Print <strong>0, 1, 2</strong>. Fill in the missing number.</p><form><pre class="interview-editor"><code><span class="code-keyword">for</span> (let i = 0; i &lt; <input id="interview-code" aria-label="Missing number in the loop condition" autocomplete="off" spellcheck="false" inputmode="numeric" placeholder="___" maxlength="8" aria-describedby="interview-hint interview-feedback">; i++) {
  console.log(i);
}</code></pre><p id="interview-feedback" role="status" aria-live="polite"></p><button type="submit">RUN CODE ↗</button></form><button class="interview-close" type="button">CLOSE</button></section>`;uiRoot.append(ui);
 const panel=ui.querySelector('section'),form=ui.querySelector('form'),input=ui.querySelector('input'),feedback=ui.querySelector('#interview-feedback'),close=ui.querySelector('.interview-close');
 function hide(){ui.hidden=true;onClose();}
 close.onclick=()=>{if(phase==='coding'){phase='idle';hide();}};
 form.onsubmit=e=>{e.preventDefault();if(phase!=='coding')return;if(!solvesInterviewLoop(input.value)){feedback.textContent='Almost! Try another number.';input.focus();input.select();return;}
 solved=true;phase='invitation';hide();onInvitation();};
 function pose(d,reverse=false){limo.position.copy(path.sample(d));const direction=path.tangent();limo.rotation.set(0,Math.atan2(-direction.x,-direction.z)+(reverse?Math.PI:0),0,'YXZ');}
 pose(0);
 let ejectionStage=null;
 const passengers=createVehiclePassengers('limousine');
 const positionHeight=()=>limo.position.y-world.height(limo.position.x,limo.position.z);
 const seated=()=>['boarding','takeoff','driving','arriving','stopped','rejection-read'].includes(phase);
 const rideLook=createLimousineLook(renderCanvas,{active:()=>canCapture()&&(seated()||phase==='parachuting'||phase==='landing'),label:'HELICOPTER'});
 return {dispose(){this.reset();flightAbort.abort();chuteHint.remove();disposeOwnedObject(chute);rideLook.dispose();ui.remove();disposeOwnedObject(laptop);disposeOwnedObject(limo);ejectRig.dispose();},setLanding:target=>landing.copy(target),parachute:chute,passengers,passengerPosition(playerId='local'){const seat=passengers.seat(playerId);if(!seat)return null;limo.updateMatrixWorld(true);return limo.localToWorld(new THREE.Vector3(...seat.position));},laptop,limo,landing,butler,door,path,approachPath,active:()=>['coding','invitation','pickup','servicing','waiting','boarding','takeoff','driving','arriving','stopped','rejection-read','ejecting','parachuting','landing'].includes(phase),modal:()=>phase==='coding',riding:()=>['boarding','takeoff','driving','arriving','stopped','rejection-read','ejecting','parachuting','landing'].includes(phase),
  state:()=>({rideView:rideLook.state(),passengers:passengers.state(),phase,solved,age,distance,speed,rides,fare:0,length:endDistance,fullRouteLength:length,laptop:site.toArray(),railClearance:railClearance(site),ejectionStage,deployed,altitude:positionHeight(),butlerVisible:butler.visible,doorOpen:-door.rotation.y/.8,pickup:pickup.toArray(),landing:landing.toArray()}),
  requestRide(){if(phase!=='invitation')return false;phase='pickup';age=0;distance=0;speed=0;pose(0);limo.position.y=cruise;limo.visible=true;onClose();return true;},
  readRejection(){if(phase!=='stopped')return false;phase='rejection-read';age=0;return true;},
  pauseLook(){rideLook.pause();flightKeys.clear();},
  resumeLook(){return rideLook.resumeCapture();},
  interact(position){if(phase==='waiting'&&access.canInteract(position,pickup,gameConfig.npcs.interview.boardingDistance)){if(!passengers.board())return false;phase='boarding';age=0;rideLook.reset();onBoard();return true;}if(phase==='idle'&&access.canInteract(position,site,gameConfig.npcs.interview.interactionDistance)){phase='coding';ui.hidden=false;feedback.textContent='';input.focus();input.select();onClose();return true;}if(solved&&access.canInteract(position,site,gameConfig.npcs.interview.interactionDistance))return true;return false;},
  keydown(e){if(phase==='parachuting'&&['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){flightKeys.add(e.code);if(e.code==='Space')deployed=true;return true;}if(rideLook.keydown(e))return true;if(!this.modal())return false;e.stopPropagation();if(e.code==='Escape'&&phase==='coding'){e.preventDefault();close.click();}if(e.code==='Tab'){const focusable=[...panel.querySelectorAll('input,button')],first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return true;},
  update(dt,position,camera){if(!canCapture())flightKeys.clear();age+=dt;if(limo.visible)helicopter.update(dt);if(phase==='pickup'){
    pose(0);limo.position.y=THREE.MathUtils.lerp(cruise,pickup.y,THREE.MathUtils.smoothstep(age,0,6));
    if(age>=6){phase='servicing';age=0;pose(0);butler.visible=true;}return;
   }
   if(phase==='servicing'){serveDoor(age);if(age>=3){phase='waiting';age=0;}}
   if(phase==='boarding'){butler.position.x=2.1+THREE.MathUtils.smoothstep(age,0,1.2)*.7;butler.rotation.z=Math.sin(Math.min(1,age/1.2)*Math.PI)*.15;door.rotation.y=-.8*(1-THREE.MathUtils.smoothstep(age,0,1.2));if(age>=1.2){phase='takeoff';age=0;butler.visible=false;butler.rotation.z=0;}}
   if(phase==='takeoff'){pose(0);limo.position.y=THREE.MathUtils.lerp(pickup.y,cruise,THREE.MathUtils.smoothstep(age,0,5));if(age>=5){phase='driving';age=0;}}
   if(phase==='driving'){speed=Math.min(22,speed+dt*4,Math.sqrt(Math.max(0,2*4*(endDistance-distance))));distance=Math.min(endDistance,distance+Math.max(.5,speed)*dt);pose(distance);limo.position.y=cruise;limo.rotation.x=-Math.min(.12,speed*.004);if(distance>=endDistance){phase='arriving';age=0;speed=0;limo.rotation.x=0;}}
   if(seated()){position.copy(this.passengerPosition()??limo.position);rideLook.update(dt,limo,camera,passengers.seat()??VEHICLE_SEATS.limousine[0],world);}
   if(phase==='arriving'){phase='stopped';age=0;door.rotation.y=0;onRejection();}
   if(phase==='rejection-read'&&age>=2.4){ejectStart.copy(position);throwOrigin.copy(limo.position);throwOrientation.copy(limo.quaternion);throwEye.copy(camera.position);throwCameraRotation.copy(camera.quaternion);passengers.leave();phase='ejecting';age=0;door.rotation.y=-1.1;ejectPlayer=ejectRig.start(scene);drop.copy(landing);ejectionStage='throw';rideLook.pause();onEject();}
   if(phase==='ejecting'){
    const t=THREE.MathUtils.clamp(age/EJECTION_DURATION,0,1),pose=helicopterEjectionPose(age,ejectStart,throwOrigin,throwOrientation);
    position.copy(pose.position);ejectPlayer.position.copy(position);ejectPlayer.rotation.set(0,limo.rotation.y,pose.roll);
    ejectRig.pose(t,false,age<.2&&rideLook.state().firstPerson);
    butler.visible=true;butler.position.set(.65,.8,.8);butler.rotation.y=-Math.PI/2;butlerRig.limbs[2].rotation.x=-1.2*Math.sin(t*Math.PI);
    const eye=new THREE.Vector3(7,3,4).applyQuaternion(throwOrientation).add(position);
    camera.position.copy(throwEye).lerp(eye,THREE.MathUtils.smoothstep(age,0,.4));camera.lookAt(position.clone().add(new THREE.Vector3(0,1,0)));camera.quaternion.slerp(throwCameraRotation,1-THREE.MathUtils.smoothstep(age,0,.4));
    if(age>=EJECTION_DURATION){phase='parachuting';age=0;fallSpeed=pose.fallSpeed;deployed=false;ejectPlayer.rotation.set(0,limo.rotation.y,0);butler.visible=false;throwEye.copy(camera.position);throwCameraRotation.copy(camera.quaternion);}
   }
   if(phase==='parachuting'){
    let floor=world.height(position.x,position.z);const altitude=position.y-floor;
    if(altitude<14)deployed=true;
    fallSpeed=deployed?THREE.MathUtils.lerp(fallSpeed,4.5,1-Math.exp(-dt*4)):Math.min(30,fallSpeed+dt*9.81);
    position.y=Math.max(floor,position.y-fallSpeed*dt);
    const steer=new THREE.Vector3(Number(flightKeys.has('KeyD'))-Number(flightKeys.has('KeyA')),0,Number(flightKeys.has('KeyS'))-Number(flightKeys.has('KeyW'))).clampLength(0,1);
    // Glide towards the agreed landing while allowing small local steering corrections.
    position.x+=((drop.x-position.x)*.8+steer.x*2)*dt;position.z+=((drop.z-position.z)*.8+steer.z*2)*dt;
    floor=world.height(position.x,position.z);position.y=Math.max(floor,position.y);
    ejectPlayer.position.copy(position);ejectRig.pose(0,deployed,rideLook.state().firstPerson);
    chute.visible=deployed;chute.position.copy(position);chute.rotation.z=Math.sin(age*2)*.035;
    if(deployed)chute.scale.setScalar(Math.min(1,(chute.scale.x||.05)+dt*3));else chute.scale.setScalar(.05);
    chuteHint.hidden=false;chuteHint.textContent=deployed?'PARACHUTE · WASD: STEER · MOUSE: LOOK · F: VIEW':'SPACE: OPEN PARACHUTE';
    rideLook.update(dt,ejectPlayer,camera,{eye:[0,1.55,0],yaw:0},world);
    if(age<.6){const blend=THREE.MathUtils.smoothstep(age,0,.6);camera.position.lerp(throwEye,1-blend);camera.quaternion.slerp(throwCameraRotation,1-blend);}
    if(position.y<=floor+.02){phase='landing';age=0;ejectionStage='land';drop.copy(position);landingEye.copy(camera.position);landingRotation.copy(camera.quaternion);chuteHint.hidden=true;rideLook.pause();onLanding(rideLook.state());}
   }
   if(phase==='landing'){
    const t=THREE.MathUtils.clamp(age/.45,0,1),blend=THREE.MathUtils.smoothstep(t,0,1);
    position.copy(drop).lerp(landing,blend);ejectPlayer.position.copy(position);ejectRig.land(t,rideLook.state().firstPerson);
    chute.position.copy(position);chute.scale.setScalar(Math.max(.01,1-blend));chute.visible=t<1;
    landingCamera(dt,position);camera.position.lerp(landingEye,1-blend);camera.position.y-=Math.sin(t*Math.PI)*.08;camera.quaternion.slerp(landingRotation,1-blend);
    limo.position.y+=dt*8;limo.position.x+=dt*12;
    if(t>=1){phase='complete';age=0;rides++;chute.visible=false;ejectRig.reset();flightKeys.clear();onArrive(position.clone());}
   }else if(phase==='complete'&&limo.visible){
    limo.position.y+=dt*8;limo.position.x+=dt*12;if(age>=2)limo.visible=false;
   }


  },
  reset(){rideLook.reset();chute.visible=false;chuteHint.hidden=true;flightKeys.clear();deployed=false;fallSpeed=0;ejectionStage=null;passengers.clear();ejectRig.reset();phase='idle';age=0;distance=0;speed=0;solved=false;rides=0;limo.visible=false;butler.visible=false;butler.rotation.z=0;door.rotation.y=0;ui.hidden=true;pose(0);input.value='';feedback.textContent='';onClose();}
 };
}
