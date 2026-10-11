import {createScanProgress} from '../../shared/phone-camera/scan-progress.js';
import * as THREE from 'three';
import {mountPhoneCamera,phoneCameraFov,cameraFrameLimits} from '../../shared/phone-camera/phone-camera.js';
import {aimPhotoCamera,photoPointsInFrame} from '../../shared/phone-camera/photo-camera.js';

// Uses the same live handset, pointer aiming and framing checks as Lime parking photos.
export function createTicketQRCamera(camera,{onScan,onCancel,uiRoot=document.body}){
 const ui=document.createElement('section');ui.id='ticket-qr-camera';ui.hidden=true;
 ui.innerHTML='<div class="tourist-request"><b>POLY-PAY</b><p>Scan the ticket machine’s QR code</p><small>Move your mouse to aim. Center the QR code, then hold still to scan. Esc goes back.</small></div><div class="tourist-viewfinder"><i></i><i></i><i></i><i></i><span id="ticket-qr-framing"></span></div><div class="tourist-camera-controls"><div class="ticket-scan-meter" role="progressbar" aria-label="QR scan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><button id="ticket-qr-cancel">BACK</button></div>';uiRoot.append(ui);
 let active=false,saved=null,yaw=0,pitch=0,corners=[],valid=false,progress=0;
 const hold=createScanProgress();
 const eye=new THREE.Vector3(),target=new THREE.Vector3();
 const handset=mountPhoneCamera(ui,{onAim:aim,yawRange:1.3,pitchRange:1.0,fullViewAim:true,edgePan:false,cursor:'none'});handset.orientation('portrait');
 const meter=ui.querySelector('.ticket-scan-meter'),framing=ui.querySelector('#ticket-qr-framing');
 function apply(){aimPhotoCamera(camera,eye,target,yaw,pitch);valid=photoPointsInFrame(camera,corners,...cameraFrameLimits(camera,'portrait'));framing.textContent=valid?(progress>0?'SCANNING… '+Math.round(progress*100)+'%':'HOLD STILL TO SCAN'):'CENTER THE WHOLE QR CODE';}
 function aim(dx,dy){yaw=THREE.MathUtils.clamp(yaw+dx,-1.3,1.3);pitch=THREE.MathUtils.clamp(pitch+dy,-1,1);apply();}
 function close(){hold.reset();progress=0;active=false;ui.hidden=true;ui.dataset.phase='idle';document.body.classList.remove('ticket-qr-active');if(saved){camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.up.copy(saved.up);camera.fov=saved.fov;camera.updateProjectionMatrix();}saved=null;}
 function scan(){if(!active)return;apply();if(!valid)return;handset.flash();close();onScan();}
 ui.querySelector('#ticket-qr-cancel').onclick=()=>{close();onCancel();};
 return {dispose(){close();handset.dispose();ui.remove();},active:()=>active,start(machine){saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),fov:camera.fov};eye.copy(machine.group.localToWorld(new THREE.Vector3(0,1.62,-1.3)));target.copy(machine.screen.getWorldPosition(new THREE.Vector3()));corners=[[-.27,-.225],[.27,-.225],[-.27,.225],[.27,.225]].map(([x,y])=>machine.group.localToWorld(new THREE.Vector3(x,1.46+y,-.335)));yaw=pitch=0;camera.fov=phoneCameraFov(camera,'portrait');camera.updateProjectionMatrix();hold.reset();progress=0;meter.firstElementChild.style.width='0%';meter.setAttribute('aria-valuenow','0');active=true;ui.hidden=false;ui.dataset.phase='framing';document.body.classList.add('ticket-qr-active');handset.resetAim();apply();ui.querySelector('#ticket-qr-cancel').focus();},update(dt){if(active){const oldYaw=yaw,oldPitch=pitch;handset.updateAim();apply();const elapsed=Math.max(0,dt??0),steady=Math.hypot(yaw-oldYaw,pitch-oldPitch)<=.25*elapsed;progress=hold.update(elapsed,valid,steady);meter.firstElementChild.style.width=`${progress*100}%`;meter.setAttribute('aria-valuenow',String(Math.round(progress*100)));apply();if(progress>=1)scan();}},keydown(e){if(!active)return false;if(e.code==='Escape'){e.preventDefault();close();onCancel();}else if(e.code==='Space'){e.preventDefault();}else if(!['Tab','Enter'].includes(e.code))e.preventDefault();return true;},reset:close,state:()=>({active,valid,yaw,pitch,progress})};
}
