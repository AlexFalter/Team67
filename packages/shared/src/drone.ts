export const DRONE_STREAK_HITS=5,DRONE_CALL_MS=2400,DRONE_SCAN_MS=30000,DRONE_SWEEP_MS=2000;
export interface DroneBlip {id:string;x:number;y:number;z:number}
export interface DroneScan {roundStartedAt:number;startedAt:number;endsAt:number;at:number;players:DroneBlip[]}
