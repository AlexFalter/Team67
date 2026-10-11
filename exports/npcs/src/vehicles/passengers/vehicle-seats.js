// Vehicle-local coordinates: position is the seated avatar root, eye is the
// passenger camera anchor, surface is the cushion/deck, yaw faces local -Z at 0.
const seat=(id,part,x,surfaceY,z,yaw=0,kind='seat',reservedFor=null)=>({id,part,kind,position:[x,kind==='seat'?surfaceY-.7875:surfaceY,z],surface:[x,surfaceY,z],eye:[x,kind==='seat'?surfaceY+.80:surfaceY+1.54,z],yaw,reservedFor});
const layouts={
 bike:[seat('saddle',0,0,1.0,.2,0,'saddle')],
 scooter:[seat('deck',0,0,.335,.2,0,'standing')],
 limousine:[seat('rear-left',0,-.58,1.03,1.12),seat('rear-right',0,.58,1.03,1.12),seat('facing-rear',0,-.58,1.03,-.12,Math.PI)],
 bus:[-4.45,-.85,.4,3.9,5.2,6.5].flatMap((z,row)=>[-1,1].map(side=>seat(`row-${row+1}-${side<0?'left':'right'}`,0,side*.82,1.205,z))),
 tram:[1,0,2].flatMap(part=>[-2.5,-1.3,2.5].flatMap((z,row)=>[-1,1].map(side=>seat(`car-${part+1}-row-${row+1}-${side<0?'left':'right'}`,part,side*.76,1.065,z)))),
 polybahn:[...[-1.65,-1.08,-.51,.06,.63,1.2].map((z,i)=>seat(`left-bench-${i+1}`,0,-.88,1.001,z,-Math.PI/2,'seat',i===5?'npc-eater':null)),...[-1.35,-.78,-.21,.36,.93,1.5].map((z,i)=>seat(`right-bench-${i+1}`,0,.88,1.001,z,Math.PI/2,'seat',i===0?'npc-67':null))],
 gangScooter:[seat('front-deck',0,0,.34,-.43,0,'standing'),seat('rear-deck',0,0,.34,.42,0,'standing'),seat('piggyback',0,0,1.11,.67,0,'piggyback')]
};
export const VEHICLE_SEATS=Object.freeze(Object.fromEntries(Object.entries(layouts).map(([type,seats])=>[type,Object.freeze(seats.map(s=>Object.freeze({...s,position:Object.freeze(s.position),surface:Object.freeze(s.surface),eye:Object.freeze(s.eye)})))])));
export const VEHICLE_CAPACITIES=Object.freeze(Object.fromEntries(Object.entries(VEHICLE_SEATS).map(([type,seats])=>[type,seats.length])));
