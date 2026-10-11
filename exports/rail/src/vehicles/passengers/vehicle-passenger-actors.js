import {createStudent} from '../../player/student-model.js';
// Render the passenger roster in cabin coordinates, so everyone follows turns
// and slopes together. The local player retains their existing camera/animation.
export function createPassengerActors(scene,passengers,locate){
 const actors=new Map();
 return function sync(){
  const roster=passengers.state().passengers.filter(p=>p.playerId!=='local'&&!p.playerId.startsWith('npc-'));
  const present=new Set(roster.map(p=>p.playerId));
  for(const [id,actor] of actors)if(!present.has(id)){scene.remove(actor);actors.delete(id);}
  for(const passenger of roster){
   let actor=actors.get(passenger.playerId);
   if(!actor){const rig=createStudent();actor=rig.player;actor.userData.passengerRig=rig;actor.name=`Passenger ${passenger.playerId}`;actors.set(passenger.playerId,actor);scene.add(actor);}
   const pose=locate(passenger.slot);actor.position.copy(pose.position);actor.quaternion.copy(pose.quaternion);actor.rotateY(pose.yaw??0);const rig=actor.userData.passengerRig;if(pose.kind==='seat'){rig.limbs[1].rotation.x=rig.limbs[3].rotation.x=Math.PI/2;rig.knees.forEach(k=>k.rotation.x=-Math.PI/2);}
  }
 };
}
