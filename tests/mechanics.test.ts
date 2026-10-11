import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

test("hit cone enforces facing, range, height, cooldown and short knockdown", () => {
  const a = C.createBody(), b = C.createBody(); b.z = 2;
  assert.ok(C.inHitCone(a, b)); b.z = -1; assert.equal(C.inHitCone(a, b), false);
  b.z = 3; assert.equal(C.inHitCone(a, b), false);
  b.z = 1; b.y = 2; assert.equal(C.inHitCone(a, b), false);
  C.stepPlayer(a, { ...C.IDLE_INPUT, hit: true }, 1 / 30);
  const ready = a.attackReadyAt;
  C.stepPlayer(a, { ...C.IDLE_INPUT, hit: true }, 1 / 30);
  assert.equal(a.attackReadyAt, ready, "cooldown rejects repeated hit inputs");
  b.y = 0;
  C.applyImpulse(b, { from: "a", ix: 4, iy: 0, iz: 0, knockdown: true, durationMs: C.ATTACK_KNOCKDOWN_MS }, b.simTime);
  for (let i = 0; i < Math.floor(C.ATTACK_KNOCKDOWN_MS / (1000 / 30)) - 1; i++) C.stepPlayer(b, { ...C.IDLE_INPUT, z: 1, hit: true }, 1 / 30);
  assert.equal(b.anim, 3); assert.equal(b.attackReadyAt, 0);
  for (let i = 0; i < 3; i++) C.stepPlayer(b, { ...C.IDLE_INPUT, z: 1 }, 1 / 30);
  assert.equal(b.anim, 1);
});
test("house geometry occludes melee hits", () => {
  const h = C.HOUSES[0], a = C.createBody(), b = C.createBody();
  a.x = h.x - h.width / 2 - 0.1; b.x = h.x - h.width / 2 + 1;
  a.z = b.z = h.z; a.rotY = Math.PI / 2;
  assert.equal(C.inHitCone(a, b), false);
});
