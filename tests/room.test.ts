import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { withServer, until, delay, inbox, type GameRoom } from "./server.ts";

const world = C.zurichWorld;
const move = (room: GameRoom, x: number, y: number, z: number, yaw = 0) =>
  room.send(C.MOVE, [Date.now(), x, y, z, yaw, 0, 0, 0, 0]);
const me = (room: GameRoom) => room.state.players.get(room.sessionId)!;

test("rooms: codes, names, lobby ready flow, round start", { timeout: 40000 }, async () => {
  await withServer(async (client, rooms) => {
    await assert.rejects(client.create("game", { name: "  ", code: "ABCD" }), "empty name rejected");
    await assert.rejects(client.create("game", { name: "Ann", code: "!" }), "bad code rejected");
    const a = await client.create<C.Phase>("game", { name: " Ann  Lee ", code: "room-1", character: 2 }) as unknown as GameRoom;
    rooms.push(a);
    assert.equal(a.roomId, "ROOM-1");
    await assert.rejects(client.create("game", { name: "Bob", code: "ROOM-1" }), "duplicate code rejected");
    await assert.rejects(client.joinById("NOPE", { name: "Bob" }));
    const b = await client.joinById("ROOM-1", { name: "Bob" }) as unknown as GameRoom;
    rooms.push(b);
    await until(() => a.state.players?.size === 2 && b.state.players?.size === 2, "both see two players");
    assert.equal(me(a).name, "Ann Lee");
    assert.equal(me(a).character, 2);
    assert.equal(a.state.host, a.sessionId);
    a.send(C.READY, true);
    b.send(C.READY, "yes");
    await delay(150);
    assert.equal(a.state.phase, C.LOBBY, "everyone must be ready");
    a.send(C.READY, false);
    b.send(C.READY, true);
    await delay(150);
    assert.equal(a.state.phase, C.LOBBY, "ready can be cancelled");
    a.send(C.READY, true);
    await until(() => a.state.phase === C.RUNNING, "round starts");
    for (const r of [a, b]) {
      const p = me(r);
      assert.ok(!Number.isNaN(world.height(p.x, p.z)) && !world.blocked(p.x, p.y, p.z, C.RADIUS, C.HEIGHT), "spawned on free ground");
    }
    assert.ok(a.state.endsAt - Date.now() > C.ROUND_MS - 5000);
  });
});

test("movement: valid reports propagate, teleports and walls are corrected", { timeout: 40000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("game", { name: "Ann", code: "MOVE" }) as unknown as GameRoom;
    const b = await client.joinById("MOVE", { name: "Bob" }) as unknown as GameRoom;
    rooms.push(a, b);
    const corrections = inbox<number[]>(a, C.CORRECT);
    await until(() => a.state.players?.size === 2, "joined");
    a.send(C.READY, true); b.send(C.READY, true);
    await until(() => a.state.phase === C.RUNNING && b.state.phase === C.RUNNING, "running");
    const start = { ...me(a) };
    await delay(300);
    const near = C.findGround(world, start.x + 2, start.z)!;
    move(a, near.x, near.y, near.z, 1);
    await until(() => Math.abs(b.state.players.get(a.sessionId)!.x - near.x) < 1e-3, "B sees A's move");
    assert.ok(Math.abs(b.state.players.get(a.sessionId)!.t - Date.now()) < 1000, "sample time on the server clock");
    await delay(100);
    move(a, near.x + 200, near.y, near.z);
    await until(() => corrections.length === 1, "teleport corrected");
    assert.ok(Math.abs(corrections[0][0] - near.x) < 1e-3, "correction points back to the last valid pose");
    assert.ok(Math.abs(me(a).x - near.x) < 1e-3, "teleport not applied");
    // A building column within reach (search outward from the current position).
    let wall: C.Point | undefined;
    for (let r = 2; r < 12 && !wall; r += 0.5)
      for (let k = 0; k < 32 && !wall; k++) {
        const x = near.x + Math.cos(k / 5) * r, z = near.z + Math.sin(k / 5) * r, y = world.height(x, z);
        if (!Number.isNaN(y) && world.blocked(x, y, z, C.RADIUS * 0.8, C.HEIGHT)) wall = { x, y, z };
      }
    assert.ok(wall, "test setup: a building near spawn");
    await delay(600);
    move(a, wall.x, wall.y, wall.z);
    await until(() => corrections.length === 2, "walking into a building corrected");
    assert.ok(Math.abs(me(a).x - near.x) < 1e-3);
    a.send(C.MOVE, [Date.now(), NaN, 0, 0, 0, 0, 0, 0, 0]);
    a.send(C.MOVE, [Date.now(), 1, 2]);
    await delay(100);
    assert.ok(Math.abs(me(a).x - near.x) < 1e-3, "malformed reports ignored");
  });
});

