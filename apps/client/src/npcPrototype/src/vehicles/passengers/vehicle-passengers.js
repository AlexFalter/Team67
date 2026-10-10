// Passenger IDs and stable local slots can also be used by a multiplayer host.
import {VEHICLE_SEATS,VEHICLE_CAPACITIES} from './vehicle-seats.js';
export {VEHICLE_CAPACITIES};
export const BOARDING_SECONDS=8;
export function createVehiclePassengers(type,id=type){
 const capacity=VEHICLE_CAPACITIES[type];
 if(!capacity)throw new Error(`Unknown vehicle type: ${type}`);
 const occupants=new Map();let remaining=0,boarding=false;
 return {
  board(playerId='local',preferredSlot=null){
   if(typeof playerId!=='string'||!playerId||occupants.has(playerId)||occupants.size>=capacity)return null;
   const used=new Set(occupants.values());let slot=preferredSlot??0;if(preferredSlot!==null&&(!Number.isInteger(slot)||slot<0||slot>=capacity||used.has(slot)))return null;while(used.has(slot))slot++;
   occupants.set(playerId,slot);return {playerId,slot,seat:VEHICLE_SEATS[type][slot]};
  },
  leave(playerId='local'){return occupants.delete(playerId);},
  slot(playerId='local'){return occupants.get(playerId)??null;},
  seat(playerId='local'){const slot=occupants.get(playerId);return slot===undefined?null:VEHICLE_SEATS[type][slot];},
  beginBoarding(){if(!boarding){boarding=true;remaining=BOARDING_SECONDS;}},
  tick(dt){if(boarding&&Number.isFinite(dt))remaining=Math.max(0,remaining-Math.max(0,dt));return boarding&&remaining===0;},
  closeBoarding(){boarding=false;remaining=0;},
  clear(){occupants.clear();boarding=false;remaining=0;},
  snapshot(){return {version:1,id,type,boarding,remaining,passengers:[...occupants].map(([playerId,slot])=>({playerId,slot}))};},
  restore(snapshot){
   if(snapshot?.version!==1||snapshot.id!==id||snapshot.type!==type||typeof snapshot.boarding!=='boolean'||!Number.isFinite(snapshot.remaining)||snapshot.remaining<0||snapshot.remaining>BOARDING_SECONDS||!snapshot.boarding&&snapshot.remaining!==0||!Array.isArray(snapshot.passengers)||snapshot.passengers.length>capacity)throw Error('Invalid passenger snapshot');
   const next=new Map(),slots=new Set();
   for(const {playerId,slot} of snapshot.passengers){if(typeof playerId!=='string'||!playerId||next.has(playerId)||!Number.isInteger(slot)||slot<0||slot>=capacity||slots.has(slot))throw Error('Invalid passenger assignment');next.set(playerId,slot);slots.add(slot);}
   occupants.clear();next.forEach((slot,playerId)=>occupants.set(playerId,slot));boarding=snapshot.boarding;remaining=snapshot.remaining;
  },
  state(){return {id,type,capacity,occupancy:occupants.size,available:capacity-occupants.size,boarding,departureIn:remaining,seats:VEHICLE_SEATS[type],passengers:[...occupants].map(([playerId,slot])=>({playerId,slot,seatId:VEHICLE_SEATS[type][slot].id}))};}
 };
}
