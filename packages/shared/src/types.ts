export interface PlayerState {
  x: number;
  y: number;
  z: number;
  rotY: number;
  vx: number;
  vy: number;
  vz: number;
  anim: number;
  color: string;
  vehicleId: string;
  seat: number;
}
export interface WorldState {
  serverTime: number;
  players: Map<string, PlayerState>;
  vehicles: Map<string, VehicleState>;
}
export interface VehicleState {
  kind: number; // 0: car, 1: legacy shuttle, 2: bike
  x: number;
  y: number;
  z: number;
  rotY: number;
  vx: number;
  vz: number;
  fallenUntil: number;
  capacity: number;
  driver: string;
  departureAt: number;
  traveling: boolean;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  tripStartedAt: number;
  arrivalAt: number;
}
export type VehicleMove = [string, number, number, number, number, number, boolean?];
export interface VehicleResult {
  ok: boolean;
  message: string;
}
export type Move = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface Impulse {
  from: string;
  ix: number;
  iy: number;
  iz: number;
  knockdown: boolean;
}
export interface Bump {
  a: string;
  b: string;
  x: number;
  y: number;
  z: number;
  t: number;
}
export interface Ping {
  clientTime: number;
}
export interface Pong extends Ping {
  serverTime: number;
}
export interface Input {
  x: number;
  z: number;
  sprint: boolean;
  jump: boolean;
}
export interface Body extends PlayerState {
  grounded: boolean;
  knockdownUntil: number;
}
