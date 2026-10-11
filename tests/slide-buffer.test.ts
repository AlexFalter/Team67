import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";

const sprint = { ...C.IDLE_INPUT, z: 1, sprint: true };
function airborne() {
  return Object.assign(C.createBody(), { y: 0.25, vy: -2, vz: C.SPRINT_SPEED, grounded: false, anim: 2, groundTime: -1000 });
}
test("an airborne slide press starts on the exact landing frame and consumes its buffer", () => {
  const p = airborne();
  C.stepMovement(p, { ...sprint, slide: true }, 1 / 60, 1000);
  assert.equal(p.anim, 2);
  let landedAt = 0;
  for (let now = 1017; now < 1600; now += 17) {
    C.stepMovement(p, sprint, 1 / 60, now);
    if (p.grounded) { landedAt = now; break; }
  }
  assert.ok(landedAt);
  assert.equal(p.anim, C.SLIDE_ANIM);
  assert.equal(p.slideUntil, landedAt + C.SLIDE_DURATION_MS);
  assert.equal(p.slideBufferedUntil, 0);
});
test("released sprint, expired input, cooldown and knockdown prevent a queued landing slide", () => {
  for (const reason of ["release", "expiry", "cooldown", "hit"]) {
    const p = airborne();
    C.stepMovement(p, { ...sprint, slide: true }, 1 / 60, 1000);
    if (reason === "cooldown") p.slideReadyAt = 10000;
    if (reason === "hit") C.applyImpulse(p, { from: "test", ix: 0, iy: 0, iz: 1, knockdown: true, durationMs: 1500 }, 1010);
    for (let now = 1017; now < 1400; now += 17)
      C.stepMovement(p, { ...sprint, sprint: reason !== "release" }, 1 / 60, reason === "expiry" ? now + C.SLIDE_BUFFER_MS : now);
    assert.notEqual(p.anim, C.SLIDE_ANIM, reason);
    assert.ok((p.slideUntil ?? 0) <= 1000, reason);
  }
});
test("bike prediction keeps the shared rider seat height above terrain", () => {
  const p = Object.assign(C.createBody(), { vehicleId: "bike", vehicleKind: 2, seat: 0, y: C.BIKE_SEAT_HEIGHT });
  for (let i = 0; i < 120; i++) C.stepPlayer(p, sprint, 1 / 60);
  assert.equal(p.y, C.BIKE_SEAT_HEIGHT);
  assert.ok(p.vz > 12 && p.vz <= C.BIKE_SPEED);
});

test("first-person speed streaks show on a moving bike, and stop when slow or knocked down", async () => {
  const { Scene, PerspectiveCamera } = await import("three");
  const { SpeedParticles } = await import("../apps/client/src/multiplayer/effects.ts");
  const effect = new SpeedParticles(new Scene()), camera = new PerspectiveCamera(82, 16 / 9, .05, 100);
  const p = Object.assign(C.createBody(), { vehicleId: "bike", vehicleKind: 2, vz: 15 });
  effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, true);
  p.vz = 0; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  p.vz = 15; p.knockdownUntil = 1000; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  p.knockdownUntil = 0; p.vehicleKind = 0; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  effect.dispose();
});
