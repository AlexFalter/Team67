import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

test("shoes equip/unequip and boost speed and jump in the shared prediction step", () => {
  const plain = C.createBody(), shoes = C.createBody();
  C.stepPlayer(shoes, { ...C.IDLE_INPUT, toggleShoes: true }, 1 / 30);
  for (let i = 0; i < 25; i++) {
    const input = { ...C.IDLE_INPUT, x: 1, sprint: true };
    C.stepPlayer(plain, input, 1 / 30); C.stepPlayer(shoes, input, 1 / 30);
  }
  assert.ok(shoes.vx > plain.vx * 1.45);
  C.stepPlayer(plain, { ...C.IDLE_INPUT, jump: true }, 1 / 30);
  C.stepPlayer(shoes, { ...C.IDLE_INPUT, jump: true }, 1 / 30);
  assert.ok(shoes.vy > plain.vy); assert.ok(shoes.y > plain.y);
  C.stepPlayer(shoes, { ...C.IDLE_INPUT, toggleShoes: true }, 1 / 30);
  assert.equal(shoes.shoes, false);
});
