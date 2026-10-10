import * as THREE from 'three';
import {defaultItemInventory} from '../../interactions/inventory/item-inventory.js';
import {createFeatureLifecycle,disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';

// Host supplies target hit handling, so remote avatars can share the same kick.
export function createFootballItem(scene,world,{camera,inventory=defaultItemInventory(),canUse=()=>true,onHit=()=>false,onKick=()=>{},onEquip=()=>{}}={}){
 const life=createFeatureLifecycle(),geometry=new THREE.IcosahedronGeometry(.16,1);geometry.clearGroups();for(let i=0;i<geometry.attributes.position.count;i+=3)geometry.addGroup(i,3,i%15===0?1:0);
 const ball=new THREE.Mesh(geometry,[new THREE.MeshStandardMaterial({color:'#f6f4e8',flatShading:true}),new THREE.MeshStandardMaterial({color:'#161d21',flatShading:true})]);ball.visible=false;ball.name='Reward football';scene.add(ball);
 const boot=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.35),new THREE.MeshStandardMaterial({color:'#20252a'}));boot.visible=false;boot.position.set(.22,-.63,-.5);camera?.add(boot);
 const ui=document.createElement('aside');ui.hidden=true;ui.style.padding='8px';const button=document.createElement('button');button.type='button';button.textContent='⚽ Football · 4 EQUIP';Object.assign(button.style,{color:'white',background:'#223441',border:'1px solid #526574',padding:'10px',cursor:'pointer'});ui.append(button);inventory.slot('spare').append(ui);
 let granted=false,owned=false,equipped=false,inWorld=false,flight=null,kickAge=0,kicks=0,hits=0,enabled=false;const position=new THREE.Vector3(),direction=new THREE.Vector3(),velocity=new THREE.Vector3();
 function render(visible=true){ui.hidden=!owned||!visible;inventory.setItem('spare',owned);button.textContent=equipped?'⚽ Football · Q / CLICK: KICK':'⚽ Football · 4 EQUIP';button.disabled=!canUse();inventory.show(visible);}
 function toggle(){if(life.disposed||!owned||!canUse()||flight)return false;equipped=!equipped;if(equipped)onEquip();render();return true;}
 life.listen(button,'click',toggle);
 function kick(){if(life.disposed||!owned||!equipped||flight||!enabled||!canUse())return false;camera.getWorldDirection(direction);direction.y=Math.max(.12,Math.min(.6,direction.y+.22));direction.normalize();velocity.copy(direction).multiplyScalar(19);flight={age:0,hit:false};owned=false;equipped=false;inWorld=true;render();kickAge=.24;kicks++;onKick({origin:ball.position.toArray(),velocity:velocity.toArray()});return true;}
 life.own(()=>{inventory.setItem('spare',false);ui.remove();disposeOwnedObject(ball);disposeOwnedObject(boot);});
 return {ball,toggle,kick,holster(){equipped=false;boot.visible=false;},
  add(){if(granted||life.disposed)return false;granted=owned=true;render();return true;},
  near(p){return inWorld&&!flight&&Math.hypot(p.x-ball.position.x,p.z-ball.position.z)<1.4&&Math.abs(p.y+.16-ball.position.y)<1;},
  pickup(p){if(life.disposed||!canUse()||!this.near(p))return false;inWorld=false;owned=true;equipped=false;ball.visible=false;render();return true;},
  keydown(e){if(e.repeat)return false;if(e.code==='Digit4'&&owned&&canUse()){e.preventDefault();toggle();return true;}if(e.code==='KeyQ'&&equipped&&canUse()){e.preventDefault();kick();return true;}return false;},
  update(dt,p,{visible=true,walking=true,paused=false}={}){if(life.disposed)return;position.copy(p);enabled=walking;render(visible);if(paused){boot.visible=false;return;}dt=Math.max(0,Math.min(dt,.1));kickAge=Math.max(0,kickAge-dt);boot.visible=walking&&kickAge>0;boot.rotation.x=-Math.sin(kickAge/.24*Math.PI)*.7;
   if(flight){flight.age+=dt;const steps=Math.max(1,Math.ceil(velocity.length()*dt/.15)),h=dt/steps;
    for(let i=0;i<steps;i++){const from=ball.position.clone(),to=from.clone().addScaledVector(velocity,h);if(!flight.hit&&onHit(from,to,velocity.clone())){flight.hit=true;hits++;velocity.multiplyScalar(.3);}if(world.isWater?.(to.x,to.z)||world.blocked(to.x,to.z)||world.bodyBlocked?.(to.x,to.y,to.z,.16,.32)){velocity.x*=-.4;velocity.z*=-.4;}else ball.position.copy(to);velocity.y-=12*h;const floor=world.height(ball.position.x,ball.position.z)+.16;if(ball.position.y<floor){ball.position.y=floor;velocity.y=Math.abs(velocity.y)*.35;velocity.x*=.94;velocity.z*=.94;}}
    ball.rotation.x-=dt*velocity.length()*3;ball.visible=true;if((flight.age>.5&&velocity.length()<.65)||flight.age>=5){flight=null;velocity.set(0,0,0);ball.position.y=world.height(ball.position.x,ball.position.z)+.16;}
   }else if(inWorld){ball.visible=true;}else{ball.visible=owned&&equipped&&walking;if(ball.visible){camera.getWorldDirection(direction);direction.y=0;direction.normalize();ball.position.copy(position).addScaledVector(direction,.8);ball.position.y=world.height(ball.position.x,ball.position.z)+.16;}}
  },
  reset(){granted=owned=equipped=inWorld=false;flight=null;kickAge=kicks=hits=0;ball.visible=boot.visible=false;render();},dispose:()=>life.dispose(),
  state:()=>({granted,owned,equipped,inWorld,pickupAvailable:inWorld&&!flight,flying:!!flight,kicks,hits,position:ball.position.toArray()}),
 };
}
