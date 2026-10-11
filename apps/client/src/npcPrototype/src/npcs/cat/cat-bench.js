import {createRPGDialogue} from '../../shared/dialogue/rpg-dialogue.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {gameConfig} from '../../config/game-config.js';
import {createWorldAccess} from '../../world/core/world-access.js';
import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {createCatPetting} from './cat-petting.js';
import './cat-bench.css';
import {createCatSound} from './cat-sound.js';
import {applyTabbyCoat} from './cat-coat.js';
export function createCatBench(scene,world,solver,{camera,onBite=()=>{},onComplete=()=>{},onClose=()=>{},avoid=[],placement,uiRoot=document.body}={}){
 const tuning=gameConfig.npcs.cat,access=createWorldAccess(world,solver),group=new THREE.Group();group.name='Bench with a very particular cat';let site=null,heading=0;
 // Explicit map placements include their elevation; automatic placement
 // remains available for hosts that only supply route/search anchors.
 const fixed=placement?.position?.length===3;
 if(fixed){site=new THREE.Vector3(...placement.position);heading=placement.heading??0;}
 const route=world.data.layoutRoute??world.data.route,anchors=fixed?[]:placement?.position?[placement.position]:(placement?.searchAnchors??route.filter((_,i)=>i>8&&i%4===0));
 search:for(const [x,z] of anchors)for(const [dx,dz] of (placement?.position?[[0,0]]:[[4,0],[-4,0],[0,4],[0,-4],[6,0],[-6,0]])){
  const p=new THREE.Vector3(x+dx,world.height(x+dx,z+dz),z+dz);if(avoid.some(a=>a&&Math.hypot(a.x-p.x,a.z-p.z)<6))continue;
  if(![-1.4,0,1.4].every(a=>[-.75,0,.75].every(b=>access.clearFloor(p.x+a,p.z+b)&&Math.abs(world.height(p.x+a,p.z+b)-p.y)<.12)))continue;
  const approach=new THREE.Vector3(x,world.height(x,z),z);if(!access.walkablePath(approach,p))continue;site=p;heading=placement?.heading??Math.atan2(p.x-x,p.z-z);break search;
 }
 if(!site)throw Error('No clear accessible cat bench site');group.position.copy(site);group.rotation.y=heading;scene.add(group);
 const wood=new THREE.MeshStandardMaterial({color:'#8a542e',roughness:.9}),metal=new THREE.MeshStandardMaterial({color:'#243e38',roughness:.7});
 const cream=new THREE.MeshStandardMaterial({color:'#f6e5c6',roughness:.9});
 function box(parent,mat,x,y,z,w,h,d){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);parent.add(o);return o;}
 for(const z of [-.24,-.08,.08,.24])box(group,wood,0,.53,z,2.5,.08,.13);
 for(const y of [.85,1.05])box(group,wood,0,y,.33,2.5,.13,.07);
 for(const x of [-1.05,1.05]){box(group,metal,x,.25,0,.1,.5,.52);box(group,metal,x,.76,.35,.07,1.03,.07);box(group,metal,x,.73,0,.07,.07,.55);}
 const cat=new THREE.Group();cat.name='Resting tabby cat';cat.position.x=-.4;group.add(cat);
 const model=new THREE.Group();model.name='Resting cat asset';cat.add(model);let modelReady=false,assetError=null;
 const backPoints=[];
 const ready=new GLTFLoader().loadAsync('/models/cat/resting-tabby.glb').then(gltf=>{
  if(disposed){disposeOwnedObject(gltf.scene);return;}
  const asset=gltf.scene;asset.scale.setScalar(1.5);asset.rotation.y=Math.PI/3;asset.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(asset),center=bounds.getCenter(new THREE.Vector3());asset.position.set(-center.x,.57-bounds.min.y,-center.z);model.add(asset);model.updateMatrixWorld(true);
  const skin=[];asset.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.name.includes('Continuous')){skin.push(o);applyTabbyCoat(o);}else if(o.name.includes('tail'))applyTabbyCoat(o);}});
  const retired=new THREE.Group();retired.visible=false;model.add(retired);asset.traverse(o=>{if(o.userData.replacedCoat)retired.add(new THREE.Mesh(new THREE.BufferGeometry(),o.userData.replacedCoat));});
  const ray=new THREE.Raycaster();cat.updateWorldMatrix(true,true);
  for(let i=0;i<=40;i++){
   const x=-.16+.24*i/40,origin=cat.localToWorld(new THREE.Vector3(x,2,-.015));ray.set(origin,new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(skin,true)[0];
   backPoints.push(hit?cat.worldToLocal(hit.point.clone()).add(new THREE.Vector3(0,.012,0)):new THREE.Vector3(x,.80,-.015));
  }
  modelReady=true;
 }).catch(error=>{assetError=error.message;console.error('Cat model failed to load',error);});
 // A thin, anatomically shaped palm lies against the fur, fingers extended.
 const palmShape=new THREE.Shape();palmShape.moveTo(-.035,-.13);palmShape.lineTo(-.05,-.035);palmShape.bezierCurveTo(-.092,-.01,-.1,.03,-.078,.04);palmShape.lineTo(-.048,.01);palmShape.lineTo(-.049,.13);palmShape.bezierCurveTo(-.048,.151,-.029,.151,-.028,.13);palmShape.lineTo(-.026,.067);palmShape.lineTo(-.022,.162);palmShape.bezierCurveTo(-.02,.181,.002,.182,.003,.162);palmShape.lineTo(.004,.068);palmShape.lineTo(.009,.147);palmShape.bezierCurveTo(.012,.165,.033,.163,.033,.144);palmShape.lineTo(.031,.063);palmShape.lineTo(.039,.113);palmShape.bezierCurveTo(.043,.128,.06,.125,.058,.108);palmShape.lineTo(.05,.005);palmShape.bezierCurveTo(.048,-.022,.035,-.04,.029,-.06);palmShape.lineTo(.034,-.13);palmShape.closePath();
 const hand=new THREE.Group();hand.name='Flat petting hand';hand.visible=false;cat.add(hand);const palm=new THREE.Mesh(new THREE.ExtrudeGeometry(palmShape,{depth:.012,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:3,curveSegments:16}),new THREE.MeshStandardMaterial({color:'#c59477',roughness:.83}));palm.rotation.x=-Math.PI/2;hand.add(palm);box(hand,new THREE.MeshStandardMaterial({color:'#283e49',roughness:.9}),0,.006,.17,.078,.025,.15);hand.rotation.y=Math.PI/2;
 const lap=new THREE.Group();lap.name='Seated first-person legs';lap.visible=false;group.add(lap);const denim=new THREE.MeshStandardMaterial({color:'#284b60',roughness:.95});for(const x of [.58,.84]){box(lap,denim,x,.46,-.22,.18,.18,.48);box(lap,denim,x,.26,-.47,.17,.42,.17);box(lap,cream,x,.065,-.56,.19,.13,.27);}
 hand.scale.setScalar(.75);
 const backPoint=t=>{if(!backPoints.length)return new THREE.Vector3(0,.83,0);const f=THREE.MathUtils.clamp(t,0,1)*40,i=Math.min(39,Math.floor(f));return backPoints[i].clone().lerp(backPoints[i+1],f-i);};let projected=[],cursor=null,lastPointer=null,ownsPointerLock=false;
 const trackPointer=e=>{if(!open||mode==='choice')lastPointer={x:e.clientX,y:e.clientY};};document.addEventListener('pointermove',trackPointer,{capture:true});
 const lockChanged=()=>{if(document.pointerLockElement===zone)ownsPointerLock=true;else if(ownsPointerLock){ownsPointerLock=false;close();}};document.addEventListener('pointerlockchange',lockChanged);
 const ui=document.createElement('section');ui.id='cat-petting';ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-label','Pet the cat');ui.innerHTML=`<div class="cat-pet-card"><b>BENCH CAT</b><p class="cat-pet-status"></p><small>Pet back and forth at a relaxed pace.</small><div class="cat-tempo-meter" aria-label="Petting intensity"><i></i></div><button class="cat-pet-close">STAND UP · ESC</button></div><div class="cat-pet-zone" aria-label="Guide the flat hand over the cat"><svg class="cat-edge-overlay"><polyline class="cat-back-guide" fill="none"/><circle class="cat-start-dot" r="5"/></svg></div>`;uiRoot.append(ui);
 const hurt=document.createElement('aside');hurt.id='cat-hurt-status';hurt.hidden=true;uiRoot.append(hurt);
 const status=ui.querySelector('.cat-pet-status'),zone=ui.querySelector('.cat-pet-zone');let disposed=false,open=false,mode='closed',saved=null,age=0,endAge=0,slowRemaining=0,pointer=null,bites=0,completed=0;
 const choice=createRPGDialogue({id:'cat-dialogue',speaker:'BENCH CAT',lines:['She looks up at you.'],choices:[{text:'Pet the cat',data:{catChoice:'pet'}},{text:'Move away',data:{catChoice:'leave'}}],compact:true,uiRoot});
 choice.panel.querySelector('[data-cat-choice="pet"]').onclick=beginPetting;
 choice.panel.querySelector('[data-cat-choice="leave"]').onclick=close;
 function beginPetting(){if(!open||mode!=='choice')return;mode='petting';choice.panel.hidden=true;ui.hidden=false;cursor=null;handT=0;hand.visible=lap.visible=true;hand.position.copy(backPoint(0));render();try{zone.requestPointerLock?.()?.catch(()=>{});}catch{}}
 const sound=createCatSound(tuning);
 const pet=createCatPetting(tuning,{onBite:()=>{sound.angry();slowRemaining=tuning.hurtSeconds;bites++;endAge=0;onBite();},onComplete:()=>{sound.pet(1.4);completed++;endAge=0;onComplete();}});
 function render(){const s=pet.state();ui.dataset.phase=s.phase;status.textContent=s.phase==='bitten'?`OUCH! −${Math.round((1-tuning.hurtSpeedMultiplier)*100)}% speed for ${tuning.hurtSeconds}s`:s.phase==='happy'?'Purrr. You have been accepted.':`${s.strokes} / ${tuning.strokesRequired} gentle pets${s.roughness>.2?' · Slow down!':''}`;ui.style.setProperty('--cat-roughness',String(s.roughness));}
 function stop(){pet.stop();if(pointer!==null&&zone.hasPointerCapture(pointer))zone.releasePointerCapture(pointer);pointer=null;}
 function close(){if(!open)return;open=false;ownsPointerLock=false;if(document.pointerLockElement===zone)document.exitPointerLock();cursor=null;sound.stop();stop();mode='closed';choice.panel.hidden=true;ui.hidden=true;model.rotation.set(0,0,0);hand.visible=lap.visible=false;if(saved){camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.fov=saved.fov;camera.updateProjectionMatrix();}saved=null;onClose();}
 const guide=zone.querySelector('polyline'),startDot=zone.querySelector('circle');let handT=0;
 function projectBack(){group.updateMatrixWorld(true);cat.updateWorldMatrix(true,false);projected=backPoints.map((p,i)=>{const v=cat.localToWorld(p.clone()).project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,t:i/40};});guide.setAttribute('points',projected.map(p=>`${p.x},${p.y}`).join(' '));if(projected.length){startDot.setAttribute('cx',projected[0].x);startDot.setAttribute('cy',projected[0].y);}}
 function nearest(x,y){
  // Use a stable stroke axis, while accepting both the curved outline and
  // the straight chord between its ends. The hand still follows the 3D fur.
  const first=projected[0],last=projected.at(-1),dx=last.x-first.x,dy=last.y-first.y;
  const t=THREE.MathUtils.clamp(((x-first.x)*dx+(y-first.y)*dy)/(dx*dx+dy*dy||1),0,1);
  let distance=Math.hypot(x-first.x-t*dx,y-first.y-t*dy);
  for(let i=1;i<projected.length;i++){const a=projected[i-1],b=projected[i],sx=b.x-a.x,sy=b.y-a.y,u=THREE.MathUtils.clamp(((x-a.x)*sx+(y-a.y)*sy)/(sx*sx+sy*sy||1),0,1);distance=Math.min(distance,Math.hypot(x-a.x-u*sx,y-a.y-u*sy));}
  return {distance,t};
 }
 function moveHand(e){if(mode!=='petting'||!projected.length)return;if(!cursor)return;const locked=document.pointerLockElement===zone,dx=locked?e.movementX:lastPointer?e.clientX-lastPointer.x:0,dy=locked?e.movementY:lastPointer?e.clientY-lastPointer.y:0;lastPointer={x:e.clientX,y:e.clientY};cursor.x=THREE.MathUtils.clamp(cursor.x+dx,0,innerWidth);cursor.y=THREE.MathUtils.clamp(cursor.y+dy,0,innerHeight);const hit=nearest(cursor.x,cursor.y),span=Math.max(100,Math.hypot(projected.at(-1).x-projected[0].x,projected.at(-1).y-projected[0].y)),x=cursor.x/span*.47,y=cursor.y/span*.47;const moved=Math.abs(handT-hit.t)>.0001;handT=hit.t;hand.visible=true;hand.position.copy(backPoint(handT));const left=backPoint(Math.max(0,handT-.01)),right=backPoint(Math.min(1,handT+.01));hand.rotation.z=Math.atan2(right.y-left.y,right.x-left.x);if(pet.state().phase!=='petting')return;
  if(!pet.state().dragging){pet.start(x,y,performance.now());}
  else pet.move(x,y,performance.now());if(moved&&pet.state().dragging&&pet.state().phase==='petting')sound.pet();render();
 }
 zone.onpointermove=moveHand;
 zone.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();pointer=e.pointerId;zone.setPointerCapture(pointer);moveHand(e);};
 zone.addEventListener('pointercancel',stop);
 zone.onpointerup=()=>{if(pointer!==null&&zone.hasPointerCapture(pointer))zone.releasePointerCapture(pointer);pointer=null;};
 ui.querySelector('button').onclick=close;
 return {group,cat,site,zone,ready,active:()=>open,near:position=>access.canInteract(position,site,tuning.interactionDistance),
  interact(position){if(!modelReady||!this.near(position))return false;if(open)return true;saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};open=true;mode='choice';sound.meow();age=endAge=0;pet.reset();cursor=null;handT=0;hand.visible=lap.visible=false;ui.hidden=true;choice.panel.hidden=false;choice.focus();return true;},
  keydown(e){if(!open)return false;if(mode==='choice')return choice.keydown(e,close);if(e.code==='Escape'){e.preventDefault();close();}else if(!['Tab','Enter','Space'].includes(e.code))e.preventDefault();return true;},
  blocked(x,z,y){if(Math.abs(y-site.y)>2)return false;const dx=x-site.x,dz=z-site.z,lx=Math.cos(heading)*dx-Math.sin(heading)*dz,lz=Math.sin(heading)*dx+Math.cos(heading)*dz;return Math.abs(lx)<1.3&&Math.abs(lz)<.45;},
  tick(dt,playing){sound.update(dt,{paused:!playing});if(playing&&!open)slowRemaining=Math.max(0,slowRemaining-Math.max(0,dt));hurt.hidden=slowRemaining<=0;hurt.textContent=`CAT BITE · −${Math.round((1-tuning.hurtSpeedMultiplier)*100)}% SPEED · ${Math.ceil(slowRemaining)}s`;},speedMultiplier:()=>slowRemaining>0?tuning.hurtSpeedMultiplier:1,
  update(dt){if(!open)return;age+=dt;const s=pet.state();camera.fov=58;camera.updateProjectionMatrix();group.updateMatrixWorld(true);camera.position.copy(group.localToWorld(new THREE.Vector3(.55,1.38,-.72)));camera.up.set(0,1,0);camera.lookAt(group.localToWorld(new THREE.Vector3(-.35,.72,0)));camera.updateMatrixWorld(true);
   if(mode==='petting'&&!cursor){projectBack();cursor={x:projected[0].x,y:projected[0].y};const span=Math.max(100,Math.hypot(projected.at(-1).x-projected[0].x,projected.at(-1).y-projected[0].y));pet.start(cursor.x/span*.47,cursor.y/span*.47,performance.now());}
   model.rotation.z=s.phase==='bitten'?Math.sin(Math.min(1,endAge/.5)*Math.PI)*.07:0;projectBack();if(s.phase!=='petting'){endAge+=dt;if(endAge>=(s.phase==='bitten'?tuning.biteReactionSeconds:1.4))close();}render();
  },reset(){close();sound.stop();hurt.hidden=true;slowRemaining=bites=completed=0;pet.reset();model.rotation.set(0,0,0);},dispose(){if(disposed)return;disposed=true;close();sound.dispose();choice.dispose();document.removeEventListener('pointermove',trackPointer,{capture:true});document.removeEventListener('pointerlockchange',lockChanged);ui.remove();hurt.remove();disposeOwnedObject(group);},state:()=>({...pet.state(),open,bites,completed,mode,seated:open,handFlat:open&&mode==='petting',modelReady,assetError,sound:sound.state(),cursor:cursor?{...cursor}:null,relativeInput:true,tracePoints:projected.map(p=>[p.x,p.y]),slowRemaining,speedMultiplier:slowRemaining>0?tuning.hurtSpeedMultiplier:1,position:site.toArray()})
 };
}
