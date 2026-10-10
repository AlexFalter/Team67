import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";
import { withServer, until, startRound } from "./fixture.ts";
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3, Float32BufferAttribute, Group, Sprite } from "three";
import { carveTransitPassages } from "../apps/client/src/multiplayer/transitScenery.ts";
import { loadTransitModels } from "../apps/client/src/multiplayer/transitModels.ts";
import { readFileSync } from "node:fs";
import { disposeMap } from "../apps/client/src/maps/zurich/loadZurichMap.ts";
import { Vehicles } from "../apps/client/src/multiplayer/vehicles.ts";

function fixture(id: string, count: number) {
  const state = new RaceState(), manager = new VehicleManager(state, C.zurichWorld), v = state.vehicles.get(id)!;
  const clients = Array.from({ length: count }, (_, i) => {
    const messages: C.VehicleResult[] = [];
    const client = { sessionId: `p${i}`, send: (_type: string, result: C.VehicleResult) => messages.push(result) } as unknown as Client;
    state.players.set(client.sessionId, new Player(C.railBoardingPoint(v)));
    return { client, messages };
  });
  return { state, manager, v, clients };
}
test("tram grants eighteen distinct seats, rejects overflow and forged driving, completes both directions", () => {
  const { state, manager, v, clients } = fixture("tram-1", 19), now = 100000;
  for (const [i, c] of clients.entries()) manager.enter(c.client, "tram-1", now + i * 100);
  assert.equal(new Set([...state.players.values()].filter(p => p.vehicleId === "tram-1").map(p => p.seat)).size, 18);
  assert.equal(clients[18].messages.at(-1)?.ok, false); assert.equal(v.driver, "");
  assert.equal(v.departureAt, now + C.TRANSIT_BOARDING_MS);
  const x = v.x; manager.move(clients[0].client, ["tram-1", 100, 100, 0, 10, 0], now + 2000); assert.equal(v.x, x);
  manager.enter(clients[18].client, "tram-1", v.departureAt); assert.equal(clients[18].messages.at(-1)?.ok, false);
  manager.tick(v.departureAt + C.TRANSIT_DOOR_MS + 5000, () => {});
  assert.ok(v.traveling); assert.ok(v.railDistance > 14);
  manager.exit(clients[0].client); assert.equal(clients[0].messages.at(-1)?.ok, false);
  for (const p of state.players.values()) if (p.vehicleId) {
    const seat = { x: 0, y: 0, z: 0 }; C.seatPosition(v, p.seat, seat);
    assert.deepEqual({ x: p.x, y: p.y, z: p.z }, seat);
  }
  manager.tick(v.arrivalAt, () => {});
  assert.equal(v.railDistance, C.tramPath.length); assert.equal(v.traveling, false); assert.equal(v.railReverse, true);
  for (const p of state.players.values()) { assert.equal(p.vehicleId, ""); assert.ok(C.zurichWorld.height(p.x, p.z) !== undefined); }
  const landed = [...state.players.values()].slice(0, 18);
  for (let i = 0; i < landed.length; i++) for (let j = i + 1; j < landed.length; j++)
    assert.ok(Math.hypot(landed[i].x - landed[j].x, landed[i].z - landed[j].z) >= C.CAPSULE_RADIUS * 2, "passengers have distinct clear landing spots");
  manager.enter(clients[0].client, "tram-1", now + 100000); manager.tick(v.departureAt + 1, () => {}); manager.tick(v.arrivalAt, () => {});
  assert.equal(v.railDistance, 14); assert.equal(v.railReverse, false);
});
test("both Polybahn cabins share one countdown, cancel only when both empty, pass on different tracks and release seats", () => {
  const { state, manager, v: lower, clients: [a, b] } = fixture("polybahn-1", 2), upper = state.vehicles.get("polybahn-2")!;
  Object.assign(state.players.get(b.client.sessionId)!, C.railBoardingPoint(upper));
  manager.enter(a.client, "polybahn-1", 100000); manager.enter(b.client, "polybahn-2", 100100);
  const departure = lower.departureAt; assert.equal(upper.departureAt, departure);
  manager.exit(a.client); assert.equal(lower.departureAt, departure);
  manager.disconnect(b.client.sessionId); assert.equal(lower.departureAt, 0); assert.equal(upper.departureAt, 0);
  manager.enter(a.client, "polybahn-1", 200000); manager.tick(lower.departureAt + 1, () => {});
  const midpoint = lower.tripStartedAt + C.railTripDuration(lower) / 2;
  manager.tick(midpoint, () => {});
  assert.equal(lower.arrivalAt, upper.arrivalAt); assert.ok(Math.abs(lower.railDistance + upper.railDistance - C.polybahnPath.length) < 1e-8);
  assert.ok(Math.hypot(lower.x - upper.x, lower.z - upper.z) > 2.4, "counterweighted cabins pass separately");
  const p = state.players.get(a.client.sessionId)!; assert.equal(p.rotY, C.passengerYaw(lower, p.seat));
  manager.tick(lower.arrivalAt, () => {}); assert.equal(p.vehicleId, ""); assert.equal(p.seat, -1);
  assert.equal(lower.railReverse, true); assert.equal(upper.railReverse, false);
  manager.enter(a.client, "polybahn-1", 300000); assert.equal(p.vehicleId, "polybahn-1", "upper station can start return ride");
});
test("tram follows smooth clear terrain and its carriage headings have no grid staircase", () => {
  const v = C.createVehicle(C.TRAM_KIND); let previous = C.railFrame(v), maxTurn = 0;
  for (let d = .5; d < C.tramPath.length; d += .5) {
    v.railDistance = d; const frame = C.railFrame(v);
    assert.ok(!C.zurichNativeBlocked(frame.x, frame.y, frame.z, 1.5, 3.4));
    for (const x of [-1.25, 0, 1.25]) for (const z of [-3.2, 0, 3.2]) {
      const px = frame.x + x * Math.cos(frame.rotY) + z * Math.sin(frame.rotY), pz = frame.z - x * Math.sin(frame.rotY) + z * Math.cos(frame.rotY);
      assert.equal(C.zurichNativeBlocked(px, frame.y, pz, .05, 3.4), false, `tram hull clips at distance ${d}`);
    }
    const y = C.zurichNativeHeight(frame.x, frame.z); assert.ok(y !== undefined && Math.abs(frame.y - y) < .25);
    maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(frame.rotY - previous.rotY), Math.cos(frame.rotY - previous.rotY)))); previous = frame;
  }
  assert.ok(maxTurn < .6, `largest half-metre heading change: ${maxTurn}`);
  for (const s of C.polybahnPassages) {
    const x = (s.a.x + s.b.x) / 2, z = (s.a.z + s.b.z) / 2, y = C.zurichWorld.height(x, z)!;
    assert.ok(Number.isFinite(y)); assert.equal(C.zurichWorld.blocked(x, y, z, .42, 1.8), false);
  }
});
test("live rooms replicate rail routes and timing, waiting joiners see the current trip state, reset rebuilds transport", async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("race", { name: "Alice" }); rooms.push(a);
    const b = await client.joinById(a.roomId, { name: "Bob" }); rooms.push(b);
    await until(() => a.state.players?.size === 2 && !!b.state.vehicles?.has("polybahn-2"), "rail schema on both clients");
    await startRound(a, [a, b]);
    for (const id of ["tram-1", "polybahn-1", "polybahn-2"]) {
      const va = a.state.vehicles.get(id)!, vb = b.state.vehicles.get(id)!;
      assert.equal(va.railDistance, vb.railDistance); assert.equal(va.railLane, vb.railLane); assert.equal(va.capacity, vb.capacity);
    }
    a.send("vehicleMove", ["tram-1", 0, 0, 0, 100, 100]);
    const late = await client.joinById(a.roomId, { name: "Waiting" }); rooms.push(late);
    await until(() => !!late.state.members?.has(late.sessionId), "late spectator");
    assert.equal(late.state.members.get(late.sessionId)!.spectator, true); assert.ok(!late.state.players.has(late.sessionId));
    assert.equal(late.state.vehicles.get("tram-1")!.railDistance, 14);
    a.send("finishRound"); await until(() => a.state.phase === "Finished", "finished round");
    a.send("restartRound"); await until(() => a.state.phase === "Lobby", "room reset");
    assert.equal(a.state.vehicles.get("polybahn-1")!.departureAt, 0); assert.equal(a.state.vehicles.get("polybahn-2")!.railReverse, true);
  }, "zurich");
});
test("Polybahn clipping opens only its narrow passage and preserves original geometry and attributes", () => {
  const s = C.polybahnPassages[3], x = (s.a.x + s.b.x) / 2, z = (s.a.z + s.b.z) / 2, y = C.passageFloor(x, z)!;
  const source = new BoxGeometry(6, 8, 6).translate(x, y + 2, z);
  source.setAttribute("uv1", new Float32BufferAttribute(Array.from(source.attributes.uv.array), 2));
  const originalPositions = source.attributes.position.array.slice(), originalIndex = source.index!.array.slice();
  const { geometry, removed } = carveTransitPassages(source);
  assert.ok(removed > 0); assert.deepEqual(source.attributes.position.array, originalPositions); assert.deepEqual(source.index!.array, originalIndex);
  assert.equal(geometry.attributes.uv1.count, geometry.attributes.position.count); assert.equal(geometry.attributes.uv.count, geometry.attributes.position.count);
  assert.ok(geometry.groups.length > 0);
  const material = new MeshBasicMaterial({ side: 2 }), before = new Mesh(source, material), after = new Mesh(geometry, material);
  const ray = new Raycaster(new Vector3(x, y + 1.6, z), new Vector3(1, 0, 0), 0, 3.1);
  assert.ok(ray.intersectObject(before).length > 0); assert.equal(ray.intersectObject(after).length, 0, "cabin corridor is open");
  ray.set(new Vector3(x, y + 5.9, z), new Vector3(1, 0, 0)); assert.ok(ray.intersectObject(after).length > 0, "building above the corridor remains");
  source.dispose(); geometry.dispose(); material.dispose();
});
test("actual prototype GLBs batch their palettes, retain articulated pivots and own clone resources", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const name = url.includes("polybahn") ? "polybahn" : "tram";
    return new Response(readFileSync(`apps/client/public/models/${name}.glb`));
  });
  const models = await loadTransitModels(new AbortController().signal, "/"), tram = models.create(true), a = models.create(false), b = models.create(false);
  try {
    const meshes = (root: typeof a) => { const result: Mesh[] = []; root.traverse(o => { if (o instanceof Mesh) result.push(o); }); return result; };
    assert.equal(meshes(tram).length, 2); assert.ok(meshes(a).length <= 12);
    for (const side of [-1, 1]) for (const leaf of [-1, 1]) assert.ok(a.getObjectByName(`Door_${side}_${leaf}`));
    assert.ok(a.getObjectByName("Axle_front")); assert.ok(a.getObjectByName("Axle_rear"));
    for (const mesh of [...meshes(tram), ...meshes(a)]) assert.equal(mesh.geometry.attributes.color.count, mesh.geometry.attributes.position.count);
    assert.notEqual(meshes(a)[0].geometry, meshes(b)[0].geometry); assert.notEqual(meshes(a)[0].material, meshes(b)[0].material);
    const before = meshes(b)[0].geometry.attributes.position.count;
    disposeMap(a); models.dispose(); assert.equal(meshes(b)[0].geometry.attributes.position.count, before);
  } finally { disposeMap(tram); disposeMap(b); }
});
test("client rail motion freezes on the authoritative pose when a room finishes mid-trip", () => {
  const v = C.createVehicle(C.TRAM_KIND); v.railDistance = 20; v.traveling = true; v.tripStartedAt = 100000;
  v.arrivalAt = v.tripStartedAt + C.railTripDuration(v); Object.assign(v, C.railFrame(v));
  const roomState = { phase: "Finished", finishedAt: 110000 }, vehicles = Object.create(Vehicles.prototype) as Vehicles;
  const label = new Sprite(), visual = { latest: v, rendered: C.createVehicle(), snapshots: [{ ...v, t: 110000 }], mesh: new Group(), label };
  Object.assign(vehicles, { net: { room: { state: roomState } }, items: new Map([["tram-1", visual]]) });
  vehicles.render(120000); assert.equal(visual.rendered.railDistance, 20);
  vehicles.render(140000); assert.equal(visual.rendered.railDistance, 20);
  roomState.phase = "Running"; vehicles.render(120000); assert.ok(visual.rendered.railDistance > 20);
  label.material.dispose();
});
