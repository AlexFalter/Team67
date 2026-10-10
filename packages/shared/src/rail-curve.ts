import type {GroundPoint} from './world.ts';

// Remove short survey/terrain ripples in metres, independent of sample density.
// Limit displacement to retain station alignment and the validated rail corridor.
export function smoothRailPoints(points:readonly GroundPoint[], distances:readonly number[]){
 return points.map((p,i)=>{
  if(i===0||i===points.length-1)return {...p};
  const result={x:0,y:0,z:0};let weight=0;
  for(let j=i;j>=0&&distances[i]-distances[j]<=6;j--){
   const w=Math.exp(-(((distances[j]-distances[i])/2.5)**2)/2);
   for(const axis of ['x','y','z'] as const)result[axis]+=points[j][axis]*w;weight+=w;
  }
  for(let j=i+1;j<points.length&&distances[j]-distances[i]<=6;j++){
   const w=Math.exp(-(((distances[j]-distances[i])/2.5)**2)/2);
   for(const axis of ['x','y','z'] as const)result[axis]+=points[j][axis]*w;weight+=w;
  }
  // Fade at endpoints to preserve the station's approach tangent.
  const fade=Math.min(1,distances[i]/6,(distances.at(-1)!-distances[i])/6);
  for(const axis of ['x','y','z'] as const){const limit=axis==='y'?.18:.35;result[axis]=p[axis]+Math.max(-limit,Math.min(limit,result[axis]/weight-p[axis]))*fade;}
  return result;
 });
}

// Monotone Hermite interpolation: continuous velocity without overshooting
// the sampled rail corridor or introducing a separate client-only trajectory.
export function createRailCurve(points:readonly GroundPoint[],distances:readonly number[]){
 const axes=['x','y','z'] as const;
 const slopes=axes.map(axis=>points.map((_,i)=>{
  const secant=(j:number)=>(points[j+1][axis]-points[j][axis])/(distances[j+1]-distances[j]);
  if(i===0)return secant(0);if(i===points.length-1)return secant(i-1);
  const before=secant(i-1),after=secant(i);
  if(before*after<=0)return 0;
  const a=distances[i]-distances[i-1],b=distances[i+1]-distances[i],w1=2*b+a,w2=b+2*a;
  return (w1+w2)/(w1/before+w2/after);
 }));
 return (distance:number):GroundPoint=>{
  const d=Math.max(0,Math.min(distances.at(-1)!,distance));let lo=0,hi=points.length-2;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(distances[mid]<=d)lo=mid;else hi=mid-1;}
  const h=distances[lo+1]-distances[lo],t=(d-distances[lo])/h,t2=t*t,t3=t2*t;
  const result={x:0,y:0,z:0};
  axes.forEach((axis,k)=>{result[axis]=(2*t3-3*t2+1)*points[lo][axis]+(t3-2*t2+t)*h*slopes[k][lo]+(-2*t3+3*t2)*points[lo+1][axis]+(t3-t2)*h*slopes[k][lo+1];});
  return result;
 };
}
export function smoothRailOffsets(values:readonly number[]){
 return values.map((value,i)=>{
  if(i===0||i===values.length-1)return value;
  let sum=0,weight=0;for(let j=Math.max(0,i-3);j<=Math.min(values.length-1,i+3);j++){const w=Math.exp(-(((j-i)/1.5)**2)/2);sum+=values[j]*w;weight+=w;}
  return sum/weight;
 });
}
// Smoothly meet at the off-centre passing loop, with no midpoint speed jump.
export function passingLoopProgress(progress:number,meeting:number){
 const bias=2*(2*meeting-1);
 return {position:progress+bias*progress*(1-progress),speed:1+bias*(1-2*progress)};
}
