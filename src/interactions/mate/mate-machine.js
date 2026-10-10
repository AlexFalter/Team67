import {featurePlacement} from '../../world/placements/feature-placement.js';
import {createMateMachineState} from './mate-machine-state.js';
import {createFeatureLifecycle,disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {gameConfig} from '../../config/game-config.js';
import './mate-machine.css';
import {mateCanDropPose} from './mate-can-drop.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createMachinePanel} from '../machine-ui/machine-panel.js';
import * as THREE from 'three';
import {createWorldAccess} from '../../world/core/world-access.js';

export function createMateMachine(scene,world,solver,{camera,canvas,onClose,onWin,onDrop=()=>{},placement,stateModel,workingFlavor:hostWorkingFlavor,uiRoot=document.body,assetUrl=path=>path,replicated=false,onCommand=()=>{},entityId='mate-machine'}){
 const lifecycle=createFeatureLifecycle();
 const rules=stateModel??createMateMachineState({...gameConfig.mate,workingFlavor:hostWorkingFlavor});
 placement=featurePlacement(world,'mate',placement);
 const anchors=placement.searchAnchors??[];
 const access=createWorldAccess(world,solver);
 const machine=new THREE.Group();machine.name='El Tony Mate vending machine';scene.add(machine);
 let site;
 if(placement.position){const [x,z]=placement.position;if(!Number.isFinite(x)||!Number.isFinite(z)||!access.clearFloor(x,z))throw Error('Invalid host Mate position');site=new THREE.Vector3(x,world.height(x,z),z);}
 if(!site){
 search:for(const point of anchors)candidate:for(const [dx,dz] of [[3,0],[-3,0],[0,3],[0,-3]]){
  const p=new THREE.Vector3(point[0]+dx,world.height(point[0]+dx,point[1]+dz),point[1]+dz);
  for(const x of [-.7,0,.7])for(const z of [-.5,0,.5]){const q=p.clone().add(new THREE.Vector3(x,0,z));q.y=world.height(q.x,q.z);if(world.isWater(q.x,q.z)||world.blocked(q.x,q.z)||solver.penetration(q)>.01)continue candidate;}
  let clear=true;for(let j=0;j<=8;j++){const x=THREE.MathUtils.lerp(point[0],p.x,j/8),z=THREE.MathUtils.lerp(point[1],p.z,j/8);if(solver.penetration(new THREE.Vector3(x,world.height(x,z),z))>.01)clear=false;}if(clear){site=p;break search;}
 }
 }
 if(!site)throw Error('No accessible mate machine location');machine.position.copy(site);
 const flavors=[{name:'Basic',color:'#e8ce81',asset:'basic',label:'CLASSIC'},{name:'Light',color:'#f2f1e9',asset:'light',label:'ZERO'},{name:'Mint',color:'#73b63b',asset:'mint',label:'& MINT'},{name:'Ginger',color:'#ee8c32',asset:'ginger',label:'& GINGER'}];
 const prize=new THREE.Group();prize.name='Collectible Mint can';prize.position.set(.34,.341,-.42);prize.visible=false;machine.add(prize);
 // Invisible tray hit area keeps collection generous without hiding the can.
 const collectionBox=new THREE.Mesh(new THREE.BoxGeometry(1.1,.36,.28),new THREE.MeshBasicMaterial({visible:false}));collectionBox.position.set(.34,.35,-.40);machine.add(collectionBox);
 let modelLoaded=false,canLoaded=false,modelFailed=false;
 const gltf=new GLTFLoader();
 function prepare(model){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return model;}
 gltf.load(assetUrl('/models/mate-machine.glb'),asset=>{if(lifecycle.disposed){disposeOwnedObject(asset.scene);return;}machine.add(prepare(asset.scene));modelLoaded=true;},undefined,()=>{modelFailed=true;});
 gltf.load(assetUrl('/models/mate-can-mint.glb'),asset=>{if(lifecycle.disposed){disposeOwnedObject(asset.scene);return;}asset.scene.position.y=-.145;prize.add(prepare(asset.scene));canLoaded=true;},undefined,()=>{modelFailed=true;});
 const ui=document.createElement('div');ui.id='mate-minigame';ui.hidden=true;ui.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="mate-title" class="mate-cabinet"><header class="mate-brand"><h2 id="mate-title"><img src="/assets/tony-mate/logo.png" alt="El Tony Mate"></h2><span>COLD BREW MATE · 330 ML</span></header><div class="mate-machine-face"><div class="mate-window">${flavors.map(f=>`<div class="mate-shelf" style="--flavor:${f.color}">${Array.from({length:3},()=>`<img class="mate-product" src="/assets/tony-mate/cans/${f.asset}.png" alt="El Tony Mate ${f.label}">`).join('')}<small>${f.name.toUpperCase()}</small></div>`).join('')}</div><div class="mate-controls"><div class="mate-lcd"><small>VENDING SYSTEM</small><p id="mate-message" role="status" aria-live="polite"></p><div class="mate-loading-track"><i id="mate-loading-bar"></i></div><span id="mate-display-detail"></span></div><div class="mate-selections">${flavors.map((f,i)=>`<button class="mate-selection" data-flavor="${i}" style="--flavor:${f.color}" ${i===0?'id="mate-vend"':''}><span class="mate-button-number">0${i+1}</span><span>${f.name}<small>330 ml · CHF 3.50</small></span><img class="mate-can-icon" src="/assets/tony-mate/cans/${f.asset}.png" alt="${f.name} can"><b>●</b></button>`).join('')}</div><div class="mate-payment-slot"><label for="mate-card">SWIPE CARD →</label><input id="mate-card" type="range" min="0" max="100" step="25" value="0" aria-label="Swipe card to pay CHF 3.50"><small id="mate-card-status">Select a flavor first</small></div></div></div><div class="mate-dispenser"><span id="mate-tray">DISPENSER</span></div><button id="mate-close">STEP AWAY · ESC</button></section>`;uiRoot.append(ui);
 ui.querySelectorAll("img").forEach(img=>img.setAttribute("src",assetUrl(img.getAttribute("src"))));
 const buttons=[...ui.querySelectorAll('.mate-selection')],message=ui.querySelector('#mate-message'),detail=ui.querySelector('#mate-display-detail'),bar=ui.querySelector('#mate-loading-bar'),tray=ui.querySelector('#mate-tray'),close=ui.querySelector('#mate-close'),card=ui.querySelector('#mate-card'),cardStatus=ui.querySelector('#mate-card-status');
 const panel=createMachinePanel(ui.querySelector('.mate-cabinet'),machine,{left:-.91,right:-.25,bottom:.56,top:2.32,depth:-.515},{viewport:canvas});
 const tried=new Set();

 let savedView=null,dropAge=0,dropImpact=false;const ray=new THREE.Raycaster();
 const collectionHint=document.createElement('div');collectionHint.className='mate-collection-hint ticket-collection-hint';collectionHint.innerHTML='<b id="mate-collect-label"></b><small>Collect your Mate from the dispenser.</small><button id="mate-collect-back">BACK · ESC</button>';ui.querySelector('.mate-cabinet').append(collectionHint);collectionHint.querySelector('button').onclick=()=>hide();
 let pending=false;
 let open=false,attempts=0,cooldown=0,won=false,phase='idle',loading=0,selected=0,payments=0;
 function syncRules(){const state=rules.snapshot();({attempts,cooldown,won,phase,loading,selected,payments,dropAge}=state);tried.clear();state.tried.forEach(i=>tried.add(i));}
 syncRules();
 lifecycle.own(()=>{hide();ui.remove();disposeOwnedObject(machine);});
 function render(){const physical=['dropping','collect'].includes(phase);ui.classList.remove('mate-world-stage');collectionHint.hidden=!physical;collectionHint.querySelector('b').textContent=phase==='dropping'?'DISPENSING MATE…':'CLICK THE MATE INSIDE THE DISPENSER';for(const [i,button] of buttons.entries()){button.disabled=pending||phase==='payment'||phase==='loading'||physical||cooldown>0||won||tried.has(i);button.dataset.tried=String(tried.has(i));button.querySelector('small').textContent=won&&i===selected?'IN YOUR INVENTORY':tried.has(i)?'UNAVAILABLE · TRY ANOTHER':'330 ml · CHF 3.50';button.classList.toggle('selected',phase!=='idle'&&i===selected);}message.textContent=phase==='dropping'?'DISPENSING CAN':phase==='collect'?'TAKE YOUR CAN':phase==='payment'?'SWIPE TO PAY':phase==='loading'?'PLEASE WAIT':won?'MATE ACQUIRED':phase==='failure'?'NOT AVAILABLE':'SELECT YOUR MATE';detail.textContent=phase==='dropping'?'YOUR CAN IS ON ITS WAY':phase==='collect'?'COLLECT FROM THE TRAY BELOW':phase==='payment'?`${flavors[selected].name.toUpperCase()} · CHF 3.50`:phase==='loading'?`${flavors[selected].name.toUpperCase()} · DISPENSING…`:won?`${flavors[selected].name.toUpperCase()} · THANK YOU`:cooldown>0?`RETRY IN ${cooldown.toFixed(1)}s`:phase==='failure'?'TRY A DIFFERENT FLAVOR':'PRESS A FLAVOR BUTTON';bar.style.width=phase==='loading'?`${(1-loading/(rules.loadingSeconds||1))*100}%`:'0%';tray.textContent=won?`${flavors[selected].name.toUpperCase()} MATE · ADDED TO INVENTORY`:'DISPENSER';card.disabled=phase!=='payment'||pending;cardStatus.textContent=phase==='payment'?'Drag the card all the way right':phase==='loading'?'Payment accepted':phase==='failure'?'Payment refunded':won?'Paid · CHF 3.50':'Select a flavor first';ui.dataset.phase=phase;if(pending)message.textContent='PLEASE WAIT';}
 function startView(){if(!savedView&&camera)savedView={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),fov:camera.fov};if(camera){camera.fov=60;camera.up.set(0,1,0);camera.updateProjectionMatrix();}}
 function collect(){if(!open||phase!=='collect'||won||pending)return;if(replicated){pending=true;onCommand({type:'mate.collect',entityId});render();return;}if(!rules.collect())return;syncRules();prize.visible=false;onWin();hide();}
 lifecycle.listen(canvas,'pointerdown',e=>{if(!open||phase!=='collect'||e.button!==0)return;const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);if(ray.intersectObjects([prize,collectionBox],true).length){e.preventDefault();e.stopImmediatePropagation();collect();}});
 function hide(){if(savedView&&camera){camera.position.copy(savedView.position);camera.quaternion.copy(savedView.quaternion);camera.up.copy(savedView.up);camera.fov=savedView.fov;camera.updateProjectionMatrix();}savedView=null;if(phase==='payment'&&!replicated){rules.cancelPayment();syncRules();card.value='0';}open=false;ui.hidden=true;onClose();}
 for(const [i,button] of buttons.entries())button.onclick=()=>{if(!open||pending||phase==='loading'||cooldown>0||won||tried.has(i))return;if(replicated){pending=true;onCommand({type:'mate.select',entityId,flavor:i});render();return;}if(!rules.select(i))return;syncRules();card.value='0';render();card.focus();};close.onclick=hide;
 card.onpointerdown=e=>{if(phase==='payment'&&Number(card.value)===0&&e.clientX>card.getBoundingClientRect().left+70){e.preventDefault();cardStatus.textContent='Drag the card from the left';}};
 card.onpointerup=()=>{if(phase==='payment'&&Number(card.value)<100){card.value='0';cardStatus.textContent='Swipe all the way right';}};
 card.onchange=()=>{if(!open||phase!=='payment'||pending)return;if(Number(card.value)<100){cardStatus.textContent='Keep swiping →';return;}if(replicated){pending=true;onCommand({type:'mate.pay',entityId});render();return;}if(!rules.pay())return;syncRules();render();close.focus();};
 return {machine,prize,active:()=>open,blocked:(x,z,y)=>y<site.y+2.7&&Math.abs(x-site.x)<1.025&&Math.abs(z-site.z)<.75,near:position=>access.canInteract(position,site,2.8),
  interact(position){if(lifecycle.disposed||!this.near(position))return false;open=true;ui.hidden=false;startView();this.update(0);render();(['dropping','collect'].includes(phase)?collectionHint.querySelector('button'):(buttons.find(b=>!b.disabled)||close)).focus();return true;},
  keydown(e){if(!open)return false;if(e.code==='Enter'&&phase==='collect'){e.preventDefault();collect();}else if(e.code==='Escape'){e.preventDefault();hide();}else if(!(document.activeElement===card&&['ArrowLeft','ArrowRight','Home','End'].includes(e.code))&&!['Tab','Enter','Space'].includes(e.code))e.preventDefault();if(e.code==='Tab'){const focusable=['dropping','collect'].includes(phase)?[collectionHint.querySelector('button')]:[...buttons.filter(b=>!b.disabled),...(!card.disabled?[card]:[]),close],index=focusable.indexOf(document.activeElement);e.preventDefault();focusable[(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus();}return true;},
  update(dt){if(lifecycle.disposed)return;const previousPhase=phase;if(!replicated)rules.tick(dt);syncRules();if(previousPhase==='loading'&&['dropping','collect'].includes(phase)){dropImpact=false;prize.visible=true;}if(['dropping','collect'].includes(phase)){const pose=mateCanDropPose(dropAge);prize.position.set(pose.x,pose.y,pose.z);prize.rotation.set(pose.roll,0,-Math.PI/2+pose.tilt);if(pose.landed&&!dropImpact){dropImpact=true;onDrop();}}if(open&&camera){const mobile=camera.aspect<.8,physical=['dropping','collect'].includes(phase);camera.fov=mobile?55:50;camera.updateProjectionMatrix();const x=mobile?(physical?-.3:-.58):0,y=mobile&&!physical?1.44:1.34,eye=machine.localToWorld(new THREE.Vector3(x,y,mobile?(physical?-3.7:-3.0):-3.5)),target=machine.localToWorld(new THREE.Vector3(x,y,-.45));camera.position.copy(eye);camera.lookAt(target);camera.updateMatrixWorld(true);panel.update(camera);}if(open)render();},
  dispose:()=>lifecycle.dispose(),
  snapshot:()=>rules.snapshot(),
  restore(snapshot){const wasWon=won;rules.restore(snapshot);pending=false;syncRules();prize.visible=['dropping','collect'].includes(phase);if(!wasWon&&won){onWin();prize.visible=false;if(open)hide();}render();},
  reset(options){hide();pending=false;if(!replicated)rules.reset(options);syncRules();dropImpact=replicated&&dropAge>=.28;prize.rotation.set(0,0,0);open=false;card.value='0';prize.visible=replicated&&['dropping','collect'].includes(phase);ui.hidden=true;render();},
  state:()=>({modelLoaded,canLoaded,modelFailed,dropAge,dropImpact,packaging:'cans',panelEmbedded:true,pending,replicated,workingFlavors:[flavors[rules.snapshot().workingFlavor].name],open,attempts,payments,cooldown,won,phase,loading,flavor:flavors[selected].name,triedFlavors:[...tried].map(i=>flavors[i].name),position:site.toArray()})
 };
}
