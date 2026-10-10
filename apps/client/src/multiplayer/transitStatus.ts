import * as C from '@race/shared';
export function transitStatus(v:C.VehicleState,now:number){
 if(v.derailStartedAt)return 'Derailed · service suspended';
 if(v.traveling){
  if(C.isRail(v)&&now<v.tripStartedAt)return 'Doors closing';
  return `Arriving in ${Math.max(0,Math.ceil((v.arrivalAt-now)/1000))}s`;
 }
 return v.departureAt ? `Departs in ${Math.max(0,Math.ceil((v.departureAt-now)/1000))}s` : 'Waiting for passengers';
}
