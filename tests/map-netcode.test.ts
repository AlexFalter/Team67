import { test } from "node:test";
import assert from "node:assert/strict";
import { Predict } from "@colyseus/sdk";
import * as C from "../packages/shared/src/index.ts";
import { withServer, until, delay } from "./fixture.ts";
import { ContactWorld } from "../apps/server/src/physics.ts";
import { Vehicle } from "../apps/server/src/state.ts";

test("Rapier loose objects stay on Zürich terrain in original map coordinates", async () => {
  const world = C.zurichWorld, physics = await ContactWorld.create(world);
  try {
    const p = C.findGround(world, world.spawn.x + 10, world.spawn.z - 5)!;
    const ball = new Vehicle({ ...C.createVehicle(4, p.x, p.z), y: p.y });
    const vehicles = new Map([["ball", ball]]);
    for (let i = 0; i < 180; i++) physics.sync(new Map(), vehicles);
    assert.ok(Math.abs(ball.y - world.height(ball.x, ball.z)!) < 0.15);
    assert.ok(ball.x < -100, "not clamped or teleported to the old flat plane");
  } finally { physics.dispose(); }
});

test("real Zürich clients predict terrain movement, jump, shoes and peel landing without flattening the map", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("race"); rooms.push(a);
    const b = await client.joinById(a.roomId); rooms.push(b);
    a.onMessage("bump", () => {}); b.onMessage("bump", () => {});
    await until(() => a.state?.players?.size === 2 && b.state?.players?.size === 2, "map room");
    const own = a.state.players.get(a.sessionId)!;
    assert.ok(own.x < -100 && own.y > 0);
    const predicted = Predict.get(a), input = a.input({ type: C.MoveInput });
    const reconciler = predicted.reconciler(own, { input, step: (ctx, p, cmd) => C.stepPlayer(p, cmd, ctx.dt, C.zurichWorld), smoothMs: 80 });
    const start = own.x;
    let shoes = false, jumping = false;
    try {
      for (let frame = 0; frame < 60; frame++) {
        const ticks = predicted.tick(performance.now());
        for (let i = 0; i < ticks; i++) {
          Object.assign(input.data, C.IDLE_INPUT, { x: frame < 30 ? 1 : 0 });
          input.data.toggleShoes = !shoes; shoes = true;
          input.data.jump = frame >= 20 && !jumping; jumping ||= input.data.jump;
          input.send();
        }
        assert.ok(Number.isFinite(reconciler.state.y));
        await delay(17);
      }
      await until(() => own.grounded && own.shoes, "landed with shoes");
      assert.ok(own.x > start + 1);
      assert.ok(Math.abs(own.y - C.zurichWorld.height(own.x, own.z)!) < 0.03);
      Object.assign(input.data, C.IDLE_INPUT, { banana: true, throwBanana: true });
      input.send();
      await until(() => b.state.peels.size > 0, "replicated peel");
      await delay(650);
      const peel = [...b.state.peels.values()][0];
      assert.ok(Math.abs(peel.y - C.zurichWorld.height(peel.x, peel.z)!) < 0.03);
      for (const v of b.state.vehicles.values()) assert.ok(v.x < -100 && Number.isFinite(v.y));
    } finally { predicted.dispose(); }
  }, "zurich");
});
