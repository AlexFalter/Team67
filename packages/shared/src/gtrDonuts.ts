import type {MovementWorld} from './world.ts';
import layout from './npc-layout.json' with {type:'json'};
export const GTR_DONUTS=layout.gtrDonuts;
export const GTR_DONUTS_ID='gtr-donuts';
// Absolute shared server time keeps every client on the same uninterrupted lap.
export function gtrDonutPose(now:number){
 const {center,radius,periodSeconds,slipAngle}=GTR_DONUTS,phase=((now/1000)%periodSeconds)/periodSeconds,angle=phase*Math.PI*2;
 return {x:center[0]+Math.cos(angle)*radius,z:center[2]+Math.sin(angle)*radius,rotY:Math.PI-angle+slipAngle,velocityHeading:Math.atan2(-Math.sin(angle),Math.cos(angle)),phase,speed:radius*Math.PI*2/periodSeconds};
}

/** Grounded authoritative contact pose; the drifting body differs from travel direction. */
export function gtrDonutCar(now:number,world:MovementWorld){
 const pose=gtrDonutPose(now);
 return {...pose,y:world.height(pose.x,pose.z)??GTR_DONUTS.center[1]};
}
