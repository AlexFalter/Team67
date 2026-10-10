import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

const flat = C.flatWorld(400);
const run = (b: C.Body, input: Partial<C.Input>, ticks: number, world: C.World = flat) => {
  const i = { ...C.createInput(), ...input };
  for (let t = 0; t < ticks; t++) C.step(b, i, C.DT, world);
  return b;
};
const speed = (b: C.Body) => Math.hypot(b.vx, b.vz);

test("step is deterministic", () => {
  const a = C.createBody(), b = C.createBody();
  for (let t = 0; t < 600; t++) {
    const input = { ...C.createInput(), forward: 1, right: Math.sin(t / 30), yaw: t * 0.01, jump: t % 50 < 3, sprint: t > 200 };
    C.step(a, input, C.DT, flat);
    C.step(b, input, C.DT, flat);
  }
  assert.deepEqual(a, b);
});

test("ground: reaches walk/sprint speed fast and stops fast", () => {
  const b = run(C.createBody(), { forward: 1 }, 10);
  assert.ok(Math.abs(speed(b) - C.WALK_SPEED) < 0.05, `walk after 1/6 s: ${speed(b)}`);
  run(b, { forward: 1, sprint: true }, 30);
  assert.ok(Math.abs(speed(b) - C.SPRINT_SPEED) < 0.05, `sprint ${speed(b)}`);
  run(b, {}, 15);
  assert.equal(speed(b), 0, "stops within 0.25 s");
  // yaw 0 faces -Z
  const f = run(C.createBody(), { forward: 1 }, 30);
  assert.ok(f.z < -1 && Math.abs(f.x) < 1e-9);
});

test("air: holding forward cannot add speed, strafing gains a little, hard cap holds", () => {
  const b = run(C.createBody(), { forward: 1 }, 30);
  const v0 = speed(b);
  run(b, { forward: 1, jump: true }, 1);
  run(b, { forward: 1 }, 20);
  assert.ok(speed(b) <= v0 + 1e-9, "no straight-line air acceleration");
  // Classic strafe: turn the view while holding a side key; speed builds.
  const s = run(C.createBody(), { forward: 1 }, 30);
  let yaw = 0;
  for (let t = 0; t < 400; t++) {
    yaw -= 0.03;
    C.step(s, { forward: 0, right: 1, yaw, jump: true, sprint: false }, C.DT, flat);
  }
  assert.ok(speed(s) > C.WALK_SPEED + 1, `strafe-hop gains speed: ${speed(s)}`);
  assert.ok(speed(s) <= C.MAX_SPEED + 1e-9);
  // From standstill, air control is limited to the cap.
  const still = run(C.createBody(), { jump: true }, 1);
  run(still, { forward: 1 }, 20);
  assert.ok(speed(still) <= C.AIR_WISH_CAP + 1e-9);
});

test("jump: coyote time after walking off a ledge, then not", () => {
  const ledge = { ...flat, height: (x: number, z: number) => (z > -5 ? 2 : Number.isNaN(flat.height(x, z)) ? NaN : 0) };
  const walkOff = () => {
    const b = C.createBody(0, 2, -4);
    b.vz = -C.WALK_SPEED;
    for (let t = 0; t < 30 && b.grounded; t++) C.step(b, { ...C.createInput(), forward: 1 }, C.DT, ledge);
    assert.equal(b.grounded, false);
    return b;
  };
  const late = (ms: number) => {
    const b = walkOff();
    run(b, { forward: 1 }, Math.round(ms / (1000 * C.DT)), ledge);
    run(b, { forward: 1, jump: true }, 1, ledge);
    return b.vy;
  };
  assert.ok(late(50) > C.JUMP_SPEED - 1, "jump 50 ms after leaving the ledge");
  assert.ok(late(150) < 0, "no jump 150 ms after leaving the ledge");
});

