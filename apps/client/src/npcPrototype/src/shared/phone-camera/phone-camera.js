import {createFeatureLifecycle} from '../runtime/feature-lifecycle.js';
import {gameConfig} from '../../config/game-config.js';
import {createCameraAim} from './camera-aim.js';
import {phoneShellMarkup} from '../../ui/phone/phone-shell.js';
// Camera app uses the same handset casing and status bar as the regular phone.
const previews=new Set();
export function photoCrop(width,height,orientation='landscape'){
 const ratio=orientation==='portrait'?3/4:4/3,w=Math.min(width,height*ratio),h=w/ratio;
 return {x:(width-w)/2,y:(height-h)/2,w,h};
}
export function phoneCameraFov(camera,orientation){const ratio=orientation==='portrait'?3/4:4/3,base=orientation==='portrait'?gameConfig.camera.portraitFovDegrees:gameConfig.camera.landscapeFovDegrees;return 2*Math.atan(Math.tan(base*Math.PI/360)*ratio/Math.min(camera.aspect,ratio))*180/Math.PI;}
export function cameraFrameLimits(camera,orientation){const c=photoCrop(camera.aspect,1,orientation);return [c.w/camera.aspect*gameConfig.camera.frameCoverage,c.h*gameConfig.camera.frameCoverage];}
export function cropPhonePhoto(orientation,source=document.querySelector('#game canvas')){
 // capturePhoto supplies the freshly rendered canvas synchronously.
 if(!source)throw Error('Photo capture requires the host render canvas');
 const c=photoCrop(source.width,source.height,orientation),out=document.createElement('canvas');out.width=Math.round(c.w);out.height=Math.round(c.h);out.getContext('2d').drawImage(source,c.x,c.y,c.w,c.h,0,0,out.width,out.height);return out.toDataURL('image/png');
}
export function mountPhoneCamera(ui,{onAim=()=>{},yawRange=.6,pitchRange=.35,appName='Camera',fullViewAim=true,edgePan=fullViewAim,cursor='crosshair'}={}){
 const lifecycle=createFeatureLifecycle();
 ui.classList.add('phone-encounter');
 const request=ui.querySelector('.tourist-request'),device=document.createElement('div');device.className='photo-phone phone-handset';
 device.innerHTML=phoneShellMarkup('<div class="photo-app-title"><span class="phone-app-name"></span><span class="photo-orientation">HORIZONTAL · 4:3</span></div>');device.querySelector('.phone-app-name').textContent=appName;
 const screen=device.querySelector('.phone-screen');for(const node of [...ui.children])if(node!==request)screen.append(node);ui.append(device);
 const canvas=document.createElement('canvas');canvas.className='phone-camera-live';ui.querySelector('.tourist-viewfinder').prepend(canvas);
 const record={ui,canvas,orientation:'landscape'};previews.add(record);
 const surface=ui.querySelector('.tourist-viewfinder'),aim=createCameraAim({onAim,yawRange,pitchRange});let lastTick=performance.now();
 surface.style.pointerEvents='auto';surface.style.touchAction='none';surface.style.cursor=cursor;if(fullViewAim)ui.style.cursor=cursor;
 const aimSurface=fullViewAim?ui:surface;
 lifecycle.listen(fullViewAim?document:aimSurface,'pointermove',e=>{if(ui.hidden||ui.inert||ui.dataset.phase!=='framing')return;if(fullViewAim&&e.target.closest('button')){aim.resetPointer();return;}const r=fullViewAim?{left:0,top:0,width:window.innerWidth,height:window.innerHeight}:aimSurface.getBoundingClientRect();aim.move(e.clientX-r.left,e.clientY-r.top,r.width,r.height,{edgePan:edgePan&&e.pointerType!=='touch'});});
 // Keep deliberate edge turning when the mouse reaches the browser boundary.
 // Blur, cancellation and touch release still stop it immediately.
 lifecycle.listen(document,'pointercancel',aim.resetPointer);
 lifecycle.listen(document,'pointerup',e=>{if(e.pointerType==='touch')aim.resetPointer();});
 if(!fullViewAim)lifecycle.listen(surface,'pointerleave',aim.resetPointer);
 lifecycle.listen(window,'blur',aim.resetPointer);lifecycle.listen(window,'resize',aim.resetPointer);
 function resetAim(options){aim.reset(options);lastTick=performance.now();}
 function updateAim(){const now=performance.now(),dt=(now-lastTick)/1000;lastTick=now;const framing=!ui.hidden&&!ui.inert&&ui.dataset.phase==='framing';if(!framing){aim.resetPointer();return;}aim.update(dt);}

 lifecycle.own(()=>{previews.delete(record);device.remove();});
 return {dispose:()=>lifecycle.dispose(),resetAim,updateAim,resetPointer:aim.resetPointer,orientation(value){resetAim();record.orientation=value;ui.dataset.orientation=value;device.querySelector('.photo-orientation').textContent=value==='portrait'?'VERTICAL · 3:4':'HORIZONTAL · 4:3';},flash(){device.classList.remove('shutter-flash');void device.offsetWidth;device.classList.add('shutter-flash');}};
}
export function drawPhoneCameraPreviews(source){for(const p of previews){if(p.ui.hidden||p.ui.dataset.phase!=='framing')continue;const c=photoCrop(source.width,source.height,p.orientation);const width=gameConfig.camera.previewWidth,height=Math.round(width*c.h/c.w);if(p.canvas.width!==width||p.canvas.height!==height){p.canvas.width=width;p.canvas.height=height;}p.canvas.getContext('2d').drawImage(source,c.x,c.y,c.w,c.h,0,0,width,height);}}
