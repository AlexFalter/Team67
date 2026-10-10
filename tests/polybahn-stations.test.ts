import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

// Both Polybahn halls sit on 0.5 m detail patches (walk_grid.py): their thin, rotated walls and 3.6 m
// doors do not fit the 2 m map grid. A player must walk in from the street without getting stuck.
function walk(from: { x: number; z: number }, to: { x: number; z: number }, seconds: number) {
  const body = C.createBody();
  body.x = from.x; body.z = from.z;
  body.y = C.zurichWorld.height(from.x, from.z)!;
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
  const input = { ...C.IDLE_INPUT, x: dx / len, z: dz / len };
  let closest = Infinity;
  for (let t = 0; t < seconds * 60; t++) {
    C.stepPlayer(body, input, 1 / 60, C.zurichWorld);
    closest = Math.min(closest, Math.hypot(body.x - to.x, body.z - to.z));
  }
  return { body, closest };
}

test("bottom Polybahn hall is enterable across the whole width of its street door", () => {
  for (const z of [111, 112, 113, 114, 115]) {  // single 5.6 m doorway (no centre pillar)
    assert.ok(C.zurichWorld.height(5, z) !== undefined, "street in front of the door");
    const { body, closest } = walk({ x: 5, z }, { x: 16, z }, 4);
    assert.ok(closest < 1.5, `z ${z}: reached the hall interior (closest ${closest.toFixed(2)} m)`);
    assert.ok(!C.zurichWorld.blocked(body.x, body.y, body.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT));
  }
});

test("top Polybahn hall is enterable from the Polyterrasse side", () => {
  for (const z of [67, 69, 71]) {
    const { body, closest } = walk({ x: 195, z }, { x: 182, z: 74 }, 4);
    assert.ok(closest < 1.5, `z ${z}: reached the hall interior (closest ${closest.toFixed(2)} m)`);
    assert.ok(!C.zurichWorld.blocked(body.x, body.y, body.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT));
  }
});

test("hall walls still block: no walking through the side wall of the bottom hall", () => {
  // from the street north of the hall straight south into its wall
  const { body } = walk({ x: 22, z: 100 }, { x: 22, z: 112 }, 3);
  assert.ok(body.z < 106, `stopped at the wall (z ${body.z.toFixed(2)})`);
});
