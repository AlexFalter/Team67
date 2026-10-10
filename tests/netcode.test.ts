import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, createServer, type Socket } from "node:net";
import { Client, Predict } from "@colyseus/sdk";
import * as C from "../packages/shared/src/index.ts";
import { withServer, listen, until, delay, type WireState } from "./fixture.ts";

test("native prediction stays responsive and reconciles collisions under 160ms latency", { timeout: 20000 }, async () => {
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
    let predict: Predict | undefined, timer: ReturnType<typeof setInterval> | undefined;
    let leave: (() => Promise<unknown>) | undefined;
    try {
      const proxyPort = await listen(proxy);
      const room = await new Client(`ws://127.0.0.1:${proxyPort}`).create<WireState>("race");
      rooms.push(room);
      let collisions = 0;
      room.onMessage("bump", () => collisions++);
      leave = () => room.leave();
      const target = await client.joinById<WireState>(room.roomId);
      rooms.push(target); target.onMessage("bump", () => {});
      await until(() => !!room.state?.players?.get(room.sessionId), "initial state");
      const own = room.state.players.get(room.sessionId)!, initial = own.x;
      predict = Predict.get(room);
      const input = room.input({ type: C.MoveInput });
      const me = predict.reconciler(own, { input, smoothMs: 80, step: (ctx, p, cmd) => C.stepPlayer(p, cmd, ctx.dt) });
      let moving = true, immediate = false, previous = initial, largestStep = 0;
      timer = setInterval(() => {
        const n = predict!.tick(performance.now());
        for (let i = 0; i < n; i++) {
          input.data.x = moving ? 1 : 0; input.data.sprint = true; input.send();
          if (me.state.x > initial && own.x === initial) immediate = true;
        }
        const rendered = predict!.value(own, "x");
        largestStep = Math.max(largestStep, Math.abs(rendered - previous)); previous = rendered;
      }, 16);
      await delay(1600); moving = false;
      assert.ok(immediate, "local movement is predicted before a server reply");
      const other = room.state.players.get(target.sessionId)!;
      assert.ok(other.x > -2, "blocking collision moves the target, rather than letting capsules pass through");
      assert.equal(other.knockdownUntil, 0, "contact does not knock down");
      assert.equal(collisions, 0, "only damaging impacts produce effects");
      await delay(800);
      assert.ok(room.clock.rtt() >= 140, "latency proxy actually delays packets");
      assert.ok(largestStep < 0.65, `smooth frame delta ${largestStep}`);
      assert.ok(Math.abs(me.state.x - own.x) < 0.2, "prediction converges to authoritative state");
      assert.ok(input.lastProcessed > 40, "fixed inputs are acknowledged");
    } finally {
      if (timer) clearInterval(timer); predict?.dispose();
      await leave?.();
      pending.forEach(clearTimeout); sockets.forEach(s => s.destroy());
      await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  });
});

test("real clients share shoes, cone hits, knockdown recovery and thrown-peel slips", { timeout: 20000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race"), b = await client.joinById<WireState>(a.roomId);
    rooms.push(a, b);
    for (const room of rooms) room.onMessage("bump", () => {});
    await until(() => a.state?.players?.size === 2, "two players");
    const input = a.input({ type: C.MoveInput });
    const timer = setInterval(() => input.send(), 1000 / input.tickRate!);
    try {
      input.data.toggleShoes = true; input.send(); input.data.toggleShoes = false;
      await until(() => b.state.players.get(a.sessionId)!.shoes, "remote shoes equipped");
      input.data.x = 1; await delay(70); input.data.x = 0;
      input.data.hit = true; input.send(); input.data.hit = false;
      await until(() => b.state.players.get(b.sessionId)!.knockdownUntil - b.state.players.get(b.sessionId)!.simTime > 4500,
        "five-second authoritative melee hit");
      const deadline = b.state.players.get(b.sessionId)!.knockdownUntil;
      input.data.hit = true; input.send(); input.data.hit = false;
      await delay(100);
      assert.equal(b.state.players.get(b.sessionId)!.knockdownUntil, deadline, "cooldown prevents another knockdown");
      await until(() => b.state.players.get(b.sessionId)!.simTime >= deadline, "recovery", 6500);
    } finally { clearInterval(timer); }
    const c = await client.create<WireState>("race"); rooms.push(c); c.onMessage("bump", () => {});
    await until(() => !!c.state?.players?.get(c.sessionId), "peel player");
    const peelInput = c.input({ type: C.MoveInput });
    peelInput.data.banana = peelInput.data.throwBanana = true; peelInput.send();
    peelInput.data.banana = peelInput.data.throwBanana = false;
    const peelTimer = setInterval(() => peelInput.send(), 1000 / peelInput.tickRate!);
    try {
      await until(() => c.state.peels.size === 1, "thrown peel replicated");
      await delay(1050); peelInput.data.z = 1;
      await until(() => c.state.players.get(c.sessionId)!.knockdownUntil > c.state.players.get(c.sessionId)!.simTime,
        "grounded player slips on peel");
      assert.equal(c.state.peels.size, 0, "slip consumes shared peel");
    } finally { clearInterval(peelTimer); }
  });
});

