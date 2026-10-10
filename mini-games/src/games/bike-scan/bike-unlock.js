import {createFeatureLifecycle} from '../../shared/runtime/feature-lifecycle.js';
import {gameConfig} from '../../config/game-config.js';
import './bike-unlock.css';
import {aimPhotoCamera} from '../../shared/phone-camera/photo-camera.js';
import * as THREE from 'three';
import {mountPhoneCamera,phoneCameraFov,photoCrop} from '../../shared/phone-camera/phone-camera.js';
// A local game scanner: this never accesses a camera, network or real account.
export function createBikeUnlock({uiRoot=document.body,camera,attempt,onUnlocked,onClose}){
 const lifecycle=createFeatureLifecycle();
 const modal=document.createElement('div');modal.id='bike-unlock';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Unlock PubliBike');
 modal.innerHTML=`<div class="tourist-viewfinder"><canvas id="unlock-view" width="320" height="260" aria-label="Live PubliBike QR scanner"></canvas></div><div class="tourist-camera-controls"><h2 id="unlock-title"></h2><div class="unlock-progress" aria-hidden="true"><i id="unlock-progress"></i></div><p id="unlock-message" role="status" aria-live="polite"></p><div class="unlock-actions"><button id="unlock-retry" hidden>TRY AGAIN</button><button id="unlock-another" hidden>ANOTHER BIKE</button></div></div>`;
 uiRoot.appendChild(modal);const $=id=>modal.querySelector('#'+id),canvas=$('unlock-view'),ctx=canvas.getContext('2d');
 const handset=mountPhoneCamera(modal,{onAim:(dx,dy)=>{yaw=THREE.MathUtils.clamp(yaw+dx,-1.3,1.3);pitch=THREE.MathUtils.clamp(pitch+dy,-1,1);},yawRange:1.3,pitchRange:1,appName:'PubliBike'});handset.orientation('portrait');
 const dismiss=document.createElement('button');dismiss.id='unlock-dismiss';dismiss.className='photo-home';dismiss.type='button';dismiss.setAttribute('aria-label','Put phone away');dismiss.title='Put phone away · Esc';modal.querySelector('.photo-home').replaceWith(dismiss);
 let savedView=null,yaw=0,pitch=0,aimed=false,lastYaw=0,lastPitch=0;
 function applyView(){if(!camera||!bike?.qrTag)return;const model=bike.model,eye=model.localToWorld(new THREE.Vector3(.08,1.4,2.25)),look=bike.qrTag.getWorldPosition(new THREE.Vector3());aimPhotoCamera(camera,eye,look,yaw,pitch);const p=look.clone().project(camera),crop=photoCrop(camera.aspect,1,'portrait');target={x:((p.x+1)*camera.aspect/2-crop.x)/crop.w*320,y:((1-p.y)/2-crop.y)/crop.h*260};}
 let bike=null,aim={x:160,y:130},target={x:100,y:100},progress=0,error=null,lastFocus=null,locked=false;
 let lastAim={...aim},steadyTime=0,stutter=0,stuttered=false,scanPhase='align',age=0;
 function resetScan(){progress=0;lastAim={...aim};steadyTime=0;stutter=0;stuttered=false;scanPhase='align';age=0;$('unlock-progress').style.width='0%';}
 const held=new Set();
 const unavailableMessage=reason=>reason?.startsWith('BATTERY EMPTY')?'Battery empty. Choose another bike.':'Out of service. Try another bike.';
 function close(){if(savedView&&camera){camera.position.copy(savedView.position);camera.quaternion.copy(savedView.quaternion);camera.up.copy(savedView.up);camera.fov=savedView.fov;camera.updateProjectionMatrix();}savedView=null;modal.dataset.phase='idle';modal.hidden=true;bike=null;held.clear();onClose();lastFocus?.focus({preventScroll:true});}
 dismiss.onclick=close;$('unlock-another').onclick=close;
 function retry(){error=null;locked=false;resetScan();$('unlock-retry').hidden=true;$('unlock-another').hidden=true;$('unlock-message').textContent='Try again.';}
 $('unlock-retry').onclick=retry;
 function pointer(){aimed=true;}
 lifecycle.listen(canvas,'pointermove',pointer);lifecycle.listen(canvas,'pointerdown',pointer);
 function draw(aligned){ctx.clearRect(0,0,320,260);ctx.strokeStyle=aligned?'#7ef1b8':'#ffd174';ctx.lineWidth=3;ctx.strokeRect(aim.x-34,aim.y-22,68,44);ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(aim.x-6,aim.y-1,12,2);ctx.fillRect(aim.x-1,aim.y-6,2,12);}
 lifecycle.own(()=>{close();handset.dispose();modal.remove();});
 return {dispose:()=>lifecycle.dispose(),active:()=>!modal.hidden,
  open(selected){if(!modal.hidden)return;lastFocus=document.activeElement;bike=selected;if(camera){savedView={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),fov:camera.fov};camera.fov=2*Math.atan(Math.tan(phoneCameraFov(camera,'portrait')*Math.PI/360)*.65)*180/Math.PI;camera.updateProjectionMatrix();}yaw=pitch=lastYaw=lastPitch=0;aimed=false;aim={x:160,y:130};target={x:85+(bike.id*17)%145,y:75+(bike.id*13)%100};error=null;locked=false;held.clear();resetScan();$('unlock-progress').style.width='0%';modal.hidden=false;modal.dataset.phase='framing';handset.resetAim({offset:true});applyView();$('unlock-title').textContent=`Bike ${String(bike.id).padStart(2,'0')}`;$('unlock-message').textContent=bike.broken?unavailableMessage(bike.reason):'Center the rear QR code and hold still.';$('unlock-retry').hidden=true;$('unlock-another').hidden=true;draw(false);dismiss.focus();},close,
  keydown(e){if(modal.hidden)return false;e.preventDefault();if(e.code==='Tab'){const buttons=[...modal.querySelectorAll('button')].filter(b=>!b.hidden);const index=buttons.indexOf(document.activeElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();return true;}if(e.code==='Enter'&&error&&locked){close();return true;}if(e.code==='Escape'||e.code==='KeyE'){close();return true;}if(e.code==='Enter'&&error&&!locked){retry();return true;}held.add(e.code);return true;},
  keyup(e){held.delete(e.code);},blur(){held.clear();steadyTime=0;progress=0;scanPhase='align';},
  update(dt){
   if(modal.hidden)return;handset.updateAim();dt=Math.max(0,Math.min(dt,.1));age+=dt;
   const dx=Number(held.has('KeyD')||held.has('ArrowRight'))-Number(held.has('KeyA')||held.has('ArrowLeft')),dy=Number(held.has('KeyS')||held.has('ArrowDown'))-Number(held.has('KeyW')||held.has('ArrowUp'));
   if(dx||dy){aimed=true;yaw=THREE.MathUtils.clamp(yaw-dx*.65*dt,-1.3,1.3);pitch=THREE.MathUtils.clamp(pitch-dy*.65*dt,-1,1);}applyView();
   const aligned=aimed&&Math.abs(aim.x-target.x)<gameConfig.scanning.bikeAimTolerancePixels&&Math.abs(aim.y-target.y)<gameConfig.scanning.bikeAimTolerancePixels;
   const moving=dx!==0||dy!==0||Math.hypot((yaw-lastYaw)*320,(pitch-lastPitch)*260)>Math.max(.35,dt*12);lastYaw=yaw;lastPitch=pitch;
   if(!error){
    if(!aligned||moving){steadyTime=0;progress=Math.max(0,progress-dt*1.5);scanPhase=aligned?'steady':'align';$('unlock-message').textContent=aligned?'Hold still.':'Aim at the rear QR code.';}
    else{
     steadyTime+=dt;
     if(steadyTime<gameConfig.scanning.bikeSettleSeconds){scanPhase='steady';$('unlock-message').textContent='Hold still.';}
     else if(stutter>0){scanPhase='stutter';stutter=Math.max(0,stutter-dt);$('unlock-message').textContent='Connecting…';}
     else{scanPhase='scan';progress=Math.min(1,progress+dt/gameConfig.scanning.bikeHoldSeconds);$('unlock-message').textContent='Scanning…';if(progress>=gameConfig.scanning.bikeStutterAtProgress&&!stuttered){stuttered=true;stutter=gameConfig.scanning.bikeStutterSeconds;scanPhase='stutter';$('unlock-message').textContent='Connecting…';}}
    }
    $('unlock-progress').style.width=`${progress*100}%`;
   }
   draw(aligned);
   if(scanPhase==='stutter'){
    ctx.fillStyle='#ffd17455';ctx.fillRect(aim.x-49,aim.y-48+((age*85)%94),98,5);
    ctx.fillStyle='#ffdd83';ctx.font='bold 13px monospace';ctx.fillText(['…','…','…'][Math.floor(age*9)%3],12,23);
   }
   if(error)return;
   if(progress>=1){const result=attempt(bike);held.clear();if(result.ok){const unlocked=bike;close();onUnlocked(unlocked);}else{error=result.error;locked=!!result.permanent;scanPhase='error';$('unlock-message').textContent=locked?unavailableMessage(result.error):'Scan failed. Try again.';$('unlock-retry').hidden=locked;$('unlock-another').hidden=false;$('unlock-another').focus();}}
  },
  state(){return {orientation:'portrait',yaw,pitch,aimed,active:!modal.hidden,bikeId:bike?.id??null,target:{...target},aim:{...aim},progress,error,permanent:locked,phase:scanPhase,steadyTime,stutterRemaining:stutter,stuttered};}
 };
}
