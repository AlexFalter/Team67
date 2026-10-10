// Encounter placement math only. Main owns terrain, passages, BVHs and raycasts.
export function nearSegment(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return {distance:Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)};
}