test("real client bike impact ejects its rider and replicates the fallen bike", { timeout: 15000 }, async () => {
  await withServer(async (client, rooms) => {
    const room = await client.create<WireState>("race", { character: 2 }); rooms.push(room);
    room.onMessage("bump", () => {}); room.onMessage("vehicleResult", () => {});
    await until(() => !!room.state?.players?.get(room.sessionId), "rider initial state");
    const p = () => room.state.players.get(room.sessionId)!;
    const input = room.input({ type: C.MoveInput }), timer = setInterval(() => input.send(), 1000 / input.tickRate!);
    try {
      input.data.z = 1;
      await until(() => p().z > 1.5, "walk within boarding range");
      input.data.z = 0; room.send("vehicleEnter", "bike-2");
      await until(() => p().vehicleId === "bike-2", "board bicycle");
      input.data.x = -0.45; input.data.z = -0.9;
      await until(() => room.state.vehicles.get("bike-2")!.fallenUntil > room.state.serverTime, "hit parked car");
      assert.equal(p().vehicleId, ""); assert.equal(room.state.vehicles.get("bike-2")!.driver, "");
      assert.ok(p().knockdownUntil > p().simTime, "rider receives authoritative knockdown");
    } finally { clearInterval(timer); }
  });
});

test("stationary first-person aim is replicated and used for melee hits", { timeout: 10000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race"), b = await client.joinById<WireState>(a.roomId); rooms.push(a, b);
    rooms.forEach(room => room.onMessage("bump", () => {}));
    await until(() => a.state?.players?.size === 2, "two players");
    await delay(100); // Allow the spawn's overlap with the nearby parked cart to settle.
    const startX = a.state.players.get(a.sessionId)!.x;
    const input = a.input({ type: C.MoveInput });
    input.data.aim = true; input.data.facing = Math.PI / 2; input.data.hit = true; input.send();
    await until(() => b.state.players.get(b.sessionId)!.knockdownUntil > 0, "look-directed hit without movement");
    assert.ok(Math.abs(b.state.players.get(a.sessionId)!.rotY - Math.PI / 2) < 0.0001);
    assert.equal(b.state.players.get(a.sessionId)!.x, startX);
  });
});

test("native prediction shares running, airborne momentum and jump-grace state with the server", { timeout: 10000 }, async () => {
  await withServer(async (client, rooms) => {
    const room = await client.create<WireState>("race"); rooms.push(room); room.onMessage("bump", () => {});
    await until(() => !!room.state?.players?.get(room.sessionId), "initial state");
    const own = room.state.players.get(room.sessionId)!, predict = Predict.get(room);
    const input = room.input({ type: C.MoveInput });
    const me = predict.reconciler(own, { input, step: (ctx, p, cmd) => C.stepPlayer(p, cmd, ctx.dt), smoothMs: 80 });
    let moving = true, jump = false;
    const timer = setInterval(() => {
      for (let i = 0, n = predict.tick(performance.now()); i < n; i++) {
        input.data.z = moving ? -1 : 0; input.data.sprint = true; input.data.jump = jump;
        input.send(); jump = false;
      }
    }, 16);
    try {
      await until(() => own.vz < -10, "run up to sprint speed"); jump = true;
      await until(() => !me.state.grounded && me.state.vy > 0, "predicted takeoff"); moving = false;
      const takeoffSpeed = me.state.vz;
      await delay(100);
      assert.ok(!own.grounded && own.y > 0, "server replicates the same jump");
      assert.ok(Math.abs(me.state.vz - takeoffSpeed) < 0.3, "releasing W does not brake in the air");
      assert.equal(own.jumpUntil, 0); assert.equal(own.groundTime, -1e9);
      await until(() => own.grounded, "land"); await delay(200);
      assert.ok(own.groundTime > 0 && Number.isFinite(me.state.groundTime));
      assert.ok(Math.abs(me.state.z - own.z) < 0.2, "predicted landing converges");
    } finally { clearInterval(timer); predict.dispose(); }
  });
});
