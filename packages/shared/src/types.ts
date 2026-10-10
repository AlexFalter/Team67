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
  peelReadyAt: number;
}
export interface WorldState {
  serverTime: number;
  players: Map<string, PlayerState>;
  vehicles: Map<string, VehicleState>;
  peels: Map<string, PeelState>;
}
export interface PeelState {
  x: number; y: number; z: number;
  fromX: number; fromZ: number; toX: number; toZ: number;
  bornAt: number; landingAt: number; armedAt: number; expiresAt: number;
  owner: string;
}
export interface VehicleState {
  kind: number; // 0: cart, 1: shared shuttle, 2: bicycle, 3: NPC car
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
  banana?: boolean;
  throwBanana?: boolean;
  aim?: boolean;
  facing?: number;
}
export interface Body extends PlayerState {
}