test("jump: a press shortly before landing is buffered; an early one is not", () => {
  const fallFor = (pressBeforeLandMs: number) => {
    const b = C.createBody(0, 3, 0);
    b.grounded = false; b.airTime = 1;
    // fall time from 3 m ≈ 0.49 s; press at the given time before touching down
    const fall = Math.sqrt((2 * 3) / -C.GRAVITY), pressAt = Math.round((fall - pressBeforeLandMs / 1000) / C.DT);
    let jumped = false;
    for (let t = 0; t < 60; t++) {
      C.step(b, { ...C.createInput(), jump: t === pressAt }, C.DT, flat);
      if (b.grounded === false && b.vy > 0) jumped = true;
    }
    return jumped;
  };
  assert.equal(fallFor(80), true);
  assert.equal(fallFor(300), false);
});

test("bunny hop: holding jump keeps ground speed between hops", () => {
  const b = run(C.createBody(), { forward: 1, sprint: true }, 60);
  const v0 = speed(b);
  run(b, { forward: 1, sprint: true, jump: true }, 300);
  assert.ok(speed(b) >= v0 - 1e-6, `no friction loss on landing frames: ${speed(b)} vs ${v0}`);
});

test("walls stop and slide; step-ups up to step height; knockdown removes control", () => {
  const boxes = C.flatWorld(100, [{ x: 0, z: -5, w: 60, d: 1, h: 3 }]);
  const b = run(C.createBody(), { forward: 1, right: 0.3 }, 120, boxes);
  assert.ok(b.z >= -4.5 + C.RADIUS - 1e-9, `blocked by wall at z=${b.z}`);
  assert.ok(b.x > 1, "slides along the wall");
  const stairs = { ...flat, height: (x: number, z: number) => (z < -2 ? 0.5 : 0) + 0 * x };
  const s = run(C.createBody(), { forward: 1 }, 60, stairs);
  assert.ok(s.z < -3 && Math.abs(s.y - 0.5) < 1e-9, "stepped up");
  const cliff = { ...flat, height: (x: number, z: number) => (z < -2 ? 2 : 0) + 0 * x };
  const c = run(C.createBody(), { forward: 1 }, 60, cliff);
  assert.ok(c.z > -2, "too high to step");
  const k = C.createBody();
  C.knock(k, 3, 2, 0, 1000);
  run(k, { forward: 1 }, 30);
  assert.ok(k.down > 0 && k.z === 0, "no input while down");
  run(k, {}, 60);
  assert.equal(k.down, 0);
});

test("Zürich grid: spawn is walkable, buildings block, no allocation in the step", () => {
  const w = C.zurichWorld, s = w.spawn;
  assert.ok(Math.abs(w.height(s.x, s.z) - s.y) < 0.05);
  assert.equal(w.blocked(s.x, s.y, s.z, C.RADIUS, C.HEIGHT), false);
  assert.ok(Number.isNaN(w.height(5000, 0)));
  // Run in every direction from spawn; the player must never end up inside a building column.
  for (let a = 0; a < 16; a++) {
    const b = C.createBody(s.x, s.y, s.z);
    run(b, { forward: 1, sprint: true, yaw: (a / 16) * Math.PI * 2, jump: a % 2 === 0 }, 600, w);
    assert.equal(w.blocked(b.x, b.y, b.z, C.RADIUS * 0.9, C.HEIGHT), false, `direction ${a}`);
    assert.ok(b.y >= w.height(b.x, b.z) - 1e-6);
  }
  const b = C.createBody(s.x, s.y, s.z), input = { ...C.createInput(), forward: 1, sprint: true };
  for (let t = 0; t < 50000; t++) { input.yaw = t * 0.001; C.step(b, input, C.DT, w); } // warm up the JIT
  const before = process.memoryUsage().heapUsed;
  for (let t = 0; t < 200000; t++) { input.yaw = t * 0.001; C.step(b, input, C.DT, w); }
  const perStep = (process.memoryUsage().heapUsed - before) / 200000;
  assert.ok(perStep < 16, `step allocates nothing measurable (${perStep.toFixed(1)} B/step)`);
});
