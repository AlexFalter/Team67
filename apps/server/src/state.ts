import { schema, t, type SchemaType } from "@colyseus/schema";
import { LOBBY } from "@race/shared";

// Flat and small: numbers for everything that changes per frame, strings only for rare changes.

export const Player = schema({
  name: t.string().default(""),
  character: t.uint8().default(0),
  hue: t.uint16().default(0),
  ready: t.boolean().default(false),
  waiting: t.boolean().default(false), // joined mid-round: no entity until the next round
  x: t.float32().default(0), y: t.float32().default(0), z: t.float32().default(0), yaw: t.float32().default(0),
  vx: t.float32().default(0), vy: t.float32().default(0), vz: t.float32().default(0),
  t: t.float64().default(0), // server-clock time of the pose sample (stamped by the owning client)
  anim: t.uint8().default(0),
  shoes: t.boolean().default(false),
  punches: t.uint8().default(0), // increments per punch: remote clients play the animation on change
  downUntil: t.float64().default(0),
  vehicle: t.string().default(""),
  seat: t.int8().default(-1),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Vehicle = schema({
  kind: t.uint8().default(0),
  x: t.float32().default(0), y: t.float32().default(0), z: t.float32().default(0), yaw: t.float32().default(0),
  vx: t.float32().default(0), vz: t.float32().default(0),
  t: t.float64().default(0),
  driver: t.string().default(""),
  dir: t.uint8().default(0), // shuttle: 0 HB → ETH, 1 back
  departAt: t.float64().default(0), // shuttle countdown end, 0 = no countdown
  tripStart: t.float64().default(0), // shuttle travelling since, 0 = waiting at a stop
  fallenUntil: t.float64().default(0), // bike lying on the ground
}, "Vehicle");
export type Vehicle = SchemaType<typeof Vehicle>;

export const Result = schema({ name: t.string().default(""), hits: t.uint16().default(0), taken: t.uint16().default(0) }, "Result");
export type Result = SchemaType<typeof Result>;

export const GameState = schema({
  phase: t.string().default(LOBBY),
  host: t.string().default(""),
  endsAt: t.float64().default(0),
  trafficStart: t.float64().default(0),
  players: t.map(Player),
  vehicles: t.map(Vehicle),
  results: t.array(Result),
}, "GameState");
export type GameState = SchemaType<typeof GameState>;
