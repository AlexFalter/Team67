import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, createServer, type Socket } from "node:net";
import { Client } from "@colyseus/sdk";
import * as C from "../packages/shared/src/index.ts";
import { reportClient } from "./reportClient.ts";
import { startRound, withServer, listen, until, delay, type WireState } from "./fixture.ts";

test("main reports keep feature movement immediate under 160ms latency", { timeout: 20000 }, async () => {
  await withServer(async (client, rooms, port) => {
    const sockets = new Set<Socket>(), pending = new Set<ReturnType<typeof setTimeout>>();
    const proxy = createServer(downstream => {
      const upstream = connect(port, "127.0.0.1");
      sockets.add(downstream); sockets.add(upstream);
      for (const [source, destination] of [[downstream, upstream], [upstream, downstream]]) {
        source.on("data", data => {
          const timer = setTimeout(() => { pending.delete(timer); if (!destination.destroyed) destination.write(data); }, 80);
          pending.add(timer);
        });
        source.on("error", () => destination.destroy());
        source.on("close", () => destination.destroy());
      }
    });
    let movingClient: ReturnType<typeof reportClient> | undefined;
    let leave: (() => Promise<unknown>) | undefined;
    try {
      const proxyPort = await listen(proxy);
      const room = await new Client(`ws://127.0.0.1:${proxyPort}`).create<WireState>("race", { name: "Player" });
      rooms.push(room);
      let collisions = 0;
      room.onMessage("bump", () => collisions++);
      leave = () => room.leave();
      await until(() => !!room.state?.players?.get(room.sessionId), "initial state");
      await startRound(room, [room]);
      const own = room.state.players.get(room.sessionId)!, initial = own.x;
      movingClient = reportClient(room); movingClient.input.z = -1; movingClient.input.sprint = true;
      const startZ = own.z;
      await delay(40);
      assert.ok(movingClient.body.z < startZ && own.z === startZ, "movement precedes round trip");
      await delay(800); movingClient.input.z = 0;
      let pong: C.Pong | undefined;
      room.onMessage<C.Pong>("pong", value => pong = value);
      const ping = Date.now(); room.send("ping", { clientTime: ping });
      await until(() => !!pong, "clock reply"); assert.ok(Date.now() - ping >= 140);
      await delay(500);
      assert.ok(Math.abs(movingClient.body.z - own.z) < 0.2, "reports converge after stopping");
      assert.equal(collisions, 0); assert.equal(own.x, initial);
    } finally {
      movingClient?.stop();
      await leave?.();
      pending.forEach(clearTimeout); sockets.forEach(s => s.destroy());
      await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  });
});


test("clients share stationary look-directed punches, cooldown and recovery without bananas", { timeout: 15000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race", { name: "Player" }), b = await client.joinById<WireState>(a.roomId, { name: "Player" }); rooms.push(a, b);
    const hits: C.Impulse[] = [];
    rooms.forEach(room => { room.onMessage("bump", () => {}); room.onMessage("playerCorrection", () => {}); });
    b.onMessage<C.Impulse>("impulse", hit => hits.push(hit));
    await until(() => a.state?.players?.size === 2 && b.state?.players?.size === 2, "two players");
    await startRound(a, [a, b]);
    assert.ok(!("peels" in a.state));
    assert.ok(!("shoes" in a.state.players.get(a.sessionId)!), "running-shoe state is removed from the live schema");
    const own = a.state.players.get(a.sessionId)!, startX = own.x;
    a.send("move", [own.x, own.y, own.z, Math.PI / 2, 0, 0, 0, 0]); a.send("hit");
    await until(() => hits.length === 1 && b.state.players.get(b.sessionId)!.knockdownUntil > Date.now(), "punch");
    assert.equal(hits[0].durationMs, C.ATTACK_KNOCKDOWN_MS);
    const victim = b.state.players.get(b.sessionId)!;
    assert.equal(victim.impactStartedAt, hits[0].at);
    assert.equal(victim.impactX, hits[0].ix);
    assert.ok(victim.impactStrength! > 8);
    assert.ok(Math.abs(b.state.players.get(a.sessionId)!.rotY - Math.PI / 2) < 0.0001);
    assert.equal(own.x, startX);
    const deadline = b.state.players.get(b.sessionId)!.knockdownUntil;
    a.send("hit"); await delay(100); assert.equal(hits.length, 1);
    assert.equal(b.state.players.get(b.sessionId)!.knockdownUntil, deadline);
    await until(() => b.state.players.get(b.sessionId)!.simTime >= deadline && b.state.players.get(b.sessionId)!.anim !== 3, "recovery without client input", 6500);
  });
});

test("reported bike impact ejects its rider and replicates its fall; occupancy stays exclusive", { timeout: 15000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race", { name: "Player", character: 2 }), b = await client.joinById<WireState>(a.roomId, { name: "Player" }); rooms.push(a, b);
    rooms.forEach(room => { room.onMessage("bump", () => {}); room.onMessage("vehicleResult", () => {}); });
    await until(() => a.state?.players?.size === 2 && b.state?.players?.size === 2, "players");
    await startRound(a, [a, b]);
    const rider = reportClient(a), other = reportClient(b);
    try {
      rider.input.z = 1; await until(() => a.state.players.get(a.sessionId)!.z > 1.5, "boarding range");
      rider.input.z = 0; a.send("vehicleEnter", "bike-2");
      await until(() => rider.body.vehicleId === "bike-2", "board bicycle");
      b.send("vehicleEnter", "bike-2"); await delay(100);
      assert.equal(a.state.vehicles.get("bike-2")!.driver, a.sessionId);
      rider.input.x = -0.45; rider.input.z = -0.9;
      await until(() => a.state.vehicles.get("bike-2")!.fallenUntil > Date.now(), "hit parked car");
      await until(() => !rider.body.vehicleId && rider.body.knockdownUntil > rider.body.simTime, "ejection impulse");
      assert.equal(a.state.vehicles.get("bike-2")!.driver, "");
      assert.ok(rider.body.impactStrength! > 0);
      assert.ok(rider.body.knockdownUntil - rider.body.impactStartedAt! > C.ATTACK_KNOCKDOWN_MS);
      assert.equal(a.state.players.get(a.sessionId)!.character, 2);
    } finally { rider.stop(); other.stop(); }
  });
});

test("feature sprint momentum and jumping survive report networking", { timeout: 10000 }, async () => {
  await withServer(async (client, rooms) => {
    const room = await client.create<WireState>("race", { name: "Player" }); rooms.push(room); room.onMessage("bump", () => {});
    await until(() => !!room.state?.players?.get(room.sessionId), "initial state");
    await startRound(room, [room]);
    const moving = reportClient(room), own = room.state.players.get(room.sessionId)!;
    try {
      moving.input.z = -1; moving.input.sprint = true;
      await until(() => own.vz < -10, "sprint"); moving.input.jump = true;
      await until(() => !moving.body.grounded && moving.body.vy > 0, "takeoff"); moving.input.z = 0;
      const speed = moving.body.vz; await delay(100);
      assert.ok(!own.grounded && own.y > 0); assert.ok(Math.abs(moving.body.vz - speed) < 0.3);
      assert.equal(moving.body.jumpUntil, 0); assert.equal(moving.body.groundTime, -1e9);
      await until(() => own.grounded, "landing"); await delay(250);
      assert.ok(Math.abs(moving.body.z - own.z) < 0.2);
    } finally { moving.stop(); }
  });
});
