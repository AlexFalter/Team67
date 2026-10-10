import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene, PerspectiveCamera, Vector3 } from "three";
import { SpeedParticles } from "../apps/client/src/multiplayer/effects.ts";
import { createBody } from "../packages/shared/src/index.ts";

test("speed particles flash at the view edges, clear instantly when stopped or switching views, and dispose", () => {
  const scene = new Scene(), camera = new PerspectiveCamera(82, 16 / 9, 0.05, 100), effect = new SpeedParticles(scene), p = createBody();
  effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  p.vz = 11; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "ordinary sprint has no streaks");
  p.grounded = false; p.anim = 2;
  effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "ordinary jumps and falls have no streaks");
  p.sprintJump = true; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, true);
  p.grounded = true; p.anim = 1; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "landing removes streaks");
  p.sprintJump = false; p.anim = 4; p.vz = 5; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, true, "slides retain streaks as they slow");
  effect.mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const position = effect.mesh.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const v = new Vector3().fromBufferAttribute(position, i).project(camera);
    assert.ok(Math.abs(v.x) > 0.65 && Math.abs(v.x) < 1, "streaks leave centre clear");
    assert.ok(Math.abs(v.y) < 1 && v.z < 1);
  }
  effect.update(p, camera, 1 / 60, false); assert.equal(effect.mesh.visible, false);
  p.vehicleId = "bike"; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  p.vehicleId = ""; p.anim = 3; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  effect.dispose(); assert.equal(scene.children.length, 0);
});

test("sprint-jump particles travel upward rather than using radial slide streaks", () => {
  const scene = new Scene(), camera = new PerspectiveCamera(82, 1, 0.05, 100), effect = new SpeedParticles(scene), p = createBody();
  Object.assign(p, { anim: 2, grounded: false, sprintJump: true, vz: 11 });
  effect.update(p, camera, 1 / 60, true);
  const positions = effect.mesh.geometry.attributes.position;
  const start = positions.getY(0);
  for (let i = 0; i < positions.count; i += 2) {
    assert.equal(positions.getX(i), positions.getX(i + 1));
    assert.equal(positions.getZ(i), positions.getZ(i + 1));
    assert.ok(positions.getY(i + 1) > positions.getY(i), "streak points upward");
  }
  effect.update(p, camera, 1 / 60, true);
  assert.ok(positions.getY(0) > start, "particle rises over time");
  effect.dispose();
});
