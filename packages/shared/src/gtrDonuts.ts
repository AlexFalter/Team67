import layout from './npc-layout.json' with {type:'json'};
export const GTR_DONUTS=layout.gtrDonuts;
// Absolute shared server time keeps every client on the same uninterrupted lap.
export function gtrDonutPose(now:number){
 const {center,radius,periodSeconds,slipAngle}=GTR_DONUTS,phase=((now/1000)%periodSeconds)/periodSeconds,angle=phase*Math.PI*2;
 return {x:center[0]+Math.cos(angle)*radius,z:center[2]+Math.sin(angle)*radius,rotY:Math.PI-angle+slipAngle,phase,speed:radius*Math.PI*2/periodSeconds};
}
