import type {MapPoint} from '../raceHudModel.ts';
export function routeDistance(points:readonly MapPoint[]){let distance=0;for(let i=1;i<points.length;i++)distance+=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);return distance;}
export function routeDistanceLabel(distance:number){return distance>=1000?`${(distance/1000).toFixed(2)} km`:`${Math.round(distance)} m`;}
/** Follow the current route rather than snapping onto a later parallel street. */
export function remainingRoute(points:readonly MapPoint[],position:MapPoint):MapPoint[]{
 if(points.length<2)return [...points];
 let best=Infinity,index=0,closest=points[0];
 for(let i=1;i<Math.min(points.length,6);i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/length)):0;
  const projected={x:a.x+dx*t,z:a.z+dz*t},distance=Math.hypot(projected.x-position.x,projected.z-position.z);
  if(distance<best){best=distance;index=i;closest=projected;}
 }
 return [closest,...points.slice(index)];
}
