import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene, PerspectiveCamera, Vector3 } from "three";
import { SpeedParticles } from "../apps/client/src/multiplayer/effects.ts";
import { createBody, LIME_KIND, LIME_SPEED, LIME_BOOST_SPEED } from "../packages/shared/src/index.ts";

test("speed particles flash at the view edges, clear instantly when stopped or switching views, and dispose", () => {
  const scene = new Scene(), camera = new PerspectiveCamera(82, 16 / 9, 0.05, 100), effect = new SpeedParticles(scene), p = createBody();
  effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  p.vz = 11; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "ordinary sprint has no streaks");
  p.grounded = false; p.anim = 2;
  effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "ordinary jumps and falls have no streaks");
  p.sprintJump = true; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "sprint jumps also have no first-person streaks");
  p.grounded = true; p.anim = 1; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false, "landing removes streaks");
  p.sprintJump = false; p.anim = 4; p.vz = 5; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, true, "slides retain streaks as they slow");
  effect.mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const position = effect.mesh.geometry.attributes.position;
  for (let i = 0; i < effect.mesh.geometry.drawRange.count; i++) {
    const v = new Vector3().fromBufferAttribute(position, i).project(camera);
    assert.ok(Math.abs(v.x) > 0.65 && Math.abs(v.x) < 1, "streaks leave centre clear");
    assert.ok(Math.abs(v.y) < 1 && v.z < 1);
  }
  effect.update(p, camera, 1 / 60, false); assert.equal(effect.mesh.visible, false);
  p.vehicleId = "bike"; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  p.vehicleId = ""; p.anim = 3; effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  effect.dispose(); assert.equal(scene.children.length, 0);
});


test("bike and Lime streaks follow third-person cameras and boost grows the Lime effect", () => {
  const scene = new Scene(), camera = new PerspectiveCamera(75, 16 / 9), effect = new SpeedParticles(scene), p = createBody();
  camera.position.set(3, 4, -6); camera.lookAt(0, 1, 0);
  p.vehicleId = "riding"; p.vz = LIME_SPEED;
  for (const kind of [2, LIME_KIND]) {
    p.vehicleKind = kind; effect.update(p, camera, 1 / 60, true);
    assert.equal(effect.mesh.visible, true);
    assert.ok(effect.mesh.position.equals(camera.position));
    assert.ok(effect.mesh.quaternion.equals(camera.quaternion));
  }
  assert.equal(effect.sparks.visible, false, "cruising has no boost sparks");
  const normalCount = effect.mesh.geometry.drawRange.count;
  const normalOpacity = (effect.mesh.material as import("three").LineBasicMaterial).opacity;
  p.vz = LIME_BOOST_SPEED; effect.update(p, camera, 1 / 60, true);
  assert.equal(effect.mesh.geometry.drawRange.count, normalCount * 2);
  assert.ok((effect.mesh.material as import("three").LineBasicMaterial).opacity > normalOpacity);
  assert.equal(effect.sparks.visible, true);
  assert.ok(effect.sparks.position.equals(camera.position));
  assert.ok(effect.sparks.quaternion.equals(camera.quaternion));
  assert.equal(effect.sparks.geometry.attributes.position.count, 20, "small bounded spark budget");
  assert.ok(effect.sparks.material.uniforms.strength.value > 0);
  const before = [...effect.sparks.geometry.attributes.position.array];
  effect.update(p, camera, 1 / 60, true);
  assert.notDeepEqual([...effect.sparks.geometry.attributes.position.array], before, "sparks move during boost");
  p.vz = 0; effect.update(p, camera, 1 / 60, true); assert.equal(effect.sparks.visible, false); assert.equal(effect.mesh.visible, false);
  p.vz = LIME_BOOST_SPEED; p.knockdownUntil = 1000;
  effect.update(p, camera, 1 / 60, true); assert.equal(effect.mesh.visible, false);
  effect.dispose(); assert.equal(scene.children.length, 0, "all boost effects are disposed");
});
