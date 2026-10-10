// Message names and payload layouts. Movement uses flat number arrays to stay small on the wire.

/** client → server, 30 Hz: [t, x, y, z, yaw, vx, vy, vz, anim]. t = estimated server time of the sample.
 *  While driving, the pose is the vehicle's. */
export const MOVE = "m";
export type Move = [number, number, number, number, number, number, number, number, number];

/** client → server */
export const PUNCH = "p"; // yaw
export const ENTER = "e"; // vehicle id
export const EXIT = "x";
export const CRASH = "crash"; // bike hit something while I was riding it
export const SHOES = "shoes";
export const READY = "ready"; // boolean
export const END_ROUND = "end"; // host only
export const TO_LOBBY = "lobby"; // host only
export const PING = "ping"; // client time

/** server → client */
export const PONG = "pong"; // [clientTime, serverTime]
export const CORRECT = "c"; // [x, y, z, vx, vy, vz, onFoot?]: authoritative position, blended out on the client;
// onFoot = 1 when the server took the player off a vehicle
export const KNOCK = "k"; // [ix, iy, iz, downMs]
export const NOTICE = "n"; // short text for the HUD
export const HIT = "hit"; // [x, y, z] punch/run-over impact, for effects
