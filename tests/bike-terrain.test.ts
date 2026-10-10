import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";
import { RaceState, Player } from "../apps/server/src/state.ts";
const forward = { ...C.IDLE_INPUT, x: 1 };
function world(height: C.MovementWorld["height"], blocked: C.MovementWorld["blocked"] = () => false): C.MovementWorld {
  return { ...C.flatWorld, name: "zurich", bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, height, blocked };
}
test("bikes follow gentle uphill terrain at speed without reporting an impact", () => {
  const v = C.createVehicle(2); v.vx = C.BIKE_SPEED;
  const slope = world(x => x * 0.15);
  for (let i = 0; i < 120; i++) assert.equal(C.stepCart(v, forward, 1 / 60, slope), 0);
  assert.ok(v.x > 29); assert.ok(v.y > 4); assert.equal(v.vx, C.BIKE_SPEED);
});
test("rough height samples and missing ground stop safely without causing a bike crash", () => {
  for (const height of [(x: number) => x > .1 ? 1 : 0, (x: number) => x > .1 ? undefined : 0]) {
    const v = C.createVehicle(2); v.vx = C.BIKE_SPEED;
    assert.equal(C.stepCart(v, forward, 1 / 60, world(height)), 0);
    assert.equal(v.x, 0); assert.equal(v.vx, 0); assert.equal(v.y, 0);
    // The server's larger verification probe must also reject a false crash.
    assert.equal(C.stepCart(v, forward, 1 / C.CLIENT_SEND_RATE, world(height)), 0);
  }
});
test("a real wall still reports enough impact to knock a bike rider down", () => {
  const v = C.createVehicle(2); v.vx = C.BIKE_SPEED;
  assert.ok(C.stepCart(v, forward, 1 / 60, world(() => 0, x => x > .1)) >= C.CART_MIN_HIT_SPEED);
  assert.equal(v.x, 0); assert.equal(v.vx, 0);
});
test("server bike reports stay on the ridden lower surface beneath a bridge", () => {
  const stacked = world((_x, _z, y) => y === undefined ? 8 : y < 4 ? 0 : 8);
  const state = new RaceState(), manager = new VehicleManager(state, stacked);
  const v = C.createVehicle(2, 0, 0); manager.add("test-bike", v);
  const p = new Player({ x: 0, y: 0, z: 0 }); state.players.set("rider", p);
  const client = { sessionId: "rider", send() {} } as unknown as Client;
  manager.enter(client, "test-bike", 1000);
  manager.move(client, ["test-bike", .1, 0, Math.PI / 2, 5, 0], 1100);
  assert.equal(state.vehicles.get("test-bike")!.y, 0);
  assert.equal(p.y, C.BIKE_SEAT_HEIGHT); assert.equal(p.vehicleId, "test-bike");
});
