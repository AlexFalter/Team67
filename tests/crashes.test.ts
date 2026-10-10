import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";
import { ContactWorld } from "../apps/server/src/physics.ts";

function fixture() {
  const state = new RaceState(), manager = new VehicleManager(state), messages: C.VehicleResult[] = [];
  const client = { sessionId: "rider", send: (_: string, m: C.VehicleResult) => messages.push(m) } as unknown as Client;
  const rider = new Player({ x: 3, z: 4 }); state.players.set("rider", rider);
  manager.enter(client, "bike-1", 1000);
  const hits: string[] = [];
  const hit: Parameters<VehicleManager["tick"]>[1] = (from, target, _x, _y, _z, ix, iy, iz, knockdown) => {
    hits.push(target); C.applyImpulse(state.players.get(target)!, { from, ix, iy, iz, knockdown, durationMs: 2500 }, rider.simTime);
  };
  return { state, manager, rider, client, messages, hits, hit, bike: state.vehicles.get("bike-1")! };
}
test("bike hitting a person falls, ejects and knocks down both; recovery gates boarding", () => {
  const { state, manager, rider, client, messages, hits, hit, bike } = fixture();
  bike.vx = rider.vx = 8; bike.rotY = Math.PI / 2;
  const target = new Player({ x: 4, z: 4 }); state.players.set("target", target);
  manager.contacts(1000, hit);
  assert.deepEqual(hits, ["target", "rider"]);
  assert.equal(bike.driver, ""); assert.equal(rider.vehicleId, "");
  assert.equal(bike.fallenUntil, 3500); assert.equal(bike.vx, 0);
  assert.ok(rider.knockdownUntil > rider.simTime); assert.ok(target.knockdownUntil > target.simTime);
  manager.enter(client, "bike-1", 1100); assert.equal(messages.at(-1)!.ok, false);
  manager.tick(3600, hit); rider.simTime = 3000; rider.y = 0;
  manager.enter(client, "bike-1", 3600); assert.equal(messages.at(-1)!.ok, true);
});
test("bike crashes into a parked car, a house and the field boundary, not by braking", () => {
  for (const wall of [false, true]) {
    const { manager, rider, hit, bike } = fixture();
    const h = C.HOUSES[0];
    rider.x = wall ? h.x - h.width / 2 - C.vehicleRadius(bike) - 0.02 : C.PLANE_SIZE / 2 - C.vehicleRadius(bike) - 0.02;
    rider.z = wall ? h.z : 0; rider.vx = 8; rider.rotY = Math.PI / 2;
    const impact = C.stepPlayer(rider, { ...C.IDLE_INPUT, x: 1 }, 1 / 60)!;
    manager.syncDriver("rider"); assert.ok(impact >= 3);
    manager.crashBike("bike-1", 1000, hit, impact);
    assert.ok(bike.fallenUntil); assert.equal(rider.vehicleId, "");
  }
  const { manager, rider, bike, hit } = fixture();
  bike.x = 3.5; bike.z = 0; bike.vx = 8; bike.rotY = Math.PI / 2;
  manager.bikeContacts(1000, hit);
  assert.ok(bike.fallenUntil); assert.equal(rider.vehicleId, "");
  const body = C.createBody(); body.vehicleId = "bike"; body.vehicleKind = 2; body.vx = 8;
  assert.equal(C.stepPlayer(body, C.IDLE_INPUT, 1 / 60), 0, "normal braking is not a crash");
});
test("heavy shuttle keeps its prescribed motion through walls, vehicles and players", async () => {
  const { state, manager, hit } = fixture(), world = await ContactWorld.create();
  try {
    const shuttle = state.vehicles.get("shuttle-1")!, h = C.HOUSES[0];
    shuttle.fromX = h.x - 6; shuttle.fromZ = shuttle.toZ = h.z;
    shuttle.toX = h.x + 6; shuttle.tripStartedAt = 0; shuttle.arrivalAt = 1500; shuttle.traveling = true;
    const target = new Player({ x: h.x + 1, z: h.z }); state.players.set("target", target);
    manager.tick(750, hit);
    const x = shuttle.x, vx = shuttle.vx;
    world.sync(state.players, state.vehicles); manager.contacts(750, hit, (a, b) => world.intersects(a, b));
    assert.equal(shuttle.x, x); assert.equal(shuttle.vx, vx); assert.equal(shuttle.fallenUntil, 0);
    assert.ok(target.knockdownUntil > 0, "foot player is knocked down");
    manager.tick(1000, hit); assert.ok(shuttle.x > x, "transport continues after the impact");
  } finally { world.dispose(); }
});

test("tram ejects a car driver without stopping or crashing itself", () => {
  const { state, manager, rider, client, hit } = fixture();
  manager.exit(client); rider.x = -5; rider.z = 0; rider.y = 0;
  manager.enter(client, "cart-1", 1000);
  const tram = state.vehicles.get("shuttle-1")!;
  tram.x = -7; tram.z = 0; tram.vx = 8; tram.rotY = Math.PI / 2;
  manager.contacts(1000, hit);
  assert.equal(rider.vehicleId, ""); assert.ok(rider.knockdownUntil > 0);
  assert.equal(tram.x, -7); assert.equal(tram.vx, 8); assert.equal(tram.fallenUntil, 0);
});
