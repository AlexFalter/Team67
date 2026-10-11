import type {Vector3} from 'three';
export interface NavigationWorld {
 data:{playableBounds:{minX:number;maxX:number;minZ:number;maxZ:number}};
 height:(x:number,z:number)=>number|undefined;
 blocked:(x:number,z:number)=>boolean;
 navigationFactory?:(world:NavigationWorld,solver:{penetration:(point:Vector3)=>number},options:{step:number;clearance:number})=>MapNavigation;
}
export interface MapNavigation {
 path:(from:readonly number[],to:readonly number[])=>number[][];
 nearest:(location:readonly number[])=>Vector3;
 line:(from:Vector3,to:Vector3)=>boolean;
}
export function createMapNavigation(world:NavigationWorld,solver:{penetration:(point:Vector3)=>number},options?:{step?:number;clearance?:number}):MapNavigation;
