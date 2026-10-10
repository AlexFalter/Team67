import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } from "three";
import * as C from "../packages/shared/src/index.ts";
import { MateMachine } from "../apps/server/src/mate.ts";
import { Player, RaceState, RoomMember } from "../apps/server/src/state.ts";
import { batchMateModel } from "../apps/client/src/multiplayer/mateModel.ts";
import { withServer, until, startRound, delay } from "./fixture.ts";

function setup() {
  const state = new RaceState({ phase: C.RoomPhase.Running, startedAt: 1000, endsAt: 100000, introComplete: true });
  const machine = new MateMachine(state, C.flatWorld, () => .5, 1000);
  const clients = ["a", "b"].map(id => {
    state.members.set(id, new RoomMember());
    state.players.set(id, new Player({ ...C.mateSite(C.flatWorld), z: -14 })); machine.join(id);
    return { sessionId: id, send() {} } as unknown as Client;
  });
  const send = (id: number, action: C.MateCommand["action"], now: number, flavor?: number) => machine.command(clients[id], { action, flavor, roundStartedAt: 1000 }, now);
  return { state, machine, clients, send };
}

test("independent purchases enforce payment, refunds, retry delay, timed drop and exactly one collectible per player", () => {
  const { state, send, machine } = setup(), a = state.mates.get("a")!, b = state.mates.get("b")!;
  send(0, "collect", 1000); assert.equal(state.players.get("a")!.mateCount, 0);
  send(0, "select", 1000, 0); send(0, "pay", 1000); send(0, "pay", 1100);
  send(1, "select", 1000, 2); send(1, "pay", 1000);
  assert.equal(a.attempts, 1); assert.equal(b.attempts, 1);
  send(1, "collect", 2400); assert.equal(b.phase, "dropping"); assert.equal(state.players.get("b")!.mateCount, 0);
  machine.tick(2400); assert.equal(a.phase, "failure"); assert.equal(a.retryAt, 3400);
  send(0, "select", 3300, 1); assert.equal(a.phase, "failure");
  send(0, "select", 3400, 0); assert.equal(a.phase, "failure", "failed flavors cannot be bought again");
  send(0, "select", 3400, 1); send(0, "pay", 3400); machine.tick(4800); assert.equal(a.retryAt, 6800, "second failure waits two seconds");
  send(1, "collect", 3350); send(1, "collect", 3351); assert.equal(state.players.get("b")!.mateCount, 1);
  send(0, "select", 6800, 2); send(0, "close", 6801); assert.equal(a.phase, "idle"); assert.equal(a.attempts, 2);
  send(0, "select", 6802, 2); send(0, "pay", 6802); send(0, "close", 6900); assert.equal(a.phase, "loading", "closing does not restart paid transactions");
  send(0, "collect", 6802 + C.MATE_LOADING_MS + C.MATE_DROP_MS);
  assert.equal(state.players.get("a")!.mateCount, 1); assert.equal(a.phase, "success");
});

test("invalid, remote, mounted, knocked-down, spectator, stale-round and finished commands cannot grant inventory", () => {
  const { state, machine, clients, send } = setup(), p = state.players.get("a")!, s = state.mates.get("a")!;
  for (const flavor of [-1, 4, NaN, Infinity, .5, "2"]) machine.command(clients[0], { action: "select", flavor, roundStartedAt: 1000 }, 1000);
  machine.command(clients[0], null, 1000); assert.equal(s.phase, "idle");
  p.z = -10; send(0, "select", 1000, 2); assert.equal(s.phase, "idle", "no back-wall interaction");
  p.z = -20; send(0, "select", 1000, 2); assert.equal(s.phase, "idle"); p.z = -14;
  p.vehicleId = "bike"; send(0, "select", 1000, 2); assert.equal(s.phase, "idle"); p.vehicleId = "";
  p.knockdownUntil = 2000; send(0, "select", 1000, 2); assert.equal(s.phase, "idle"); p.knockdownUntil = 0;
  state.members.get("a")!.spectator = true; send(0, "select", 1000, 2); assert.equal(s.phase, "idle"); state.members.get("a")!.spectator = false;
  machine.command(clients[0], { action: "select", flavor: 2, roundStartedAt: 999 }, 1000); assert.equal(s.phase, "idle");
  send(0, "select", 1000, 2); send(0, "pay", 1000); state.phase = C.RoomPhase.Finished;
  machine.tick(9000); send(0, "collect", 9000); assert.equal(s.phase, "loading"); assert.equal(p.mateCount, 0);
  machine.leave("a"); assert.equal(state.mates.has("a"), false);
});

test("drinking is single-use, gives the prototype's walking speed, and pauses the server timer while riding", () => {
  const { state, send, machine } = setup(), p = state.players.get("a")!;
  p.mateCount = 1; send(0, "use", 1000); send(0, "use", 1001);
  assert.equal(p.mateCount, 0); assert.equal(p.mateBoostMs, C.MATE_BOOST_MS);
  const normal = C.createBody(), boosted = C.createBody(); boosted.mateBoostMs = C.MATE_BOOST_MS;
  for (let i = 0; i < 60; i++) {
    C.stepPlayer(normal, { ...C.IDLE_INPUT, x: 1, sprint: true }, 1 / 60);
    C.stepPlayer(boosted, { ...C.IDLE_INPUT, x: 1, sprint: true }, 1 / 60);
  }
  assert.ok(Math.abs(boosted.vx / normal.vx - C.MATE_SPEED_MULTIPLIER) < .001);
  for (let i = 0; i < 60; i++) C.stepPlayer(boosted, { ...C.IDLE_INPUT, x: 1, sprint: true }, 1 / 60);
  assert.ok(boosted.vx <= C.MAX_HORIZONTAL_SPEED, "existing report limit accepts the boosted sprint speed");
  p.vehicleId = "bike"; machine.tick(5000); assert.equal(p.mateBoostMs, C.MATE_BOOST_MS);
  p.vehicleId = ""; machine.tick(6000); assert.equal(p.mateBoostMs, C.MATE_BOOST_MS - 1000);
  machine.tick(21000); assert.equal(p.mateBoostMs, 0);
});

