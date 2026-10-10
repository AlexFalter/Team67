import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

// Hand-drawn edit areas (apps/client/assets-src/zurich/edit-areas.json): ramps players must walk up smoothly.
function walk(from: { x: number; z: number }, to: { x: number; z: number }, seconds: number) {
  const body = C.createBody();
  body.x = from.x; body.z = from.z; body.y = C.zurichWorld.height(from.x, from.z)!;
  let closest = Infinity, biggestStep = 0, prevY = body.y;
  for (let t = 0; t < seconds * 60; t++) {
    const dx = to.x - body.x, dz = to.z - body.z, len = Math.hypot(dx, dz) || 1;
    C.stepPlayer(body, { ...C.IDLE_INPUT, x: dx / len, z: dz / len }, 1 / 60, C.zurichWorld);
    if (body.grounded) biggestStep = Math.max(biggestStep, Math.abs(body.y - prevY));
    prevY = body.y;
    closest = Math.min(closest, Math.hypot(body.x - to.x, body.z - to.z));
  }
  return { body, closest, biggestStep };
}

for (const [name, from, to, rise] of [
  ["area 2: footpath under the Polybahn bridge", { x: 57.2, z: 89.5 }, { x: 75.8, z: 133.5 }, 7],
  ["area 3: Polyterrasse ramp", { x: 201.0, z: 63.5 }, { x: 205.0, z: 79.0 }, 1.8],
  ["area 5: corridor between the lower and upper street", { x: -27.5, z: -147.5 }, { x: -1.0, z: -148.8 }, 8],
] as const) {
  // area 2 passes under the Polybahn bridge; main's walkable Polybahn track (transit.ts passageFloor) currently
  // overrides the ground height there regardless of the player's level, so the walk gets stuck. Needs a
  // level-aware height (floor below the feet) in world.ts.
  test(`${name} walks up from street to street`, { todo: name.startsWith("area 2") ? "blocked by passageFloor under the Polybahn bridge" : undefined }, () => {
    const y0 = C.zurichWorld.height(from.x, from.z)!;
    const { body, closest, biggestStep } = walk(from, to, 12);
    assert.ok(closest < 1.5, `reached the top (closest ${closest.toFixed(2)} m)`);
    assert.ok(body.y - y0 > rise, `climbed ${(body.y - y0).toFixed(2)} m`);
    assert.ok(biggestStep < 0.25, `no steps on the way (largest per-frame change ${biggestStep.toFixed(3)} m)`);
  });
}
