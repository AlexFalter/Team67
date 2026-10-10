import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { PubliBikes } from "../apps/server/src/publiBikes.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";
import { RaceState, Player } from "../apps/server/src/state.ts";
import { withServer, until, startRound, type WireState } from "./fixture.ts";

function setup() {
  const state = new RaceState({ phase: C.RoomPhase.Running, introComplete: true });
  const vehicles = new VehicleManager(state), fleet = new PubliBikes(state, vehicles, C.flatWorld, undefined, () => 1);
  const messages = new Map<string, { type: string; data: C.BikeUnlockResult }[]>();
  const client = (id: string) => {
    const v = state.vehicles.get("publibike-1")!;
    state.players.set(id, new Player({ x: v.x, y: v.y, z: v.z - 2, simTime: 1000 })); messages.set(id, []);
    return { sessionId: id, send: (type: string, data: C.BikeUnlockResult) => messages.get(id)!.push({ type, data }) } as unknown as Client;
  };
  const last = (id: string) => messages.get(id)!.filter(m => m.type === "bikeUnlockResult").at(-1)!.data;
  return { state, vehicles, fleet, client, last };
}

test("the first scan reserves atomically; direct boarding, other players and early completion cannot steal it", () => {
  const { state, vehicles, fleet, client, last } = setup(), a = client("a"), b = client("b");
  const request = { bikeId: "publibike-1", requestId: "first" };
  fleet.begin(a, request, 1000); const token = last("a").token!;
  fleet.begin(b, { ...request, requestId: "second" }, 1000);
  assert.equal(last("b").ok, false); assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "a");
  vehicles.enter(b, request.bikeId, 1001); vehicles.enter(a, request.bikeId, 1001);
  assert.equal(state.vehicles.get(request.bikeId)!.driver, "");
  fleet.finish(b, { ...request, token }, 4000); assert.equal(state.vehicles.get(request.bikeId)!.driver, "");
  fleet.finish(a, { ...request, token }, 1001); assert.equal(last("a").ok, false);
  assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "a");
  fleet.finish(a, { ...request, token }, 4000);
  assert.equal(state.vehicles.get(request.bikeId)!.driver, "a"); assert.equal(state.players.get("a")!.vehicleId, request.bikeId);
  assert.equal(state.publiBikes.get(request.bikeId)!.dock, -1);
  fleet.finish(b, { ...request, token }, 4001); assert.equal(state.vehicles.get(request.bikeId)!.driver, "a");
});

test("cancel and disconnect release scans; stale tokens, duplicate begins and old cancels cannot affect a new lease", () => {
  const { state, fleet, client, last } = setup(), a = client("a"), b = client("b");
  const request = { bikeId: "publibike-1", requestId: "old" };
  fleet.begin(a, request, 1000); const token = last("a").token!;
  const deadline = state.publiBikes.get(request.bikeId)!.reservationUntil;
  fleet.begin(a, request, 2000); assert.equal(state.publiBikes.get(request.bikeId)!.reservationUntil, deadline);
  fleet.begin(a, { bikeId: "publibike-2", requestId: "other" }, 2000); assert.equal(last("a").ok, false);
  fleet.cancel(b, request); assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "a");
  fleet.cancel(a, request); fleet.begin(a, { ...request, requestId: "new" }, 3000);
  fleet.cancel(a, request); fleet.finish(a, { ...request, token }, 6000);
  assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "a"); assert.equal(state.vehicles.get(request.bikeId)!.driver, "");
  fleet.disconnect("a"); fleet.begin(b, { ...request, requestId: "next" }, 6001);
  assert.equal(last("b").ok, true);
  fleet.tick(6001 + C.PUBLI_BIKE_LEASE_MS); assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "");
});

test("walking away, knockdown, and finished rooms release locks; broken bikes cannot unlock", () => {
  const { state, fleet, client, last } = setup(), a = client("a"), request = { bikeId: "publibike-1", requestId: "scan" };
  fleet.begin(a, request, 1000); state.players.get("a")!.x += 20; fleet.tick(1100);
  assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "");
  state.players.get("a")!.x -= 20; fleet.begin(a, request, 1200); state.players.get("a")!.knockdownUntil = 9000; fleet.tick(1300);
  assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "");
  state.players.get("a")!.knockdownUntil = 0; fleet.begin(a, request, 1400); state.phase = C.RoomPhase.Finished; fleet.tick(1500);
  assert.equal(state.publiBikes.get(request.bikeId)!.reservedBy, "");
  state.phase = C.RoomPhase.Running; state.publiBikes.get(request.bikeId)!.broken = true;
  fleet.begin(a, request, 2000); fleet.finish(a, { ...request, token: last("a").token }, 5000);
  assert.equal(last("a").ok, false); assert.equal(state.vehicles.get(request.bikeId)!.driver, "");
});