test("cabinet has accessible native terrain, blocks its footprint and leaves the route and interaction aisle clear", () => {
  const site = C.mateSite(C.zurichWorld);
  assert.equal(C.zurichNativeBlocked(site.x, site.y, site.z, 1.1, 2.7), false);
  assert.equal(C.zurichWorld.blocked(site.x, site.y, site.z, .5, 1.8), true);
  for (const offset of [1.5, 2, 2.5]) {
    const p = { ...site, z: site.z - offset };
    assert.ok(C.nearMate(p, C.zurichWorld)); assert.equal(C.zurichWorld.blocked(p.x, p.y, p.z, .5, 1.8), false);
  }
  assert.equal(C.zurichWorld.blocked(-187.722, site.y, 49.187, .5, 1.8), false);
  const pose = C.mateCanDropPose(20); assert.equal(pose.y, .341); assert.equal(pose.z, -.42);
});

test("cabinet batching preserves textured materials, world transforms and independent can resources", () => {
  const source = new Group(), texture = new Texture(), material = new MeshStandardMaterial({ map: texture });
  for (const x of [-1, 1]) { const mesh = new Mesh(new BoxGeometry(), material); mesh.position.x = x; source.add(mesh); }
  const model = batchMateModel(source); assert.equal(model.children.length, 1);
  const mesh = model.children[0] as Mesh; assert.equal(mesh.material, material); assert.equal(material.map, texture);
  mesh.geometry.computeBoundingBox(); assert.equal(mesh.geometry.boundingBox!.min.x, -1.5); assert.equal(mesh.geometry.boundingBox!.max.x, 1.5);
  assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count);
  mesh.geometry.dispose(); material.dispose(); texture.dispose();
});

test("live clients buy independently; duplicate collection cannot steal rewards, and reset clears purchases and boosts", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("race", { name: "Alice" }); rooms.push(a);
    const b = await client.joinById(a.roomId, { name: "Bob" }); rooms.push(b);
    const replies = new Map<string, C.MateResult[]>();
    for (const room of rooms) { replies.set(room.sessionId, []); room.onMessage<C.MateResult>("mateResult", r => replies.get(room.sessionId)!.push(r)); for (const type of ["playerCorrection", "vehicleResult", "impulse", "bump"]) room.onMessage(type, () => {}); }
    await until(() => a.state.mates?.size === 2, "per-player vending states"); await startRound(a, [a, b]);
    const select = (flavor: number) => { for (const room of [a, b]) room.send("mate", { action: "select", flavor, roundStartedAt: room.state.startedAt }); };
    const action = (value: string) => { for (const room of [a, b]) room.send("mate", { action: value, roundStartedAt: room.state.startedAt }); };
    await delay(600); // Normal position-report budget reaches the flat test cabinet.
    for (const [room, x] of [[a, -.6], [b, .6]] as const) room.send("move", [x, 0, -14, 0, 0, 0, 0, 0]);
    await until(() => [...a.state.players.values()].every(p => C.nearMate(p, C.flatWorld)), "players reach cabinet").catch(error => { throw new Error(`${error}: ${JSON.stringify([...a.state.players.values()].map(p => C.snapshot(p, C.createBody())))}`); });
    for (let flavor = 0; flavor < 4; flavor++) {
      select(flavor); await until(() => [...a.state.mates.values()].every(s => s.phase === "payment"), "select flavor");
      action("pay"); action("pay");
      await until(() => [...a.state.mates.values()].every(s => ["failure", "collect"].includes(s.phase)), "server finishes vending");
      if ([...a.state.mates.values()][0].phase === "collect") break;
      await until(() => a.state.serverTime >= Math.max(...[...a.state.mates.values()].map(s => s.retryAt)), "retry delay");
    }
    action("collect"); action("collect"); await until(() => [...a.state.players.values()].every(p => p.mateCount === 1), "each player's reward");
    action("use"); action("use"); await until(() => [...b.state.players.values()].every(p => p.mateCount === 0 && p.mateBoostMs > 0), "replicated boosts");
    assert.ok([...replies.values()].every(list => list.some(r => !r.ok)), "duplicate actions rejected");
    const late = await client.joinById(a.roomId, { name: "Waiting" }); rooms.push(late); late.onMessage("mateResult", () => {});
    await until(() => !!late.state.members?.has(late.sessionId), "late spectator");
    late.send("mate", { action: "use", roundStartedAt: late.state.startedAt }); assert.equal(late.state.mates.has(late.sessionId), false);
    a.send("finishRound"); await until(() => a.state.phase === "Finished", "results");
    const frozen = a.state.players.get(a.sessionId)!.mateBoostMs; await delay(100); assert.equal(a.state.players.get(a.sessionId)!.mateBoostMs, frozen);
    a.send("restartRound"); await until(() => a.state.phase === "Lobby" && a.state.mates.size === 3, "reset includes waiting member");
    assert.ok([...a.state.mates.values()].every(s => s.phase === "idle" && s.tried === 0));
    assert.ok([...a.state.players.values()].every(p => p.mateCount === 0 && p.mateBoostMs === 0));
  });
});
