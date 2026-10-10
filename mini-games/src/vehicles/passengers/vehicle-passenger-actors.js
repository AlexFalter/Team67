import {disposeOwnedObject} from '../../shared/runtime/feature-lifecycle.js';
import {createStudent} from '../../player/student-model.js';
// Render the passenger roster in cabin coordinates, so everyone follows turns
// and slopes together. The local player retains their existing camera/animation.
export function createPassengerActors(scene,passengers,locate,{localPlayerId='local',createActor=()=>createStudent(),releaseActor=disposeOwnedObject}={}){
 const actors=new Map();
 function sync(){
  const roster=passengers.state().passengers.filter(p=>p.playerId!==localPlayerId&&!p.playerId.startsWith('npc-'));
  const present=new Set(roster.map(p=>p.playerId));
  for(const [id,actor] of actors)if(!present.has(id)){releaseActor(actor);actors.delete(id);}
  for(const passenger of roster){
   let actor=actors.get(passenger.playerId);
   if(!actor){const rig=createActor();actor=rig.player;actor.userData.passengerRig=rig;actor.name=`Passenger ${passenger.playerId}`;actors.set(passenger.playerId,actor);scene.add(actor);}
   const pose=locate(passenger.slot);actor.position.copy(pose.position);actor.quaternion.copy(pose.quaternion);actor.rotateY(pose.yaw??0);const rig=actor.userData.passengerRig;if(pose.kind==='seat'){rig.limbs[1].rotation.x=rig.limbs[3].rotation.x=Math.PI/2;rig.knees.forEach(k=>k.rotation.x=-Math.PI/2);}
  }
 }
 sync.dispose=()=>{actors.forEach(releaseActor);actors.clear();};
 return sync;
}
