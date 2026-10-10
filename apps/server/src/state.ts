import { schema, t, type SchemaType } from "@colyseus/schema";
import { RoomPhase } from "@race/shared";
export const RoomMember = schema({
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
    shoes: t.boolean().default(false),
    attackReadyAt: t.number().default(0),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;
export const Vehicle = schema(
  {
    kind: t.uint8().default(0),
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
export const RaceState = schema(
  {
    serverTime: t.number().default(0),
    phase: t.string().default(RoomPhase.Lobby),
    hostId: t.string().default(""),
    startedAt: t.number().default(0),
    endsAt: t.number().default(0),
    finishedAt: t.number().default(0),
    members: t.map(RoomMember),
    results: t.map(RoundResult),
    players: t.map(Player),
    vehicles: t.map(Vehicle),
  },
  "RaceState",
);
export type RaceState = SchemaType<typeof RaceState>;
