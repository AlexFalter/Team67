import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
const dt = 1 / 60;

test("running accelerates, sprint is faster, and grounded release brakes promptly", () => {
  const p = C.createBody(), move = { ...C.IDLE_INPUT, z: -1 };
  C.stepPlayer(p, move, dt); assert.ok(p.vz < 0 && p.vz > -C.WALK_SPEED / 2);
  for (let i = 0; i < 30; i++) C.stepPlayer(p, move, dt);
  assert.ok(-p.vz > 7 && -p.vz <= C.WALK_SPEED);
  for (let i = 0; i < 30; i++) C.stepPlayer(p, { ...move, sprint: true }, dt);
  assert.ok(-p.vz > 10);
  for (let i = 0; i < 10; i++) C.stepPlayer(p, C.IDLE_INPUT, dt);
  assert.ok(Math.abs(p.vz) < 0.3);
});
test("jump preserves takeoff momentum without input; air steering is controlled", () => {
  const p = C.createBody(); p.vz = -C.SPRINT_SPEED;
  C.stepPlayer(p, { ...C.IDLE_INPUT, z: -1, sprint: true, jump: true }, dt);
  C.stepPlayer(p, C.IDLE_INPUT, dt); assert.equal(p.vz, -C.SPRINT_SPEED);
  C.stepPlayer(p, { ...C.IDLE_INPUT, x: 1 }, dt);
  assert.ok(p.vx > 0 && p.vx < 1); assert.ok(p.vz < -10);
});
test("coyote jump allows a late edge press, but expires and cannot double jump", () => {
  const p = C.createBody(); p.x = C.PLANE_SIZE / 2 + 0.1;
  C.stepPlayer(p, C.IDLE_INPUT, dt); assert.equal(p.grounded, false);
  C.stepPlayer(p, { ...C.IDLE_INPUT, jump: true }, dt); assert.ok(p.vy > 0);
  const vy = p.vy;
  C.stepPlayer(p, { ...C.IDLE_INPUT, jump: true }, dt); assert.ok(p.vy < vy);
  const late = C.createBody(); late.x = p.x;
  for (let i = 0; i < 8; i++) C.stepPlayer(late, C.IDLE_INPUT, dt);
  C.stepPlayer(late, { ...C.IDLE_INPUT, jump: true }, dt); assert.ok(late.vy < 0);
});
test("a press just before landing is buffered; knockdown clears it and disables coyote jumps", () => {
  const p = C.createBody(); p.y = 0.03; p.vy = -3; p.grounded = false; p.groundTime = -1e9;
  C.stepPlayer(p, { ...C.IDLE_INPUT, jump: true }, dt); assert.ok(p.grounded);
  C.stepPlayer(p, C.IDLE_INPUT, dt); assert.ok(p.vy > 0 && !p.grounded);
  C.applyImpulse(p, { from: "hit", ix: 0, iy: 2, iz: 0, knockdown: true }, p.simTime);
  C.stepPlayer(p, { ...C.IDLE_INPUT, jump: true }, dt);
  assert.equal(p.jumpUntil, 0); assert.equal(p.groundTime, -1e9);
});
test("parkour jump grace state is deterministic across replay", () => {
  const a = C.createBody(), b = C.createBody(); a.x = b.x = 30.1;
  for (let i = 0; i < 30; i++) {
    const input = { ...C.IDLE_INPUT, z: -1, jump: i === 2 };
    C.stepPlayer(a, input, dt); C.stepPlayer(b, input, dt);
  }
  assert.deepEqual(a, b); assert.ok(Number.isFinite(a.groundTime));
});

test("sprint jump effects latch takeoff intent through flight and clear on landing or impact", () => {
  const p = C.createBody(); p.vz = 11;
  C.stepPlayer(p, { ...C.IDLE_INPUT, sprint: true, jump: true, z: 1 }, dt);
  assert.equal(p.sprintJump, true);
  C.stepPlayer(p, C.IDLE_INPUT, dt); assert.equal(p.sprintJump, true, "releasing Shift mid-flight does not erase the sprint jump");
  for (let i = 0; i < 60; i++) C.stepPlayer(p, C.IDLE_INPUT, dt);
  assert.equal(p.sprintJump, false);
  const walking = C.createBody(); walking.vz = 7.5;
  C.stepPlayer(walking, { ...C.IDLE_INPUT, jump: true, z: 1 }, dt); assert.equal(walking.sprintJump, false);
  C.applyImpulse(p, { from: "hit", ix: 0, iy: 2, iz: 0, knockdown: false }, p.simTime);
  assert.equal(p.sprintJump, false);
});

test("turns and reversals carry momentum for a few frames but respond promptly", () => {
  const p = C.createBody(); p.vz = 11;
  C.stepPlayer(p, { ...C.IDLE_INPUT, x: 1, sprint: true }, dt);
  assert.ok(p.vx > 0 && p.vz > 9, "first turning frame retains old direction");
  for (let i = 0; i < 15; i++) C.stepPlayer(p, { ...C.IDLE_INPUT, x: 1, sprint: true }, dt);
  assert.ok(p.vx > 10 && p.vz < 1.1, "turn settles within a quarter second");
  const reverse = C.createBody(); reverse.vz = 11;
  C.stepPlayer(reverse, { ...C.IDLE_INPUT, z: -1, sprint: true }, dt);
  assert.ok(reverse.vz > 8, "reversal brakes before changing direction");
  for (let i = 0; i < 9; i++) C.stepPlayer(reverse, { ...C.IDLE_INPUT, z: -1, sprint: true }, dt);
  assert.ok(reverse.vz < 0, "reverse responds within 170 ms");
});

test("releasing sprint and airborne steering retain momentum without generating unlimited speed", () => {
  const p = C.createBody(); p.vz = 11;
  C.stepPlayer(p, { ...C.IDLE_INPUT, z: 1 }, dt);
  assert.ok(p.vz > 10 && p.vz < 11, "sprint speed tapers toward walk speed");
  const air = C.createBody(); air.vz = 11;
  C.stepPlayer(air, { ...C.IDLE_INPUT, jump: true }, dt);
  assert.equal(air.vz, 11, "jump at release keeps the launch velocity");
  const open: C.MovementWorld = { ...C.flatWorld, name: "zurich", height: () => undefined, spawn: { x: 0, y: -1000, z: 0 } };
  for (let i = 0; i < 180; i++) {
    const angle = i * 0.2;
    C.stepPlayer(air, { ...C.IDLE_INPUT, x: Math.sin(angle), z: Math.cos(angle) }, dt, open);
    assert.ok(Math.hypot(air.vx, air.vz) <= 11 + 1e-8, "air strafing never adds speed above the launch cap");
  }
});

test("force integration keeps similar movement and stopping distances at 30, 60 and 120 Hz", () => {
  const results = [30, 60, 120].map(hz => {
    const p = C.createBody();
    for (let i = 0; i < hz / 2; i++) C.stepPlayer(p, { ...C.IDLE_INPUT, z: 1, sprint: true }, 1 / hz);
    const cruise = p.z;
    for (let i = 0; i < hz / 2; i++) C.stepPlayer(p, C.IDLE_INPUT, 1 / hz);
    assert.equal(p.vz, 0, "braking reaches a finite stop");
    return { cruise, stop: p.z };
  });
  assert.ok(Math.max(...results.map(r => r.cruise)) - Math.min(...results.map(r => r.cruise)) < 0.16);
  assert.ok(Math.max(...results.map(r => r.stop)) - Math.min(...results.map(r => r.stop)) < 0.08);
});
