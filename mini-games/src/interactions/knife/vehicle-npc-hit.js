// Sweep actual vehicle movement, so hits work at speed and behind walls cannot score.
export function hitNpcsWithVehicle(from,to,dt,people,{kind='bike',onHit=()=>{}}={}){
 if(!Number.isFinite(dt)||dt<=0)return 0;
 const velocity=to.clone().sub(from).divideScalar(dt);velocity.y=0;if(velocity.length()<3)return 0;
 const a=from.clone();a.y+=.9;const b=to.clone();b.y+=.9;let hits=0;
 for(const person of people){let visible=true;for(let actor=person.rig.player;actor;actor=actor.parent)if(!actor.visible){visible=false;break;}
  if(visible&&person.knockdown.strike(a,b,velocity)){hits++;onHit(person,kind);}
 }
 return hits;
}
