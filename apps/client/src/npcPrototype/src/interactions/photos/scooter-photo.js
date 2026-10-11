import {handlePhotoDialogKey} from '../../shared/phone-camera/photo-dialog.js';
import {mountPhoneCamera,cropPhonePhoto,cameraFrameLimits,phoneCameraFov} from '../../shared/phone-camera/phone-camera.js';
import * as THREE from 'three';
import {photoPointsInFrame,capturePhoto,aimPhotoCamera} from '../../shared/phone-camera/photo-camera.js';

export function createScooterPhoto(world,solver,{capture,onComplete,uiRoot=document.body,renderCanvas}){
 const ui=document.createElement('section');ui.id='scooter-photo';ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-label','Photograph parked scooter');ui.innerHTML=`<div class="tourist-request"><b>LIME · END YOUR RIDE</b><p>Take a parking photo.</p><small>Look around and take a photo. Include the scooter to finish parking.</small></div><div class="tourist-viewfinder"><i></i><i></i><i></i><i></i><span id="scooter-framing"></span></div><div class="tourist-camera-controls"><button id="scooter-shutter">● TAKE PHOTO</button><small>Move mouse to aim · hold at screen edges to keep turning</small></div><div id="scooter-preview" hidden><img alt="Your camera photograph"><p></p><button id="scooter-submit">SUBMIT</button><button id="scooter-retake">RETAKE</button></div>`;uiRoot.append(ui);
 const handset=mountPhoneCamera(ui,{onAim:aim,yawRange:Math.PI,pitchRange:1.15,fullViewAim:true});handset.orientation('portrait');
 let active=false,phase='idle',shots=0,completed=0,yaw=0,pitch=0,valid=false,capturedValid=false,camera,originalFov;
 const frozen=new THREE.Vector3(),eye=new THREE.Vector3(),target=new THREE.Vector3(),ray=new THREE.Raycaster();let corners=[];const hiddenSprites=[];
 const shutter=ui.querySelector('#scooter-shutter'),preview=ui.querySelector('#scooter-preview'),framing=ui.querySelector('#scooter-framing');
 function apply(){aimPhotoCamera(camera,eye,target,yaw,pitch);valid=photoPointsInFrame(camera,corners,...cameraFrameLimits(camera,'portrait'));shutter.disabled=false;framing.textContent=valid?'SCOOTER IN FRAME ✓':'EXPLORE · PHOTO READY';}
 function aim(dx,dy){if(phase!=='framing')return;yaw=THREE.MathUtils.clamp(yaw+dx,-Math.PI,Math.PI);pitch=THREE.MathUtils.clamp(pitch+dy,-1.15,1.15);apply();}
 function take(){if(!active||phase!=='framing')return;apply();capturedValid=valid;capturePhoto(camera,capture);preview.querySelector('img').src=cropPhonePhoto('portrait',renderCanvas);preview.querySelector('p').textContent=capturedValid?'Parking photo ready.':'Nice shot! Lime still needs a photo of the scooter to finish parking.';ui.querySelector('#scooter-submit').disabled=!capturedValid;handset.flash();shots++;phase='preview';preview.hidden=false;ui.dataset.phase=phase;ui.querySelector('#scooter-submit').focus();}
 function restore(){for(const sprite of hiddenSprites)sprite.visible=true;hiddenSprites.length=0;if(camera){camera.fov=originalFov;camera.updateProjectionMatrix();}ui.hidden=true;document.body.classList.remove('scooter-photo-active');active=false;}
 function beginFraming(){yaw=pitch=0;phase='framing';preview.hidden=true;ui.dataset.phase=phase;apply();handset.resetAim({offset:true});shutter.focus();}
 shutter.onclick=take;ui.querySelector('#scooter-retake').onclick=beginFraming;ui.querySelector('#scooter-submit').onclick=()=>{if(phase!=='preview'||!capturedValid)return;completed++;phase='complete';restore();onComplete(frozen.clone());};

 return {
  dispose(){this.reset();handset.dispose();ui.remove();},
  active:()=>active,
  start(position,viewCamera,scooter){
   if(active)return false;camera=viewCamera;originalFov=camera.fov;camera.fov=phoneCameraFov(camera,'portrait');camera.updateProjectionMatrix();scooter.updateWorldMatrix(true,true);const bounds=new THREE.Box3();scooter.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});corners=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z));bounds.getCenter(target);frozen.copy(position);yaw=pitch=0;
   const angle=Math.atan2(position.z-target.z,position.x-target.x);let found=false;
   search:for(const radius of [3,4,5])for(let i=0;i<24;i++){const a=angle+i*Math.PI/12,x=target.x+Math.cos(a)*radius,z=target.z+Math.sin(a)*radius,floor=new THREE.Vector3(x,world.height(x,z),z);if(world.isWater(x,z)||world.blocked(x,z)||solver.penetration(floor)>.01)continue;eye.copy(floor);eye.y+=1.65;const direction=target.clone().sub(eye);ray.set(eye,direction.clone().normalize());ray.near=.1;ray.far=direction.length()-.2;if(ray.intersectObjects(world.buildings??(world.collider?[world.collider]:[]),false).length)continue;apply();if(valid){found=true;break search;}}
   // A tight parking spot still gets a usable camera; the player's capsule stays put.
   if(!found){eye.copy(target).add(new THREE.Vector3(0,1.8,3.5));apply();}
   active=true;shots=0;capturedValid=false;preview.hidden=true;preview.querySelector('img').removeAttribute('src');ui.hidden=false;ui.dataset.phase=phase;document.body.classList.add('scooter-photo-active');scooter.traverse(o=>{if(o.isSprite&&o.visible){hiddenSprites.push(o);o.visible=false;}});beginFraming();return true;
  },
  keydown(e){if(!active)return false;return handlePhotoDialogKey(e,ui,{framing:phase==='framing',onShutter:take});},
  update(position){if(active){handset.updateAim();position.copy(frozen);apply();for(const sprite of hiddenSprites)sprite.visible=false;}},
  reset(){restore();phase='idle';shots=completed=0;capturedValid=false;preview.hidden=true;preview.querySelector('img').removeAttribute('src');},
  state:()=>({active,phase,valid,capturedValid,shots,completed,yaw,pitch,orientation:'portrait',required:true})
 };
}
