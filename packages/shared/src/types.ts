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
  character: number; // 0: CS student, 1: Student Athlete, 2: Einstein
  vehicleId: string;
  seat: number;
  grounded: boolean;
  groundTime: number;
  jumpUntil: number;
  knockdownUntil: number;
  simTime: number;
  vehicleKind: number;
  shoes: boolean;
  attackReadyAt: number;
  mateCount: number;
  mateBoostMs: number;
}
export interface WorldState {
  npcs?: Map<string, import("./npc.ts").NpcState>;
  serverTime: number;
  phase: string;
  hostId: string;
  startedAt: number;
  endsAt: number;
  finishedAt: number;
  introStartedAt: number;
  introComplete: boolean;
  members: Map<string, RoomMember>;
  results: Map<string, RoundResult>;
  players: Map<string, PlayerState>;
  vehicles: Map<string, VehicleState>;
  publiBikes: Map<string, import("./publiBike.ts").PubliBikeState>;
  mates: Map<string, import("./mate.ts").MateState>;
}
export interface RoomMember {
  introSeat: number;
  name: string;
  character: number;
  ready: boolean;
  spectator: boolean;
}
export interface RoundResult {
  name: string;
  hitsLanded: number;
  hitsReceived: number;
}
export interface VehicleState {
  kind: number; // 0 cart, 1 shuttle, 2 bike, 3 NPC car, 4 ball, 5 tram, 6 Polybahn
  railDistance: number;
  railLane: number;
  railReverse: boolean;
  pitch: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  vx: number;
  vz: number;
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
  fallenUntil: number;
}
export interface VehicleResult {
  ok: boolean;
  message: string;
}
export interface Impulse {
  from: string;
  ix: number;
  iy: number;
  iz: number;
  knockdown: boolean;
  durationMs?: number;
}
export interface Bump {
  a: string;
  b: string;
  x: number;
  y: number;
  z: number;
  t: number;
}
export interface Input {
  x: number;
  z: number;
  sprint: boolean;
  jump: boolean;
  toggleShoes?: boolean;
  hit?: boolean;
  aim?: boolean;
  facing?: number;
}
export interface Body extends PlayerState {
}

// Main's compact client-owned movement reports, with feature gameplay metadata
// kept in the existing player schema and server-refereed action messages.
export type Move = [number, number, number, number, number, number, number, number];
export type VehicleMove = [string, number, number, number, number, number];
export interface Ping { clientTime: number }
export interface Pong extends Ping { serverTime: number }
export interface PlayerCorrection {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean;
  vehicleId: string; vehicleKind: number; seat: number;
}
