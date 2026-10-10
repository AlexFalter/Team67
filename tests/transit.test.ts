import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";
import { withServer, until, startRound } from "./fixture.ts";
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3, Float32BufferAttribute, Group, Sprite } from "three";
import { carveTransitPassages } from "../apps/client/src/multiplayer/transitScenery.ts";
import { loadTransitModels } from "../apps/client/src/multiplayer/transitModels.ts";
import { readFileSync } from "node:fs";
import { disposeMap } from "../apps/client/src/maps/zurich/loadZurichMap.ts";
import { Vehicles } from "../apps/client/src/multiplayer/vehicles.ts";

function fixture(id: string, count: number) {
  const state = new RaceState({railCrashProtection:true}), manager = new VehicleManager(state, C.zurichWorld), v = state.vehicles.get(id)!;
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
  assert.ok(v.traveling); assert.ok(v.railDistance > C.TRAM_START_DISTANCE);
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
  assert.equal(v.railDistance, C.TRAM_START_DISTANCE); assert.equal(v.railReverse, false);
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
  assert.equal(lower.arrivalAt, upper.arrivalAt); assert.ok(Math.abs(lower.railDistance - upper.railDistance) < 1e-8, "cabins meet at the authored passing loop");
  assert.ok(Math.hypot(lower.x - upper.x, lower.z - upper.z) > 2.4, "counterweighted cabins pass separately");
  const p = state.players.get(a.client.sessionId)!; assert.equal(p.rotY, C.passengerYaw(lower, p.seat));
  manager.tick(lower.arrivalAt, () => {}); assert.equal(p.vehicleId, ""); assert.equal(p.seat, -1);
  assert.equal(lower.railReverse, true); assert.equal(upper.railReverse, false);
  Object.assign(p, C.railBoardingPoint(lower)); // Walk back into the cabin circle after disembarking.
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
test("tram stays at the street centre and Polybahn follows the elevated authored bridge", () => {
  for (const z of [0, -50, -100, -150]) {
    const p = C.tramPath.points.filter(p => p.x < 40).reduce((a, b) => Math.abs(a.z - z) < Math.abs(b.z - z) ? a : b);
    assert.ok(p.x > 19 && p.x < 25, `street centre at z=${z}, x=${p.x}`);
  }
  const bridge = C.polybahnPath.points.find(p => p.x === 40)!;
  assert.ok(bridge.y > 16 && bridge.y < 17, "cabin sits on bridge rails, above underlying ground");
  const a = C.createVehicle(C.POLYBAHN_KIND), b = C.createVehicle(C.POLYBAHN_KIND);
  a.railLane = -1.25; b.railLane = 1.25;
  a.railDistance = b.railDistance = C.polybahnMeetingDistance;
  const left = C.railFrame(a), right = C.railFrame(b);
  assert.ok(Math.hypot(left.x - right.x, left.z - right.z) > 3, "cabins clear each other at native loop");
});
test("live rooms replicate rail routes and timing, waiting joiners see the current trip state, reset rebuilds transport", async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("race", { name: "Alice", devMode:true, railCrashProtection:true }); rooms.push(a);
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
    assert.equal(late.state.vehicles.get("tram-1")!.railDistance, C.TRAM_START_DISTANCE);
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
    for (const axle of ["Axle_front", "Axle_rear"]) {
      assert.equal(a.getObjectByName(axle)!.scale.x, .625, "wheels match the map's 1 m gauge");
      assert.equal(b.getObjectByName(axle)!.scale.x, .625, "clones retain the corrected gauge");
    }
    for (const mesh of [...meshes(tram), ...meshes(a)]) assert.equal(mesh.geometry.attributes.color.count, mesh.geometry.attributes.position.count);
    assert.notEqual(meshes(a)[0].geometry, meshes(b)[0].geometry); assert.notEqual(meshes(a)[0].material, meshes(b)[0].material);
    const v=C.createVehicle(C.POLYBAHN_KIND),root=new Group(),label=new Sprite();root.add(a,label);
    const renderer=Object.create(Vehicles.prototype) as {pose(visual:unknown,t:number,dt:number):void};
    Object.assign(renderer,{net:{}});
    renderer.pose({rendered:v,latest:v,mesh:root,label,railCars:[a]},100000,1/60);
    root.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(a),labelPoint=label.getWorldPosition(new Vector3());
    assert(labelPoint.y>bounds.max.y,"waiting status floats above the cabin roof");
    assert(Math.abs(labelPoint.x-C.railFrame(v).x)<.001,"status follows the cabin rather than the lobby entry point");
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

test("tram carriages remain separated at departure and through the first bends", () => {
  const v = C.createVehicle(C.TRAM_KIND);
  for (let distance = C.TRAM_START_DISTANCE; distance < 100; distance += .25) {
    v.railDistance = distance;
    const frames = [0, 1, 2].map(part => C.railFrame(v, part));
    for (let part = 0; part < 2; part++) {
      const a = frames[part], b = frames[part + 1];
      const axes = (yaw: number) => [[Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]];
      const aa = axes(a.rotY), bb = axes(b.rotY);
      const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1];
      const radius = (axis: number[], carAxes: number[][]) => 1.23 * Math.abs(dot(axis, carAxes[0])) + 3.25 * Math.abs(dot(axis, carAxes[1]));
      const delta = [b.x - a.x, b.z - a.z];
      assert.ok([...aa, ...bb].some(axis => Math.abs(dot(delta, axis)) > radius(axis, aa) + radius(axis, bb)), `wagons overlap at ${distance}, pair ${part}`);
    }
  }
});
