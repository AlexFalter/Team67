import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {handlePhotoDialogKey} from '../../shared/phone-camera/photo-dialog.js';
import {createEncounterSubtitle,createVoiceDialogue} from '../../shared/dialogue/encounter-ui.js';
import {touristVoiceLines} from './tourist-voice-lines.js';
import {mountPhoneCamera,cropPhonePhoto,cameraFrameLimits,phoneCameraFov} from '../../shared/phone-camera/phone-camera.js';
import * as THREE from 'three';
import {photoPointsInFrame,capturePhoto,aimPhotoCamera} from '../../shared/phone-camera/photo-camera.js';
import {createStudent} from '../../player/student-model.js';

export function createTouristPhoto(scene,world,solver,{capture,onComplete,obstacles=[],location,viewpoint,uiRoot=document.body,renderCanvas}){
 const group=new THREE.Group();group.name='Visiting Asian tourists';group.visible=false;scene.add(group);
 const rigs=['#4b8ea4','#ddad53','#a76791'].map((color,i)=>{const rig=createStudent();group.add(rig.player);rig.player.scale.setScalar(.95);rig.player.traverse(o=>{if(!o.isMesh)return;const c=o.material.color?.getHexString();if(c==='f4e7cc'||c==='bd8869'||c==='302e2a'){o.material=o.material.clone();o.material.color.set(c==='f4e7cc'?color:c==='302e2a'?'#171b20':'#d5a887');}});// Individual East Asian-inspired faces, dark hairstyles and varied complexions.
 const skin=['#d9b399','#e5c3a5','#cba486'][i];
 rig.player.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.material.color?.getHexString()==='d5a887'){mesh.material=mesh.material.clone();mesh.material.color.set(skin);}if(mesh.geometry?.type==='SphereGeometry'&&Math.abs(mesh.geometry.parameters.radius-.018)<.001){mesh.scale.set(1.15,.62,.65);}});
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),new THREE.MeshStandardMaterial({color:i===1?'#25211e':'#14181d',roughness:.85}));hair.position.set(0,i===2?1.59:1.71,.035);hair.scale.set(i===2?1.1:1,i===2?1.05:.45,.95);rig.player.add(hair);
 rig.player.position.x=(i-1)*1.15;return rig;});
 const ui=document.createElement('section');ui.id='tourist-photo';ui.hidden=true;ui.innerHTML=`<div class="tourist-request"><b>POLYTERRASSE · A SMALL FAVOR</b><p>Could you take two pictures of us — one vertical and one horizontal?</p><small>Keep everyone in frame. Start with the vertical picture.</small></div><div class="tourist-viewfinder"><i></i><i></i><i></i><i></i><span id="photo-framing">GROUP IN FRAME ✓</span></div><div class="tourist-camera-controls"><button id="tourist-shutter">● TAKE PHOTO</button><small>Move your mouse to frame the photo</small></div><div id="tourist-preview" hidden><img alt="Your photograph of the tourists"><p></p><button id="tourist-hand-back">HAND BACK</button><button id="tourist-retake">RETAKE</button></div>`;uiRoot.append(ui);
 const handset=mountPhoneCamera(ui,{onAim:aim,yawRange:.6,pitchRange:.35});
 let accepted=[],orientation='portrait';
 let active=false,used=false,phase='idle',yaw=0,pitch=0,shots=0,valid=false,originalFov=60;const frozen=new THREE.Vector3(),eye=new THREE.Vector3(),target=new THREE.Vector3();let camera;const hiddenSprites=[],ray=new THREE.Raycaster();
 const subtitle=createEncounterSubtitle('tourist-subtitle',{uiRoot}),voice=createVoiceDialogue(subtitle,{speaker:'Tourist'});
 let requestPlayed=false,thanksPlayed=false,audioFailed=false,audioGeneration=0;
 function playVoice(stage,kind){const generation=audioGeneration,audio=voice.speak(touristVoiceLines[stage]);audio.addEventListener('playing',()=>{if(generation!==audioGeneration)return;if(kind==='request')requestPlayed=true;if(kind==='thanks')thanksPlayed=true;},{once:true});audio.addEventListener('error',()=>{if(generation===audioGeneration)audioFailed=true;},{once:true});}
 function thankTourists(){playVoice('goodbye','thanks');}
 function restoreSigns(){for(const sprite of hiddenSprites)sprite.visible=true;hiddenSprites.length=0;}
 const shutter=ui.querySelector('#tourist-shutter'),framing=ui.querySelector('#photo-framing'),preview=ui.querySelector('#tourist-preview');
 function aim(dx,dy){if(phase!=='framing')return;yaw=THREE.MathUtils.clamp(yaw+dx,-.6,.6);pitch=THREE.MathUtils.clamp(pitch+dy,-.35,.35);applyCamera();}
 function applyCamera(){aimPhotoCamera(camera,eye,target,yaw,pitch);valid=photoPointsInFrame(camera,rigs.flatMap(r=>{const p=r.player.getWorldPosition(new THREE.Vector3());return [p.clone().add(new THREE.Vector3(0,.05,0)),p.clone().add(new THREE.Vector3(0,1.8,0))];}),...cameraFrameLimits(camera,orientation));shutter.disabled=!valid;framing.textContent=valid?'EVERYONE IN FRAME ✓':'KEEP ALL THREE PEOPLE IN FRAME';}
 function take(){if(!active||phase!=='framing'||!valid)return;applyCamera();capturePhoto(camera,capture);const photo=cropPhonePhoto(orientation,renderCanvas);handset.flash();playVoice(orientation==='portrait'?'sideways':'thanks','response');shots++;phase='preview';preview.querySelector('img').src=photo;preview.querySelector('p').textContent=orientation==='portrait'?'Great! Could you take one sideways as well?':'Both pictures look great. Thank you!';ui.querySelector('#tourist-hand-back').textContent=orientation==='portrait'?'KEEP · TURN PHONE SIDEWAYS':'HAND BACK BOTH PHOTOS';preview.hidden=false;ui.dataset.phase=phase;preview.querySelector('button').focus();}
 shutter.onclick=take;ui.querySelector('#tourist-retake').onclick=()=>{handset.resetPointer();phase='framing';preview.hidden=true;ui.dataset.phase=phase;shutter.focus();};ui.querySelector('#tourist-hand-back').onclick=()=>{if(phase!=='preview')return;accepted.push({orientation,src:preview.querySelector('img').src});if(orientation==='portrait'){orientation='landscape';handset.orientation(orientation);camera.fov=phoneCameraFov(camera,'landscape');camera.updateProjectionMatrix();yaw=pitch=0;phase='framing';preview.hidden=true;ui.dataset.phase=phase;ui.querySelector('.tourist-request > small').textContent='Picture 2 of 2 · Horizontal. Keep everyone in frame.';applyCamera();shutter.focus();return;}thankTourists();active=false;phase='complete';ui.hidden=true;restoreSigns();document.body.classList.remove('tourist-photo-active');camera.fov=originalFov;camera.updateProjectionMatrix();onComplete(frozen.clone());};

 // A permanent meeting spot on the station-to-terrace footpath, independent of how the player arrived.
 const photoStand=viewpoint.clone();photoStand.y=world.height(photoStand.x,photoStand.z);
 const heading=Math.atan2(photoStand.x-location.x,photoStand.z-location.z)+Math.PI;
 const occluders=[...world.buildings,world.groundMesh].filter(Boolean);
 function placeGroup(){
  let placement=null;
  search:for(const radius of [0,.5,1,2,3])candidate:for(let i=0;i<16;i++){
   const p=location.clone().add(new THREE.Vector3(Math.cos(i*Math.PI/8)*radius,0,Math.sin(i*Math.PI/8)*radius));p.y=world.height(p.x,p.z);
   for(const offset of [-1.15,0,1.15]){
    const q=new THREE.Vector3(offset,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),heading).add(p);q.y=world.height(q.x,q.z);
    if(world.isWater(q.x,q.z)||world.blocked(q.x,q.z)||solver.penetration(q)>.01)continue candidate;
    const origin=photoStand.clone().add(new THREE.Vector3(0,1.65,0)),direction=q.clone().add(new THREE.Vector3(0,1.55,0)).sub(origin);
    ray.set(origin,direction.clone().normalize());ray.near=.1;ray.far=direction.length()-.25;
    if(ray.intersectObjects(occluders,false).length)continue candidate;
   }
   placement=p;break search;
  }
  if(!placement)throw new Error('No safe tourist meeting spot near the Polyterrasse path');
  group.position.copy(placement);group.rotation.y=heading;group.visible=true;group.updateMatrixWorld(true);
  rigs.forEach(r=>{const p=r.player.getWorldPosition(new THREE.Vector3());r.player.position.y=world.height(p.x,p.z)-placement.y;});
  rigs[0].limbs[0].rotation.z=.6;rigs[2].limbs[2].rotation.z=-.6;
 }
 placeGroup();
 return {dispose(){this.reset();handset.dispose();ui.remove();subtitle.remove();disposeOwnedObject(group);},group,active:()=>active,
  start(position,viewCamera){if(active||used)return false;const placement=group.position.clone();
   if(!placement)return false;active=used=true;phase='framing';shots=0;accepted=[];orientation='portrait';handset.orientation(orientation);ui.querySelector('.tourist-request > small').textContent='Picture 1 of 2 · Vertical. Keep everyone in frame.';yaw=pitch=0;frozen.copy(position);camera=viewCamera;originalFov=camera.fov;camera.fov=phoneCameraFov(camera,'portrait');camera.updateProjectionMatrix();group.position.copy(placement);group.rotation.y=Math.atan2(photoStand.x-placement.x,photoStand.z-placement.z)+Math.PI;group.visible=true;scene.traverse(o=>{if(o.isSprite&&o.visible){hiddenSprites.push(o);o.visible=false;}});group.updateMatrixWorld(true);rigs.forEach(r=>{const p=r.player.getWorldPosition(new THREE.Vector3());r.player.position.y=world.height(p.x,p.z)-placement.y;});rigs[0].limbs[0].rotation.z=.6;rigs[2].limbs[2].rotation.z=-.6;eye.copy(photoStand);eye.y+=1.65;target.copy(placement);target.y+=1.1;preview.hidden=true;ui.hidden=false;ui.dataset.phase=phase;document.body.classList.add('tourist-photo-active');applyCamera();shutter.focus();playVoice('request','request');return true;
  },
  keydown(e){if(!active)return false;return handlePhotoDialogKey(e,ui,{framing:phase==='framing',onShutter:take});},
  update(position,viewCamera){if(active){handset.updateAim();position.copy(frozen);applyCamera();}else if(!used&&viewCamera&&Math.hypot(position.x-photoStand.x,position.z-photoStand.z)<3&&Math.abs(position.y-photoStand.y)<2){this.start(position,viewCamera);}},
  reset(){audioGeneration++;voice.reset();requestPlayed=thanksPlayed=audioFailed=false;restoreSigns();if(camera){camera.fov=originalFov;camera.updateProjectionMatrix();}active=used=false;phase='idle';shots=0;accepted=[];orientation='portrait';handset.orientation(orientation);group.visible=true;ui.hidden=true;preview.hidden=true;preview.querySelector('img').removeAttribute('src');document.body.classList.remove('tourist-photo-active');},
  state:()=>({active,used,phase,shots,orientation,accepted:accepted.map(p=>p.orientation),valid,yaw,pitch,unskippable:true,location:group.position.toArray(),meetingPoint:photoStand.toArray(),requestPlayed,thanksPlayed,audioFailed:audioFailed||voice.state().failed,thanksPending:false,voice:voice.state()})
 };
}
