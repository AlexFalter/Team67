// Sweep the walking segment through the entire entrance, including either edge.
export function crossesStationDoorway(previous,current,door){
 if(Math.abs(current.y-door.height)>2)return false;
 const [nx,nz]=door.normal,[x,z]=door.position;
 const local=p=>({u:(p.x-x)*nx+(p.z-z)*nz,v:-(p.x-x)*nz+(p.z-z)*nx});
 const a=local(previous??current),b=local(current);let enter=0,exit=1;
 for(const [key,limit] of [['u',door.halfDepth],['v',door.halfWidth]]){
  const delta=b[key]-a[key];
  if(Math.abs(delta)<1e-8){if(Math.abs(a[key])>limit)return false;continue;}
  const t0=(-limit-a[key])/delta,t1=(limit-a[key])/delta;
  enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
  if(enter>exit)return false;
 }
 return true;
}

// Boarding alone does not count: the recorded journey must have reached its arrival time.
export function completedUnticketedPolybahnRide(ride,now){
 return !!ride&&Number.isFinite(ride.arrival)&&now>=ride.arrival-100&&!ride.ticketed;
}
