import assert from 'node:assert/strict';
import * as THREE from 'three';
import {aimPhotoCamera,photoPointsInFrame} from './photo-camera.js';
import {handlePhotoDialogKey} from './photo-dialog.js';
import {createVoiceDialogue} from './encounter-ui.js';
const camera=new THREE.PerspectiveCamera(60,1,.1,100),eye=new THREE.Vector3(4,2,5),target=eye.clone().add(new THREE.Vector3(0,0,-10));
const originalEye=eye.clone(),originalTarget=target.clone();
aimPhotoCamera(camera,eye,target);assert(camera.position.equals(eye));assert(photoPointsInFrame(camera,[target]));
aimPhotoCamera(camera,eye,target,Math.PI/2);assert(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(-1,0,0))<1e-9);
aimPhotoCamera(camera,eye,target,0,Math.PI/4);assert(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,Math.SQRT1_2,-Math.SQRT1_2))<1e-9);
assert(eye.equals(originalEye)&&target.equals(originalTarget),'aiming leaves encounter anchors intact');assert.equal(camera.fov,60);
// Check real keyboard contracts at dialog boundaries, including unavailable actions.
globalThis.document={activeElement:null};
function button({disabled=false,visible=true}={}){return {tagName:'BUTTON',disabled,getClientRects:()=>visible?[{}]:[],focus(){document.activeElement=this;}};}
const first=button(),disabled=button({disabled:true}),hidden=button({visible:false}),last=button(),ui={querySelectorAll:()=>[first,disabled,hidden,last]};let shots=0;
function key(code,extra={}){const event={code,repeat:false,shiftKey:false,preventDefault(){this.prevented=true;},...extra};handlePhotoDialogKey(event,ui,{framing:true,onShutter:()=>shots++});return event;}
first.focus();key('Tab');assert.equal(document.activeElement,last);key('Tab');assert.equal(document.activeElement,first);key('Tab',{shiftKey:true});assert.equal(document.activeElement,last);
assert(!key('Enter').prevented,'button Enter retains browser activation');key('Space');key('Space',{repeat:true});assert.equal(shots,1);assert(key('Escape').prevented,'mandatory photo cannot be closed');
handlePhotoDialogKey({code:'Space',preventDefault(){}},ui,{framing:false,onShutter:()=>shots++});assert.equal(shots,1,'preview cannot fire shutter');
handlePhotoDialogKey({code:'Tab',preventDefault(){}},{querySelectorAll:()=>[]},{framing:true,onShutter:()=>{}});
// Reuse the voice helper for a different speaker and check reset during pending play.
let resolvePlay;
globalThis.Audio=class{paused=true;currentTime=0;play(){this.paused=false;return new Promise(resolve=>{resolvePlay=resolve;});}pause(){this.paused=true;}};
const subtitle={hidden:true,textContent:''},voice=createVoiceDialogue(subtitle,{speaker:'Inspector',formatLine:line=>line.text});
const audio=voice.speak([{id:'fare',src:'/fare.mp3',text:'Tickets, please.'}]);assert.equal(subtitle.textContent,'Inspector: Tickets, please.');assert(!subtitle.hidden);voice.reset();resolvePlay();await Promise.resolve();assert(audio.paused&&subtitle.hidden);assert.equal(voice.state().line,null);assert(!voice.state().played,'stale playback never revives reset dialogue');
console.log('PASS: camera direction and anchors, unchanged FOV, dialog focus wrap/disabled/hidden controls, native Enter, shutter repeat/preview guards, configurable speaker and reset/play race.');
