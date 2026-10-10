import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { reportClient } from "./reportClient.ts";
import { withServer, startRound, until } from "./fixture.ts";
const dt = 1 / 60;
const slide = { ...C.IDLE_INPUT, z: 1, sprint: true, slide: true };

test("slide requires a grounded sprint, carries momentum without steering, expires and has a cooldown", () => {
  for (const overrides of [{} as Partial<C.Body>, { vz: 11, grounded: false }, { vz: 11, knockdownUntil: 5000 }]) {
    const p = Object.assign(C.createBody(), overrides);
    C.stepPlayer(p, slide, dt); assert.notEqual(p.anim, C.SLIDE_ANIM);
  }
  const walking = C.createBody(); walking.vz = 11;
  C.stepPlayer(walking, { ...slide, sprint: false }, dt); assert.notEqual(walking.anim, C.SLIDE_ANIM);
  const p = C.createBody(); p.vz = 11;
  C.stepPlayer(p, slide, dt); assert.equal(p.anim, C.SLIDE_ANIM);
  const started = p.slideUntil!, speed = p.vz;
  for (let i = 0; i < 20; i++) C.stepPlayer(p, { ...slide, x: 1, z: 0 }, dt);
  assert.equal(p.slideUntil, started, "holding the request never extends a slide");
  assert.equal(p.vx, 0, "look/input cannot redirect slide momentum");
  assert.ok(p.vz < speed && p.vz > 7, "controlled drag carries sprint speed");
  for (let i = 0; i < 30; i++) C.stepPlayer(p, slide, dt);
  assert.notEqual(p.anim, C.SLIDE_ANIM, "duration expires despite a repeated request");
  while (p.simTime < p.slideReadyAt!) C.stepPlayer(p, { ...slide, slide: false }, dt);
  C.stepPlayer(p, slide, dt);
  assert.equal(p.anim, C.SLIDE_ANIM, "a later sprint can slide again");
});

test("jump, impact, boarding and walls interrupt sliding; normal collision clearance stays safe", () => {
  const p = C.createBody(); p.vz = 11; C.stepPlayer(p, slide, dt);
  C.stepPlayer(p, { ...C.IDLE_INPUT, jump: true }, dt);
  assert.equal(p.anim, 2); assert.ok(p.vy > 0 && p.vz > 10);
  const hit = C.createBody(); hit.vz = 11; C.stepPlayer(hit, slide, dt);
  C.applyImpulse(hit, { from: "hit", ix: 0, iy: 0, iz: 0, knockdown: true }, hit.simTime);
  C.stepPlayer(hit, slide, dt); assert.equal(hit.anim, 3); assert.equal(hit.slideUntil, 0);
  const rider = C.createBody(); rider.vz = 11; C.stepPlayer(rider, slide, dt);
  rider.vehicleId = "shuttle"; rider.vehicleKind = 1; C.stepPlayer(rider, slide, dt);
  assert.equal(rider.anim, 0); assert.equal(rider.slideUntil, 0);
  let height = 0;
  const wallWorld: C.MovementWorld = { ...C.flatWorld, name: "zurich", blocked: (_x: number, _y: number, z: number, _r: number, h: number) => { height = h; return z > 0.5; } };
  const wall = C.createBody(); wall.vz = 11;
  for (let i = 0; i < 20; i++) C.stepPlayer(wall, i ? C.IDLE_INPUT : slide, dt, wallWorld);
  assert.ok(wall.z <= 0.5); assert.equal(wall.anim, 0); assert.equal(height, C.CAPSULE_HEIGHT);
});

test("slide state replays deterministically and resets on respawn", () => {
  const a = C.createBody(), b = C.createBody(); a.vz = b.vz = 11;
  for (let i = 0; i < 40; i++) {
    const input = i ? C.IDLE_INPUT : slide;
    C.stepPlayer(a, input, dt); C.stepPlayer(b, input, dt);
  }
  assert.deepEqual(a, b); C.respawn(a); assert.equal(a.slideUntil, 0); assert.equal(a.slideReadyAt, 0);
});

test("sprint slide reports reach another live client and recover to a standing animation", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create("race", { name: "Slider" }); rooms.push(a);
    const b = await client.joinById(a.roomId, { name: "Observer" }); rooms.push(b);
    for (const room of rooms) { room.onMessage("bump", () => {}); room.onMessage("impulse", () => {}); room.onMessage("playerCorrection", () => {}); }
    await until(() => b.state?.players?.size === 2, "both players connected");
    await startRound(a, [a, b]);
    const moving = reportClient(a), start = { x: moving.body.x, z: moving.body.z };
    const direction = Array.from({ length: 32 }, (_, i) => ({ x: Math.sin(i * Math.PI / 16), z: Math.cos(i * Math.PI / 16) }))
      .find(d => Array.from({ length: 48 }, (_, i) => (i + 1) / 4).every(distance => {
        const x = start.x + d.x * distance, z = start.z + d.z * distance;
        return C.flatWorld.height(x, z) !== undefined && !C.flatWorld.blocked(x, 0, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT) &&
          (distance < 2 || [...a.state.vehicles.values()].every(v => Math.hypot(x - v.x, z - v.z) > C.vehicleRadius(v) + 1)) &&
          Math.hypot(x - b.state.players.get(b.sessionId)!.x, z - b.state.players.get(b.sessionId)!.z) > 1.3;
      }));
    assert.ok(direction, "clear sprint path");
    try {
      Object.assign(moving.input, direction, { sprint: true });
      await until(() => Math.hypot(moving.body.vx, moving.body.vz) > 10, "sprint accelerated");
      moving.input.slide = true;
      await until(() => b.state.players.get(a.sessionId)?.anim === C.SLIDE_ANIM, "observer sees sliding");
      moving.input.slide = false;
      assert.equal(b.state.players.get(a.sessionId)!.grounded, true);
      moving.input.x = moving.input.z = 0;
      await until(() => b.state.players.get(a.sessionId)?.anim === 0, "observer sees slide end and stop");
    } finally { moving.stop(); }
  });
});
