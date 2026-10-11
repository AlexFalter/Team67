import './limousine-look.css';
import * as THREE from 'three';

// Owns ride camera input only; movement and encounter timing remain host-owned.
export function createLimousineLook(canvas,{active=()=>false,label='LIMO'}={}){
 const hint=document.createElement('div');hint.className='limo-look-hint';hint.hidden=true;canvas?.parentElement?.append(hint);
 const abort=new AbortController(),keys=new Set();let yaw=0,pitch=0,firstPerson=true,drag=null,pointer=null,projection=null,capturing=false,wasActive=false;
 const listen=(target,type,fn)=>target?.addEventListener(type,fn,{signal:abort.signal});
 function restoreProjection(){if(projection){projection.camera.near=projection.near;projection.camera.updateProjectionMatrix();projection=null;}}
 async function capture(){if(!active()||!canvas||capturing||!document.hasFocus()||document.hidden||document.pointerLockElement===canvas)return;capturing=true;try{await canvas.requestPointerLock();if(!active()&&document.pointerLockElement===canvas)document.exitPointerLock();}catch{/* Retry on the next key or canvas click. */}finally{capturing=false;}}
 function adjust(dx,dy){yaw-=dx*.003;pitch=THREE.MathUtils.clamp(pitch-dy*.003,-1.1,1.1);}
 listen(canvas,'pointerdown',e=>{if(!active()||e.button!==0)return;if(e.pointerType!=='touch'){void capture();return;}drag={id:e.pointerId,x:e.clientX,y:e.clientY};e.preventDefault();});
 listen(window,'pointermove',e=>{if(!active())return;if(document.pointerLockElement===canvas){adjust(e.movementX,e.movementY);return;}if(e.pointerType==='touch'){if(!drag||drag.id!==e.pointerId)return;adjust(e.clientX-drag.x,e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;return;}// Desktop look only uses locked deltas so the cursor cannot leave the game.
 return;});
 listen(canvas,'pointerenter',()=>pointer=null);listen(canvas,'pointerleave',()=>pointer=null);
 listen(window,'pointerup',()=>drag=null);listen(window,'pointercancel',()=>drag=null);
 listen(window,'keyup',e=>keys.delete(e.code));listen(window,'blur',()=>{keys.clear();drag=pointer=null;});
 return {resumeCapture(){if(active()){canvas?.focus();return capture();}},keydown(e){if(!active())return false;if(e.code!=='Escape')void capture();if(e.code==='KeyV'&&!e.repeat){firstPerson=!firstPerson;return true;}if(e.code.startsWith('Arrow')){keys.add(e.code);return true;}return false;},
  update(dt,limo,camera,seat,world){
   const enabled=active();if(!enabled){keys.clear();drag=pointer=null;}if(enabled&&!wasActive)void capture();wasActive=enabled;
   projection??={camera,near:camera.near};const near=firstPerson?Math.min(projection.near,.035):projection.near;if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
   hint.hidden=false;hint.textContent=`${label} · MOUSE / ARROWS: LOOK · V: ${firstPerson?'EXTERIOR':'FIRST PERSON'}`;
   yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.5;
   pitch=THREE.MathUtils.clamp(pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt,-1.1,1.1);
   limo.updateMatrixWorld(true);const facing=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw+(seat.yaw??0),0,'YXZ'));
   if(firstPerson){camera.position.copy(limo.localToWorld(new THREE.Vector3(...seat.eye)));camera.quaternion.copy(limo.getWorldQuaternion(new THREE.Quaternion())).multiply(facing);camera.up.set(0,1,0);}
   else {
    const target=limo.localToWorld(new THREE.Vector3(0,1,-.5)),orbit=new THREE.Vector3(0,2.4,7.5).applyQuaternion(facing).applyQuaternion(limo.getWorldQuaternion(new THREE.Quaternion())),eye=target.clone().add(orbit);
    const ray=new THREE.Raycaster(target,orbit.clone().normalize(),.25,orbit.length()),hit=ray.intersectObjects([...world.buildings,world.groundMesh],true)[0];
    if(hit)eye.copy(target).addScaledVector(orbit.normalize(),Math.max(.4,hit.distance-.35));camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(target);
   }
  },pause(){restoreProjection();hint.hidden=true;wasActive=false;keys.clear();drag=pointer=null;},reset(){restoreProjection();hint.hidden=true;yaw=pitch=0;firstPerson=true;wasActive=false;keys.clear();drag=pointer=null;},dispose(){restoreProjection();hint.remove();abort.abort();keys.clear();drag=pointer=null;},state:()=>({firstPerson,yaw,pitch,dragging:!!drag})};
}
