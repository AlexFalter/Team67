import {gameConfig} from '../config/game-config.js';
import * as THREE from 'three';
export function createPlayerSlide(){
 const direction=new THREE.Vector2();let heading=0,active=false,age=0,speed=0,cooldown=0,offset=0,slides=0;
 const tuning=gameConfig.player.slide,duration=tuning.durationSeconds;
 return {
  start(startHeading,currentSpeed,grounded){if(active||cooldown>0||!grounded||currentSpeed<tuning.minimumSpeed)return false;heading=startHeading;direction.set(-Math.sin(heading),-Math.cos(heading));speed=Math.min(currentSpeed+tuning.speedBonus,tuning.maximumSpeed);active=true;age=0;slides++;return true;},
  update(dt,allowed){cooldown=Math.max(0,cooldown-dt);if(active){if(!allowed)this.cancel();else{age+=dt;speed=Math.max(0,speed-tuning.friction*dt);if(age>=duration)this.cancel();}}offset=THREE.MathUtils.damp(offset,active?tuning.cameraDrop:0,active?18:12,dt);return {x:active?direction.x*speed:0,z:active?direction.y*speed:0,speed};},
  cancel(){if(active){active=false;cooldown=tuning.cooldownSeconds;}},active:()=>active,height:()=>offset,
  reset(){heading=0;active=false;age=speed=cooldown=offset=slides=0;},
  state:()=>({heading,active,age,speed,cooldown,cameraOffset:offset,slides,duration})
 };
}
