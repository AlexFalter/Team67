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
  character: number; // 0: CS student boy, 1: CS student girl, 2: Einstein, 3: Rector Dissertori
  vehicleId: string;
  seat: number;
  cabinStanding?: boolean;
  cabinX?: number;
  cabinZ?: number;
  cabinYaw?: number;
  grounded: boolean;
  groundTime: number;
  jumpUntil: number;
  knockdownUntil: number;
  impactStartedAt?: number;
  impactX?: number;
  impactZ?: number;
  impactStrength?: number;
  moodleSitUntil?: number;
  simTime: number;
  vehicleKind: number;
  attackReadyAt: number;
  mateCount: number;
  mateBoostMs: number;
}
export interface WorldState {
  npcs?: Map<string, import("./npc.ts").NpcState>;
  serverTime: number;
  phase: string;
  hostId: string;
  moodleEnabled?:boolean;
  moodleEventId?:number;
  moodleQuestionIndex?:number;
  moodleDeadline?:number;
  startedAt: number;
  endsAt: number;
  finishedAt: number;
  introStartedAt: number;
  introComplete: boolean;
  scooterArrivalAt?: number;
  devMode: boolean;
  skipIntro: boolean;
  goldPubliBikes: boolean;
  railCrashProtection: boolean;
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
  examScore: number;
  examCorrect: number;
  examCompleted: boolean;
  examStartedAt: number;
}
export interface VehicleState {
  kind: number; // 0 cart, 1 shuttle, 2 bike, 3 NPC car, 4 ball, 5 tram, 6 Polybahn, 7 Lime scooter
  derailStartedAt: number;
  derailAge: number;
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
  at?: number;
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
  slide?: boolean;
  hit?: boolean;
  aim?: boolean;
  facing?: number;
}
export interface Body extends PlayerState {
  jumpReadyAt?: number;
  jumpFatigue?: number;
  jumpSprintLocked?: boolean;
  sprintJump?: boolean;
  slideUntil?: number;
  slideReadyAt?: number;
  slideBufferedUntil?: number;
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
