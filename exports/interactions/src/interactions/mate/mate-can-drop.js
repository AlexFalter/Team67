import * as THREE from 'three';
// Can is centred and lies sideways in the opening; the cabinet floor top is y=.26.
export function mateCanDropPose(age){
 const t=THREE.MathUtils.clamp(age,0,.95),impact=.28,after=Math.max(0,t-impact);
 const fallen=Math.min(1,t/impact),roll=1-(1-Math.min(t/.75,1))**3;
 const bounce=t<.95?.023*Math.exp(-8*after)*Math.abs(Math.sin(after*19)):0;
 return {x:.34,y:.341+.079*(1-fallen*fallen)+bounce,z:THREE.MathUtils.lerp(-.11,-.42,roll),
  tilt:t<.95?.025*Math.sin(after*22)*Math.exp(-9*after):0,
  roll:t<.95?Math.sin(Math.PI*t/.95)*.14:0,landed:age>=impact,done:age>=.95};
}
