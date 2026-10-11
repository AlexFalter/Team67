import layout from './npc-layout.json' with {type:'json'};
export const FRUIT_STAND=layout.fruitStand;
export const TOMATO_STAND_SUPPLY=12;
export const TOMATO_CAPACITY=5,TOMATO_SPEED=17,TOMATO_COOLDOWN_MS=700;
export function fruitStandBlocked(x:number,y:number,z:number,radius:number,height:number){
 const [sx,sy,sz]=FRUIT_STAND.position;
 return y<sy+1.25&&y+height>sy&&Math.abs(x-sx)<1.4+radius&&Math.abs(z-sz)<.55+radius;
}
export interface TomatoProjectile {id:number;from:string;x:number;y:number;z:number;vx:number;vy:number;vz:number;born:number}
export interface TomatoEvent {roundStartedAt:number;kind:'stock'|'launch'|'remove'|'splat'|'wipe';count?:number;id?:number;projectile?:TomatoProjectile}
