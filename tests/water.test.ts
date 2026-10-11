import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

const world = C.zurichWorld;

test("the Limmat at water level drowns, a bridge deck over it does not", () => {
  const river = { x: -285, z: -396 }, y = world.height(river.x, river.z)!;
  assert.ok(C.overWater(river.x, river.z));
  assert.equal(C.inWater(world, river.x, y, river.z), true);
  // Jumping above the surface is not drowning (yet).
  assert.equal(C.inWater(world, river.x, y + 1.5, river.z), false);
  const deck = { x: -157, z: 368 }, deckY = world.height(deck.x, deck.z)!;
  assert.ok(C.overWater(deck.x, deck.z), "the bridge crosses a mapped water body");
  assert.equal(C.inWater(world, deck.x, deckY, deck.z), false);
});

test("spawn, carts, stops and the shuttle route are dry", () => {
  for (const p of [world.spawn, ...world.carts, ...world.stops, ...world.route])
    assert.equal(C.inWater(world, p.x, p.y, p.z), false, JSON.stringify(p));
});

test("the flat test world has no water", () => {
  assert.equal(C.inWater(C.flatWorld, 0, 0, 0), false);
});