test("combat: punch cone knocks down for 5 s, cooldown, scores; results include leavers; host transfer", { timeout: 40000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("game", { name: "Ann", code: "FIGHT" }) as unknown as GameRoom;
    const b = await client.joinById("FIGHT", { name: "Bob" }) as unknown as GameRoom;
    const c = await client.joinById("FIGHT", { name: "Cid" }) as unknown as GameRoom;
    rooms.push(a, b, c);
    const knocks = inbox<number[]>(b, C.KNOCK), hits = inbox<number[]>(c, C.HIT);
    await until(() => a.state.players?.size === 3, "joined");
    for (const r of [a, b, c]) r.send(C.READY, true);
    await until(() => [a, b, c].every(r => r.state.phase === C.RUNNING), "running");
    await delay(600);
    // Put A on free ground and B 1.5 m in front of A (yaw 0 faces -Z), C far away.
    const spot = C.findGround(world, world.spawn.x, world.spawn.z)!;
    const front = C.findGround(world, spot.x, spot.z - 1.5)!;
    move(a, spot.x, spot.y, spot.z, 0);
    move(b, front.x, front.y, front.z, 0);
    await until(() => Math.abs(a.state.players.get(b.sessionId)!.z - front.z) < 1e-3 && Math.abs(me(a).x - spot.x) < 1e-3, "positions");
    assert.ok(C.inPunchCone({ ...spot, yaw: 0 }, front, world), "test setup: B in the cone");
    a.send(C.PUNCH, [0, Date.now()]);
    await until(() => knocks.length === 1, "B knocked");
    assert.equal(knocks[0][3], C.PUNCH_KNOCKDOWN_MS);
    assert.ok(knocks[0][2] < 0, "pushed along A's facing (-Z)");
    await until(() => hits.length === 1, "impact broadcast");
    await until(() => b.state.players.get(b.sessionId)!.downUntil > Date.now() + 4000, "downUntil synced");
    assert.equal(b.state.players.get(a.sessionId)!.punches, 1, "punch animation counter");
    a.send(C.PUNCH, [0, Date.now()]);
    await delay(200);
    assert.equal(knocks.length, 1, "cooldown");
    b.send(C.PUNCH, [Math.PI, Date.now()]);
    await delay(200);
    assert.equal(a.state.players.get(a.sessionId)!.downUntil, 0, "knocked-down players cannot punch");
    // A (host) leaves: host passes on, A still appears in results.
    await a.leave();
    await until(() => b.state.host !== "" && b.state.host !== a.sessionId, "host transferred");
    const host = b.state.host === b.sessionId ? b : c, other = host === b ? c : b;
    other.send(C.END_ROUND);
    await delay(150);
    assert.equal(b.state.phase, C.RUNNING, "only the host can end the round");
    host.send(C.END_ROUND);
    await until(() => b.state.phase === C.FINISHED, "finished");
    const results = [...b.state.results].map(r => [r.name, r.hits, r.taken]);
    assert.deepEqual(results[0], ["Ann", 1, 0], "sorted by hits, leaver included");
    assert.deepEqual(results.find(r => r[0] === "Bob"), ["Bob", 0, 1]);
    // Late joiner waits with no entity until the next round.
    const d = await client.joinById("FIGHT", { name: "Dee" }) as unknown as GameRoom;
    rooms.push(d);
    await until(() => d.state.players?.get(d.sessionId) !== undefined, "late join");
    assert.equal(me(d).waiting, true);
    other.send(C.TO_LOBBY);
    await delay(150);
    assert.equal(b.state.phase, C.FINISHED, "results stay until the host returns to the lobby");
    host.send(C.TO_LOBBY);
    await until(() => d.state.phase === C.LOBBY && !me(d).waiting && d.state.results.length === 0, "back in the lobby");
  });
});

test("rounds end on their own after ROUND_DURATION_MS", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("game", { name: "Ann", code: "SHORT" }) as unknown as GameRoom;
    rooms.push(a);
    await until(() => a.state.players?.size === 1, "joined");
    a.send(C.READY, true);
    await until(() => a.state.phase === C.RUNNING, "running");
    await until(() => a.state.phase === C.FINISHED, "timer finished the round", 3000);
  }, { ROUND_DURATION_MS: "800" });
});
