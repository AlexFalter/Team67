import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBody,
  createContact,
  capsuleContact,
  stepMovement,
  applyImpulse,
} from "../packages/shared/src/index.ts";
test("capsule segment gap and coincident fallback", () => {
  const a = createBody(),
    b = createBody(),
    out = createContact();
  assert.ok(capsuleContact(a, b, out));
  assert.equal(out.nx, 1);
  b.y = 1.81;
  assert.equal(capsuleContact(a, b, out), false);
});
test("upward impulse survives ground integration; knockdown blocks input", () => {
  const p = createBody();
  applyImpulse(p, { from: "test", ix: 0, iy: 9, iz: 0, knockdown: true }, 0);
  stepMovement(p, { x: 1, z: 0, sprint: true, jump: false }, 1 / 60, 10);
  assert.ok(p.y > 0);
  assert.equal(p.grounded, false);
  assert.equal(p.vx, 0);
  assert.equal(p.anim, 3);
});
test("walking off the plane falls and respawns", () => {
  const p = createBody();
  p.x = 31;
  for (let i = 0; i < 120; i++)
    stepMovement(
      p,
      { x: 0, z: 0, sprint: false, jump: false },
      1 / 60,
      (i * 1000) / 60,
    );
  assert.ok(Math.abs(p.x) <= 4);
  assert.equal(p.y, 0);
});
