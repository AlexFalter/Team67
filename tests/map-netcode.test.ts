import { test } from "node:test";
import assert from "node:assert/strict";
import { reportClient } from "./reportClient.ts";
import * as C from "../packages/shared/src/index.ts";
import { startRound, withServer, until, delay } from "./fixture.ts";
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

test("real Zurich reports preserve terrain, jumping and original coordinates", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("race", { name: "Player" }); rooms.push(a);
    const b = await client.joinById(a.roomId, { name: "Player" }); rooms.push(b);
    a.onMessage("bump", () => {}); b.onMessage("bump", () => {});
    b.onMessage("playerCorrection", () => {}); b.onMessage("impulse", () => {});
    await until(() => a.state?.players?.size === 2 && b.state?.players?.size === 2, "map room");
    await startRound(a, [a, b]);
    const own = a.state.players.get(a.sessionId)!;
    assert.ok(own.x < -100 && own.y > 0);
    const moving = reportClient(a, C.zurichWorld), start = { x: own.x, z: own.z };
    // Spawn is randomized: choose a clear path instead of assuming east is free.
    const directions = Array.from({ length: 16 }, (_, i) => ({ x: Math.sin(i * Math.PI / 8), z: Math.cos(i * Math.PI / 8) }));
    const direction = directions.find(d => Array.from({ length: 24 }, (_, i) => (i + 1) / 4).every(distance => {
      const x = start.x + d.x * distance, z = start.z + d.z * distance, y = C.zurichWorld.height(x, z);
      return y !== undefined && !C.zurichWorld.blocked(x, y, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT) &&
        [...a.state.vehicles.values()].every(v => Math.hypot(x - v.x, z - v.z) > C.vehicleRadius(v) + C.CAPSULE_RADIUS + 0.3);
    }));
    assert.ok(direction, "clear movement path near spawn");
    try {
      moving.input.x = direction.x; moving.input.z = direction.z;
      await delay(250); moving.input.jump = true;
      await until(() => !own.grounded && own.vy > 0, "map takeoff");
      await delay(150); moving.input.x = moving.input.z = 0;
      // The server admits grounded reports within 10 cm; wait for the actual
      // terrain landing before checking the stricter foot-height invariant.
      await until(() => own.grounded && Math.abs(own.y - C.zurichWorld.height(own.x, own.z)!) < 0.03, "landed");
      assert.ok(Math.hypot(own.x - start.x, own.z - start.z) > 1, "terrain movement replicated");
      assert.ok(Math.abs(own.y - C.zurichWorld.height(own.x, own.z)!) < 0.03, `map landing y=${own.y}, terrain=${C.zurichWorld.height(own.x, own.z)}`);
      // Main now places scooters at Haldenegg as well as west of the river.
      const bounds = C.zurichWorld.bounds;
      for (const v of b.state.vehicles.values()) assert.ok((C.isRail(v) ||
        v.x >= bounds.minX && v.x <= bounds.maxX && v.z >= bounds.minZ && v.z <= bounds.maxZ) &&
        Number.isFinite(v.y), `vehicle kind=${v.kind} x=${v.x} y=${v.y}`);
    } finally { moving.stop(); }
  }, "zurich");
});
