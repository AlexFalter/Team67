import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";

test("parked vehicles block players; bikes and NPC cars knock down with different strength", () => {
  const state = new RaceState(), manager = new VehicleManager(state);
  const p = new Player({ x: -4.9, z: 0 }); state.players.set("target", p);
  const hits: unknown[][] = [];
  manager.contacts(Date.now(), (...args) => hits.push(args));
  assert.equal(hits.length, 0);
  assert.ok(Math.abs(p.x + 5) >= C.CART_RADIUS + C.CAPSULE_RADIUS);
  const bike = state.vehicles.get("bike-1")!, npc = state.vehicles.get("npc-car")!;
  bike.x = 0; bike.z = 0; bike.vx = 8;
  p.x = 1; p.z = 0;
  manager.contacts(Date.now() + 1000, (...args) => hits.push(args));
  assert.equal(hits.length, 1); assert.equal(hits[0][8], true);
  const weak = hits[0][5] as number;
  npc.x = 0; npc.z = 0; npc.vx = 8;
  bike.x = 20; p.x = 1;
  manager.contacts(Date.now() + 2000, (...args) => hits.push(args));
  assert.equal(hits.length, 2); assert.equal(hits[1][8], true);
  assert.ok((hits[1][5] as number) > weak);
});
test("driver prediction uses identical shared steps and obeys house bounds", () => {
  const p = C.createBody(); p.vehicleId = "bike-1"; p.vehicleKind = 2; p.seat = 0; p.y = C.BIKE_SEAT_HEIGHT;
  for (let i = 0; i < 20; i++) C.stepPlayer(p, { ...C.IDLE_INPUT, x: 1 }, 1 / 30);
  assert.ok(p.x > 1); assert.ok(p.vx <= C.BIKE_SPEED); assert.equal(p.y, C.BIKE_SEAT_HEIGHT);
});