test("battery consumption is server-timed, pauses when parked, and cannot be reset by rescanning", () => {
  const { state, vehicles, fleet, client, last } = setup(), a = client("a"), request = { bikeId: "publibike-1", requestId: "scan" };
  fleet.begin(a, request, 1000); fleet.finish(a, { ...request, token: last("a").token }, 4000);
  fleet.tick(4000); fleet.tick(9000); assert.equal(state.publiBikes.get(request.bikeId)!.batteryMs, 10000);
  vehicles.exit(a); fleet.park(request.bikeId); fleet.tick(14000);
  assert.equal(state.publiBikes.get(request.bikeId)!.batteryMs, 10000);
  const v = state.vehicles.get(request.bikeId)!, p = state.players.get("a")!;
  Object.assign(p, { x: v.x, y: v.y, z: v.z - 2, simTime: 14000 });
  fleet.begin(a, { ...request, requestId: "again" }, 14000);
  fleet.finish(a, { ...request, token: last("a").token }, 17000); fleet.tick(17000); fleet.tick(30000);
  assert.equal(state.publiBikes.get(request.bikeId)!.batteryMs, 0); assert.equal(state.publiBikes.get(request.bikeId)!.broken, true);
  assert.equal(p.vehicleId, ""); assert.equal(v.driver, "");
});

test("prototype station positions have room for all bike footprints and the access aisle", () => {
  const site = C.publiBikeStation(C.zurichWorld); assert.equal(site.slots.length, 8);
  assert.ok(Math.hypot(site.center.x + 205.551, site.center.z - 49.449) < 30);
  for (const p of site.slots) assert.equal(C.zurichWorld.blocked(p.x, p.y, p.z, C.vehicleRadius({ kind: 2 }), C.CAPSULE_HEIGHT), false);
});

test("live clients compete for a reservation; leaving frees it and reset restores the fleet", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race", { name: "Ada" }); rooms.push(a);
    const b = await client.joinById<WireState>(a.roomId, { name: "Ben" }); rooms.push(b);
    const replies = new Map<string, C.BikeUnlockResult[]>();
    for (const room of rooms) {
      replies.set(room.sessionId, []); room.onMessage<C.BikeUnlockResult>("bikeUnlockResult", r => replies.get(room.sessionId)!.push(r));
      for (const type of ["playerCorrection", "bump", "impulse", "vehicleResult"]) room.onMessage(type, () => {});
    }
    await until(() => b.state.members?.size === 2, "lobby"); await startRound(a, [a, b]);
    const v = a.state.vehicles.get("publibike-1")!;
    // Wait for the normal movement report budget, then use legitimate foot reports.
    await new Promise(r => setTimeout(r, 1600));
    for (const room of rooms) room.send("move", [v.x, 0, v.z - 2, 0, 0, 0, 0, 0]);
    await until(() => [a.sessionId, b.sessionId].every(id => Math.abs(a.state.players.get(id)!.z - (v.z - 2)) < 1), "both nearby");
    for (const [i, room] of rooms.entries()) room.send("bikeScanBegin", { bikeId: "publibike-1", requestId: `scan-${i}` });
    await until(() => [...replies.values()].every(r => r.length), "both scan replies");
    assert.equal([...replies.values()].filter(r => r[0].ok).length, 1, JSON.stringify({ replies: [...replies.values()], vehicle: C.snapshot(v, C.createVehicle()), players: [...a.state.players.values()].map(p => C.snapshot(p, C.createBody())) }));
    const winner = [a, b].find(r => replies.get(r.sessionId)![0].ok)!, loser = winner === a ? b : a;
    await winner.leave(); await until(() => !loser.state.publiBikes.get("publibike-1")!.reservedBy, "disconnect release");
    loser.send("bikeScanBegin", { bikeId: "publibike-1", requestId: "retry" });
    await until(() => replies.get(loser.sessionId)!.at(-1)?.requestId === "retry", "new grant");
    assert.equal(replies.get(loser.sessionId)!.at(-1)!.ok, true);
    loser.send("finishRound"); await until(() => loser.state.phase === C.RoomPhase.Finished, "finish");
    await until(() => !loser.state.publiBikes.get("publibike-1")!.reservedBy, "finish release");
    loser.send("restartRound"); await until(() => loser.state.phase === C.RoomPhase.Lobby, "reset");
    assert.equal(loser.state.publiBikes.size, 8);
    assert.ok([...loser.state.publiBikes.values()].every(bike => bike.batteryMs === C.PUBLI_BIKE_BATTERY_MS && !bike.reservedBy));
  });
});
