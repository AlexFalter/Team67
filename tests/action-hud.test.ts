import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { actionAvailability } from "../apps/client/src/multiplayer/actionHud.ts";

test("punch HUD counts two-second cooldown; slide needs sprint speed and only greys during its cooldown", () => {
  const p = C.createBody(); p.vz = C.SPRINT_SPEED;
  assert.equal(C.ATTACK_COOLDOWN_MS, 2000);
  assert.ok(actionAvailability(p, true, 1000).punch);
  assert.ok(actionAvailability(p, true, 1000).slide);
  p.attackReadyAt = 3000; p.slideReadyAt = 1200;
  assert.deepEqual(actionAvailability(p, true, 1000), { punch: false, slide: false, punchSeconds: 2, slideSeconds: 0 });
  assert.equal(actionAvailability(p, true, 2001).punchSeconds, 1);
  assert.ok(actionAvailability(p, true, 3000).punch);
  assert.ok(actionAvailability(p, true, 1200).slide);
  assert.equal(actionAvailability(p, false, 5000).slide, false);
  p.grounded = false; assert.equal(actionAvailability(p, true, 5000).slide, true);
  p.grounded = true; p.jumpSprintLocked = true; assert.equal(actionAvailability(p, true, 5000).slide, false);
});

test("knockdown shows its remaining time over both unavailable actions; riding disables both", () => {
  const p = C.createBody(); p.vz = C.SPRINT_SPEED; p.knockdownUntil = 2700; p.attackReadyAt = 5000;
  assert.deepEqual(actionAvailability(p, true, 1000), { punch: false, slide: false, punchSeconds: 2, slideSeconds: 2 });
  assert.equal(actionAvailability(p, true, 2700).slideSeconds, 0);
  p.vehicleId = "bike";
  assert.equal(actionAvailability(p, true, 6000).punch, false);
  assert.equal(actionAvailability(p, true, 6000).slide, false);
});

test("punch inputs cannot shorten the two-second gameplay cooldown", () => {
  const p = C.createBody(); p.simTime = 1000;
  C.stepPlayer(p, { ...C.IDLE_INPUT, hit: true }, 1 / 60);
  const ready = p.attackReadyAt;
  assert.ok(Math.abs(ready - p.simTime - 2000) < 1e-6);
  p.simTime = ready - 100; C.stepPlayer(p, { ...C.IDLE_INPUT, hit: true }, 1 / 60);
  assert.equal(p.attackReadyAt, ready);
  p.simTime = ready; C.stepPlayer(p, { ...C.IDLE_INPUT, hit: true }, 1 / 60);
  assert.ok(p.attackReadyAt > ready);
});
