import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";

function fixture(count: number, x: number, z: number) {
  const state = new RaceState(),
    manager = new VehicleManager(state);
  const clients = Array.from({ length: count }, (_, i) => {
    const messages: C.VehicleResult[] = [];
    const client = {
      sessionId: `p${i}`,
      send: (_type: string, data: C.VehicleResult) =>
        messages.push({ ...data }),
    } as unknown as Client;
    state.players.set(client.sessionId, new Player({ x, z }));
    return { client, messages };
  });
  return { state, manager, clients };
}

test("cart claims are exclusive; only its driver reports movement; leaving and disconnecting release it", () => {
  const {
      state,
      manager,
      clients: [a, b],
    } = fixture(2, -5, 0),
    now = 100000;
  manager.enter(a.client, "car-1", now);
  manager.enter(b.client, "car-1", now);
  const cart = state.vehicles.get("car-1")!;
  assert.equal(cart.driver, a.client.sessionId);
  assert.equal(b.messages.at(-1)!.ok, false);
  assert.equal(state.players.get(b.client.sessionId)!.vehicleId, "");
  manager.move(b.client, ["car-1", -4.5, 0, 0, 10, 0], now + 50);
  assert.equal(cart.x, -5);
  manager.move(a.client, ["car-1", -4.5, 0, 0, 10, 0], now + 50);
  assert.equal(cart.x, -4.5);
  assert.equal(state.players.get(a.client.sessionId)!.x, -4.5);
  assert.equal(state.players.get(a.client.sessionId)!.y, C.CART_SEAT_HEIGHT);
  manager.move(a.client, ["car-1", 20, 0, 0, 10, 0], now + 51);
  assert.equal(cart.x, -4.5);
  manager.exit(a.client);
  assert.equal(cart.driver, "");
  assert.equal(cart.vx, 0);
  assert.equal(state.players.get(a.client.sessionId)!.vehicleId, "");
  manager.enter(b.client, "car-1", now + 100);
  assert.equal(cart.driver, b.client.sessionId);
  manager.disconnect(b.client.sessionId);
  assert.equal(cart.driver, "");
  assert.equal(cart.vx, 0);
});

test("run-over math and server cooldown hit foot players without hitting passengers or airborne players", () => {
  const {
      state,
      manager,
      clients: [driver, target],
    } = fixture(2, -5, 0),
    now = 100000;
  manager.enter(driver.client, "car-1", now);
  const victim = state.players.get(target.client.sessionId)!;
  victim.x = -3.7;
  manager.move(driver.client, ["car-1", -5, 0, Math.PI / 2, 12, 0], now + 50);
  const hits: unknown[][] = [];
  manager.tick(now + 51, (...args) => hits.push(args));
  assert.equal(hits.length, 1);
  assert.equal(hits[0][0], driver.client.sessionId);
  assert.equal(hits[0][1], target.client.sessionId);
  assert.ok((hits[0][5] as number) > 0);
  assert.equal(hits[0][8], true);
  manager.tick(now + 100, (...args) => hits.push(args));
  assert.equal(hits.length, 1);
  victim.y = 2;
  manager.tick(now + 400, (...args) => hits.push(args));
  assert.equal(hits.length, 1);
  victim.y = 0;
  manager.tick(now + 1000, (...args) => hits.push(args));
  assert.equal(hits.length, 1, "stale cart reports cannot run players over");
});

test("cart movement accelerates and stops at plane edges; vehicle seats rotate with their vehicle", () => {
  const cart = C.createVehicle();
  for (let i = 0; i < 300; i++)
    C.stepCart(cart, { x: 1, z: 0, sprint: false, jump: false }, 1 / 60);
  assert.equal(cart.x, C.PLANE_SIZE / 2 - C.CART_RADIUS);
  assert.equal(cart.vx, 0);
  const shuttle = C.createVehicle(1, 4, 5),
    seat = { x: 0, y: 0, z: 0 };
  shuttle.rotY = Math.PI / 2;
  C.seatPosition(shuttle, 0, seat);
  assert.ok(Math.abs(seat.x - 2.75) < 1e-9);
  assert.ok(Math.abs(seat.z - 5.65) < 1e-9);
  assert.equal(seat.y, C.SHUTTLE_SEAT_HEIGHT);
});


test("only car and bike spawn; bike collision ejects rider, falls, and recovers", () => {
  const { state, manager, clients: [rider, target] } = fixture(2, 5, 0);
  assert.deepEqual([...state.vehicles.keys()], ["car-1", "bike-1"]);
  const bike = state.vehicles.get("bike-1")!;
  Object.assign(state.players.get(rider.client.sessionId)!, { x: bike.x, y: bike.y, z: bike.z });
  manager.enter(rider.client, "bike-1", 100000);
  manager.enter(target.client, "bike-1", 100000);
  assert.equal(target.messages.at(-1)!.ok, false);
  Object.assign(state.players.get(target.client.sessionId)!, { x: bike.x + 1, y: bike.y, z: bike.z });
  manager.move(rider.client, ["bike-1", bike.x, bike.z, Math.PI / 2, 8, 0], 100050);
  const hits: unknown[][] = [];
  manager.tick(100051, (...args) => hits.push(args));
  assert.equal(bike.driver, "");
  assert.equal(state.players.get(rider.client.sessionId)!.vehicleId, "");
  assert.equal(bike.fallenUntil, 102551);
  assert.ok(hits.some(h => h[1] === rider.client.sessionId && h[8] === true));
  manager.enter(rider.client, "bike-1", 100100);
  assert.equal(rider.messages.at(-1)!.ok, false);
  manager.tick(102551, () => {});
  assert.equal(bike.fallenUntil, 0);
});

test("bike falls against car and validated world boundary", () => {
  for (const obstacle of ["car", "boundary"]) {
    const { state, manager, clients: [rider] } = fixture(1, 5, 0);
    const bike = state.vehicles.get("bike-1")!, car = state.vehicles.get("car-1")!;
    if (obstacle === "car") Object.assign(bike, { x: car.x + 1.5, z: car.z });
    else Object.assign(bike, { x: C.PLANE_SIZE / 2 - C.CART_RADIUS, z: 0 });
    Object.assign(state.players.get(rider.client.sessionId)!, { x: bike.x, y: bike.y, z: bike.z });
    manager.enter(rider.client, "bike-1", 100000);
    manager.move(rider.client, ["bike-1", bike.x, bike.z, Math.PI / 2, 8, 0, obstacle === "boundary"], 100050);
    manager.tick(100051, () => {});
    assert.ok(bike.fallenUntil > 100051, obstacle);
    assert.equal(bike.driver, "");
  }
});


test("bike building impacts are checked against the world; false crash reports are ignored", () => {
  const state = new RaceState();
  const world: C.MovementWorld = { ...C.flatWorld, blocked: (x) => x > 5.1 };
  const manager = new VehicleManager(state, world);
  const bike = state.vehicles.get("bike-1")!;
  const client = { sessionId: "rider", send: () => {} } as unknown as Client;
  state.players.set(client.sessionId, new Player({ x: bike.x, z: bike.z }));
  manager.enter(client, "bike-1", 100000);
  manager.move(client, ["bike-1", bike.x, bike.z, -Math.PI / 2, 0, 0, true], 100050);
  manager.tick(100051, () => {});
  assert.equal(bike.fallenUntil, 0);
  manager.move(client, ["bike-1", bike.x, bike.z, Math.PI / 2, 0, 0, true], 100100);
  manager.tick(100101, () => {});
  assert.ok(bike.fallenUntil > 100101);
  assert.equal(bike.driver, "");
});
