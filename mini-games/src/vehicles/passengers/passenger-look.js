import * as THREE from 'three';

// Look offsets stay relative to the moving cabin, including the Polybahn incline.
export function createPassengerLook(){
 let context=null,yaw=0,pitch=0;
 return {
  sync(next){if(next!==context){context=next;yaw=0;pitch=0;}return context;},
  active:()=>!!context,
  adjust(dx,dy){yaw+=dx;pitch=THREE.MathUtils.clamp(pitch+dy,-1.25,1.25);},
  update(dt,keys){if(!context)return;this.adjust((Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.8,(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt*1.3);},
  apply(view,camera){const up=(view.up??new THREE.Vector3(0,1,0)).clone().normalize(),direction=view.target.clone().sub(view.eye).normalize();direction.applyAxisAngle(up,yaw);const right=new THREE.Vector3().crossVectors(direction,up).normalize();direction.applyAxisAngle(right,pitch);camera.position.copy(view.eye);camera.up.copy(up);camera.lookAt(view.eye.clone().add(direction));},
  reset(){context=null;yaw=0;pitch=0;},
  state:()=>({context,yaw,pitch})
 };
}
