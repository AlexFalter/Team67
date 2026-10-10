import type {Vector3} from 'three';
export interface MapBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface HostMapQueries {
 height(x:number,z:number):number;
 blocked(x:number,z:number):boolean;
 isWater?(x:number,z:number):boolean;
 bridgeAt?(x:number,z:number):unknown;
 bounds:MapBounds;
 placements?:{features:Record<string,unknown>};
 data?:Record<string,unknown>;
 penetration(position:Vector3):number;
 /** Mutates position and returns the correction vector, matching the host controller. */
 solve(position:Vector3):Vector3;
 radius?:number;
 bodyBlocked?(x:number,y:number,z:number,radius:number,height:number):boolean;
 vehicleWallBlocked?(position:Vector3,rotation:unknown,halfWidth:number,halfLength:number,height:number):boolean;
 navigationFactory?(world:unknown,solver:unknown,options:{step:number;clearance:number}):{path(from:number[],to:number[]):number[][];line(from:Vector3,to:Vector3):boolean;nearest(location:number[]):Vector3};
 addStationPassages?(segments:unknown[]):number;
}
export function createWorldAdapter(queries:HostMapQueries):{
 world:{height:HostMapQueries['height'];ground:HostMapQueries['height'];blocked:HostMapQueries['blocked'];isWater:NonNullable<HostMapQueries['isWater']>;bridgeAt:NonNullable<HostMapQueries['bridgeAt']>;placements:HostMapQueries['placements'];data:Record<string,unknown>;bodyBlocked?:HostMapQueries['bodyBlocked'];vehicleWallBlocked?:HostMapQueries['vehicleWallBlocked'];navigationFactory?:HostMapQueries['navigationFactory'];addStationPassages?:HostMapQueries['addStationPassages']};
 solver:{penetration:HostMapQueries['penetration'];solve:HostMapQueries['solve'];radius:number};
};
