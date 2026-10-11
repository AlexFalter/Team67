import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";

const world = C.zurichWorld;
const idle = { x: 0, z: 0, sprint: false, jump: false };

test("Zürich spawn, carts, and docks are on terrain outside buildings, in the original coordinate system", () => {
  assert.ok(world.spawn.x < -100, "HB must not be clamped to the old plane");
  assert.ok(world.spawn.y > 0);
  for (const p of [world.spawn, ...world.carts, ...world.stops]) {
    assert.ok(Math.abs(world.height(p.x, p.z)! - p.y) < 0.02);
    assert.equal(world.blocked(p.x, p.y, p.z, 0.5, 1.8), false);
  }
  assert.equal(world.height(1000, 1000), undefined);
  // The approximate HB landmark lies inside the station building.
  const y = world.height(-287, -66)!;
  assert.equal(world.blocked(-287, y, -66, 0.5, 1.8), true);
});

test("shared movement walks on terrain, jumps, blocks buildings, and respawns at the bus drop-off", () => {
  const p = C.createBody();
  Object.assign(p, world.spawn);
  const initialX = p.x;
  for (let i = 0; i < 30; i++)
    C.stepMovement(p, { ...idle, x: 1 }, 1 / 60, (i * 1000) / 60, world);
  assert.ok(p.x > initialX + 2);
  assert.ok(Math.abs(p.y - world.height(p.x, p.z)!) < 0.001);
  C.stepMovement(p, { ...idle, jump: true }, 1 / 60, 1000, world);
  assert.equal(p.grounded, false);
  assert.ok(p.vy > 0);
  for (let i = 0; i < 90; i++)
    C.stepMovement(p, idle, 1 / 60, 1000 + (i * 1000) / 60, world);
  assert.equal(p.grounded, true);
  // Walk toward the station; stop at its footprint instead of entering it.
  Object.assign(p, world.spawn);
  p.vx = p.vz = 0;
  for (let i = 0; i < 600; i++)
    C.stepMovement(p, { ...idle, z: 1 }, 1 / 60, 3000 + (i * 1000) / 60, world);
  assert.equal(world.blocked(p.x, p.y, p.z, 0.5, 1.8), false);
  assert.ok(p.z < world.spawn.z + 50);
  p.x = world.bounds.maxX + 3;
  p.y = world.spawn.y - 11;
  p.grounded = false;
  C.stepMovement(p, idle, 1 / 60, 20000, world);
  assert.ok(
    Math.hypot(p.x - C.raceSpawnPoint(world).x, p.z - C.raceSpawnPoint(world).z) < C.SPAWN_SPREAD,
  );
  assert.ok(Math.abs(p.y - world.height(p.x, p.z)!) < 0.001);
});

test("the whole HB–ETH shuttle route follows terrain and avoids sampled buildings in either direction", () => {
  const point = { x: 0, y: 0, z: 0, rotY: 0 };
  for (let d = 0; d <= world.routeLength; d += 0.5) {
    C.routePoint(world, d, point);
    assert.ok(Math.abs(point.y - world.height(point.x, point.z)!) < 0.001);
    assert.equal(
      world.blocked(point.x, point.y, point.z, 1.5, 2),
      false,
      `route blocked at ${d}`,
    );
  }
  C.routePoint(world, world.routeLength, point);
  assert.equal(point.x, world.stops[1].x);
  assert.equal(point.z, world.stops[1].z);
  C.routePoint(world, world.routeLength, point, true);
  assert.equal(point.x, world.stops[0].x);
  assert.equal(point.z, world.stops[0].z);
});

test("predicted map vehicles preserve elevation and the shuttle completes a round trip with safe exits", () => {
  const state = new RaceState(),
    manager = new VehicleManager(state, world);
  const messages: C.VehicleResult[] = [];
  const client = {
    sessionId: "map-player",
    send: (_: string, data: C.VehicleResult) => messages.push(data),
  } as unknown as Client;
  const p = new Player({ ...world.carts[0] });
  state.players.set(client.sessionId, p);
  manager.enter(client, "cart-1", 100000);
  const cart = state.vehicles.get("cart-1")!;
  const start = cart.x;
  C.stepPlayer(p, { ...idle, x: 1 }, 1 / 60, world);
  manager.syncDriver(client.sessionId);
  assert.ok(cart.x > start);
  assert.ok(Math.abs(cart.y - world.height(cart.x, cart.z)!) < 1e-9);
  assert.equal(p.y, cart.y + C.CART_SEAT_HEIGHT);
  manager.exit(client);
  assert.equal(p.y, world.height(p.x, p.z));
  const shuttle = state.vehicles.get("shuttle-1")!;
  for (let trip = 0; trip < 2; trip++) {
    Object.assign(p, { x: shuttle.x, y: shuttle.y, z: shuttle.z });
    manager.enter(client, "shuttle-1", 200000 + trip * 500000);
    assert.equal(messages.at(-1)!.ok, true);
    manager.tick(shuttle.departureAt + 100, () => {});
    assert.equal(shuttle.traveling, true);
    manager.tick(shuttle.arrivalAt, () => {});
    const stop = world.stops[trip === 0 ? 1 : 0];
    assert.equal(shuttle.x, stop.x);
    assert.equal(shuttle.z, stop.z);
    assert.equal(p.vehicleId, "");
    assert.equal(p.y, world.height(p.x, p.z));
    assert.equal(world.blocked(p.x, p.y, p.z, 0.5, 1.8), false);
  }
});
