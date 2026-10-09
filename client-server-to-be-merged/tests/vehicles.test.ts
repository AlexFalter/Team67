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
  manager.enter(a.client, "cart-1", now);
  manager.enter(b.client, "cart-1", now);
  const cart = state.vehicles.get("cart-1")!;
  assert.equal(cart.driver, a.client.sessionId);
  assert.equal(b.messages.at(-1)!.ok, false);
  assert.equal(state.players.get(b.client.sessionId)!.vehicleId, "");
  manager.move(b.client, ["cart-1", -4.5, 0, 0, 10, 0], now + 50);
  assert.equal(cart.x, -5);
  manager.move(a.client, ["cart-1", -4.5, 0, 0, 10, 0], now + 50);
  assert.equal(cart.x, -4.5);
  assert.equal(state.players.get(a.client.sessionId)!.x, -4.5);
  assert.equal(state.players.get(a.client.sessionId)!.y, C.CART_SEAT_HEIGHT);
  manager.move(a.client, ["cart-1", 20, 0, 0, 10, 0], now + 51);
  assert.equal(cart.x, -4.5);
  manager.exit(a.client);
  assert.equal(cart.driver, "");
  assert.equal(cart.vx, 0);
  assert.equal(state.players.get(a.client.sessionId)!.vehicleId, "");
  manager.enter(b.client, "cart-1", now + 100);
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
  manager.enter(driver.client, "cart-1", now);
  const victim = state.players.get(target.client.sessionId)!;
  victim.x = -3.7;
  manager.move(driver.client, ["cart-1", -5, 0, Math.PI / 2, 12, 0], now + 50);
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

test("shuttle countdown starts once, reserves six unique seats, travels, and disembarks at the opposite dock", () => {
  const [a, b] = C.SHUTTLE_STOPS;
  const { state, manager, clients } = fixture(C.SHUTTLE_CAPACITY + 1, a.x, a.z),
    now = 100000;
  manager.enter(clients[0].client, "shuttle-1", now);
  const shuttle = state.vehicles.get("shuttle-1")!,
    departure = now + C.SHUTTLE_COUNTDOWN_MS;
  assert.equal(shuttle.departureAt, departure);
  for (let i = 1; i < clients.length; i++)
    manager.enter(clients[i].client, "shuttle-1", now + 100 * i);
  assert.equal(
    shuttle.departureAt,
    departure,
    "later boarders do not restart countdown",
  );
  assert.equal(
    clients.at(-1)!.messages.at(-1)!.ok,
    false,
    "full shuttle rejects seventh rider",
  );
  assert.equal(
    new Set(
      [...state.players.values()].filter((p) => p.vehicleId).map((p) => p.seat),
    ).size,
    C.SHUTTLE_CAPACITY,
  );
  manager.tick(departure - 1, () => {});
  assert.equal(shuttle.traveling, false);
  manager.tick(departure + 100, () => {});
  assert.equal(shuttle.traveling, true);
  assert.ok(shuttle.x > a.x);
  manager.exit(clients[0].client);
  assert.equal(clients[0].messages.at(-1)!.ok, false, "no exit while moving");
  manager.enter(clients.at(-1)!.client, "shuttle-1", departure + 101);
  assert.equal(clients.at(-1)!.messages.at(-1)!.ok, false);
  const arrival = shuttle.arrivalAt;
  manager.tick(arrival, () => {});
  assert.equal(shuttle.x, b.x);
  assert.equal(shuttle.z, b.z);
  assert.equal(shuttle.traveling, false);
  assert.equal(shuttle.departureAt, 0);
  for (const p of state.players.values()) assert.equal(p.vehicleId, "");
  assert.equal(shuttle.toX, a.x, "next trip returns to the first dock");
  const rider = state.players.get(clients[0].client.sessionId)!;
  assert.equal(rider.y, 0);
  assert.equal(rider.seat, -1);
  manager.enter(clients[0].client, "shuttle-1", arrival + 100);
  assert.equal(shuttle.departureAt, arrival + 100 + C.SHUTTLE_COUNTDOWN_MS);
});

test("an empty shuttle cancels boarding countdown; one rider leaving does not reset others", () => {
  const a = C.SHUTTLE_STOPS[0],
    { state, manager, clients } = fixture(2, a.x, a.z);
  manager.enter(clients[0].client, "shuttle-1", 100000);
  manager.enter(clients[1].client, "shuttle-1", 100100);
  const shuttle = state.vehicles.get("shuttle-1")!,
    departure = shuttle.departureAt;
  manager.exit(clients[0].client);
  assert.equal(shuttle.departureAt, departure);
  manager.disconnect(clients[1].client.sessionId);
  assert.equal(shuttle.departureAt, 0);
  manager.enter(clients[0].client, "shuttle-1", 200000);
  assert.equal(shuttle.departureAt, 200000 + C.SHUTTLE_COUNTDOWN_MS);
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
