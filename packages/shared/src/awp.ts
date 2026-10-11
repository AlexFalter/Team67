import layout from './npc-layout.json' with {type:'json'};
import type {PlayerState} from './types.ts';
import type {MovementWorld} from './world.ts';
export const AWP_RANGE=150, AWP_COOLDOWN_MS=1400, AWP_MAGAZINE=10, AWP_RESERVE=10, AWP_RELOAD_MS=1800, AWP_INSPECT_MS=2600;
export const AWP_KNOCKBACK=28, AWP_LIFT=5;
export const AWP_RACK=layout.awpRack;
export function awpRackPlacement(world:MovementWorld){return world.name==='zurich'?AWP_RACK:{position:[world.spawn.x+10,world.spawn.y+1.55,world.spawn.z],approach:[world.spawn.x+10,world.spawn.y,world.spawn.z],heading:0};}
export interface AwpShot {roundStartedAt:number;from:string;start:number[];end:number[];target:string;hit:boolean;attachment?:{part:'head'|'body';offset:number[];direction:number[]}}
// Exact intersection with the standing capsule: cylinder plus rounded caps.
export function awpCapsuleDistance(origin:number[],direction:number[],p:Pick<PlayerState,'x'|'y'|'z'>){
 const [ox,oy,oz]=origin,[dx,dy,dz]=direction,r=.35,lo=p.y+r,hi=p.y+1.65-r,x=ox-p.x,z=oz-p.z;
 let nearest=Infinity;
 const a=dx*dx+dz*dz,b=2*(x*dx+z*dz),c=x*x+z*z-r*r,disc=b*b-4*a*c;
 if(a>1e-10&&disc>=0)for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)])if(t>=0&&oy+dy*t>=lo&&oy+dy*t<=hi)nearest=Math.min(nearest,t);
 for(const cy of [lo,hi]){const y=oy-cy,b=2*(x*dx+y*dy+z*dz),c=x*x+y*y+z*z-r*r,d=b*b-4*c;if(d>=0)for(const t of [(-b-Math.sqrt(d))/2,(-b+Math.sqrt(d))/2])if(t>=0)nearest=Math.min(nearest,t);}
 return nearest;
}
export function awpWallDistance(world:MovementWorld,origin:number[],aim:number[]){
 for(let t=0;t<=AWP_RANGE;t+=.1){const x=origin[0]+aim[0]*t,y=origin[1]+aim[1]*t,z=origin[2]+aim[2]*t,floor=world.height(x,z);if(floor!==undefined&&y<=floor||world.blocked(x,y,z,.015,.03))return t;}
 return AWP_RANGE;
}
