import layout from './npc-layout.json' with {type:'json'};
import type {MovementWorld} from './world.ts';
export const BAG_HILL=layout.bagHill;
export const BAG_SPEED=18, BAG_GRAVITY=9.81, BAG_THROW_RELEASE_MS=430;
export const BAG_HIT_RADIUS=.72, BAG_CARRY_SPEED_LIMIT=12;
export interface BagState {x:number;y:number;z:number;vx:number;vy:number;vz:number;owner:string;thrower:string;flying:boolean;throwAt:number;releasedAt:number;spin:number}
// Release from the current player position and preserve bounded horizontal momentum.
export function bagLaunch(p:{x:number;y:number;z:number;vx:number;vz:number},aim:{x:number;y:number;z:number}){
 const speed=Math.hypot(p.vx,p.vz),carry=speed?Math.min(1,BAG_CARRY_SPEED_LIMIT/speed):0;
 return {x:p.x+aim.x*.65,y:p.y+1.1,z:p.z+aim.z*.65,vx:aim.x*BAG_SPEED+p.vx*carry,vy:aim.y*BAG_SPEED+2.4,vz:aim.z*BAG_SPEED+p.vz*carry};
}
export function bagHillLift(x:number,z:number){const q=((x-BAG_HILL.center[0])**2+(z-BAG_HILL.center[1])**2)/BAG_HILL.radius**2;return q<1?BAG_HILL.height*(1-q)**2:0;}
export function bagHomes(world:MovementWorld){const center=world.name==='flat'?[world.spawn.x+6,world.spawn.z]:BAG_HILL.center;return BAG_HILL.bagOffsets.map(([dx,dz])=>{const x=center[0]+dx,z=center[1]+dz;return {x,y:(world.height(x,z)??world.spawn.y)+.015,z};});}
// Swept sphere vs player capsule: closest point between projectile and the upright body's segment.
export function bagHitsPlayer(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},p:{x:number;y:number;z:number},radius=BAG_HIT_RADIUS){
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
 // Distance to a vertical capsule is convex along the flight segment. Ternary search
 // finds the closest point, including fast projectiles crossing a capsule in one tick.
 const distance=(t:number)=>{const x=from.x+dx*t,z=from.z+dz*t,y=from.y+dy*t;const cy=Math.max(p.y+.3,Math.min(p.y+1.5,y));return (x-p.x)**2+(z-p.z)**2+(y-cy)**2;};
 let lo=0,hi=1;for(let i=0;i<16;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(distance(a)<distance(b))hi=b;else lo=a;}
 return Math.min(distance(0),distance(1),distance((lo+hi)/2))<=radius**2;
}
