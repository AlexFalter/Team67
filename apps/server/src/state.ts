import { schema, t, type SchemaType } from "@colyseus/schema";
import { RoomPhase } from "@race/shared";
export const RoomMember = schema({
  introSeat: t.int8().default(-1),
  name: t.string().default(""),
  character: t.uint8().default(0),
  ready: t.boolean().default(false),
  spectator: t.boolean().default(false),
}, "RoomMember");
export const RoundResult = schema({
  name: t.string().default(""),
  hitsLanded: t.number().default(0),
  hitsReceived: t.number().default(0),
}, "RoundResult");
export const Player = schema(
  {
    x: t.number().default(0),
    y: t.number().default(0),
    z: t.number().default(0),
    rotY: t.number().default(0),
    vx: t.number().default(0),
    vy: t.number().default(0),
    vz: t.number().default(0),
    anim: t.uint8().default(0),
    color: t.string().default("#ffffff"),
    character: t.uint8().default(0),
    vehicleId: t.string().default(""),
    seat: t.int8().default(-1),
    grounded: t.boolean().default(true),
    groundTime: t.number().default(0),
    jumpUntil: t.number().default(0),
    knockdownUntil: t.number().default(0),
    simTime: t.number().default(0),
    vehicleKind: t.int8().default(-1),
    attackReadyAt: t.number().default(0),
    mateCount: t.uint8().default(0),
    mateBoostMs: t.number().default(0),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;
export const Vehicle = schema(
  {
    kind: t.uint8().default(0),
    railDistance: t.number().default(0),
    railLane: t.number().default(0),
    railReverse: t.boolean().default(false),
    pitch: t.number().default(0),
    x: t.number().default(0),
    y: t.number().default(0),
    z: t.number().default(0),
    rotY: t.number().default(0),
    vx: t.number().default(0),
    vz: t.number().default(0),
    capacity: t.uint8().default(1),
    driver: t.string().default(""),
    departureAt: t.number().default(0),
    traveling: t.boolean().default(false),
    fromX: t.number().default(0),
    fromZ: t.number().default(0),
    toX: t.number().default(0),
    toZ: t.number().default(0),
    tripStartedAt: t.number().default(0),
    arrivalAt: t.number().default(0),
    fallenUntil: t.number().default(0),
  },
  "Vehicle",
);
export type Vehicle = SchemaType<typeof Vehicle>;
export const PubliBike = schema({
  broken: t.boolean().default(false),
  batteryMs: t.number().default(15000),
  reservedBy: t.string().default(""),
  reservationUntil: t.number().default(0),
  dock: t.int8().default(-1),
}, "PubliBike");
export const Mate = schema({
  phase: t.string().default("idle"),
  selected: t.uint8().default(0),
  tried: t.uint8().default(0),
  attempts: t.uint8().default(0),
  readyAt: t.number().default(0),
  retryAt: t.number().default(0),
  dropStartedAt: t.number().default(0),
}, "Mate");
export const RaceState = schema(
  {
    serverTime: t.number().default(0),
    phase: t.string().default(RoomPhase.Lobby),
    hostId: t.string().default(""),
    startedAt: t.number().default(0),
    endsAt: t.number().default(0),
    finishedAt: t.number().default(0),
    introStartedAt: t.number().default(0),
    introComplete: t.boolean().default(false),
    members: t.map(RoomMember),
    results: t.map(RoundResult),
    players: t.map(Player),
    vehicles: t.map(Vehicle),
    publiBikes: t.map(PubliBike),
    mates: t.map(Mate),
  },
  "RaceState",
);
export type RaceState = SchemaType<typeof RaceState>;
