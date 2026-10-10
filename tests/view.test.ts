import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import * as C from "../packages/shared/src/index.ts";
import { PlayerView } from "../apps/client/src/multiplayer/view.ts";
import { keyboardMovement } from "../apps/client/src/multiplayer/localPlayer.ts";
import { edgeTurn } from "../apps/client/src/multiplayer/gameControls.ts";

test("first-person camera stays at eye height, looks freely and clamps vertical rotation", () => {
  const camera = new PerspectiveCamera(75), view = new PlayerView(camera, []), p = C.createBody();
  p.x = 4; p.z = 2; view.update(p, 1 / 60);
  assert.equal(camera.position.x, 4); assert.equal(camera.position.y, 1.6); assert.equal(camera.position.z, 1.85);
  const forward = camera.getWorldDirection(new Vector3()); assert.ok(forward.z < -0.99);
  view.look(200, 10000); assert.equal(view.pitch, -1.45);
  view.update(p, 1 / 60); assert.ok(camera.getWorldDirection(new Vector3()).y < -0.9);
  view.look(0, -20000); assert.equal(view.pitch, 1.45);
});
test("running adds restrained eye bob and speed FOV; bob can be disabled; knockdown blends the eye down", () => {
  const camera = new PerspectiveCamera(75), view = new PlayerView(camera, []), p = C.createBody();
  p.vz = 11;
  const heights = new Set<number>();
  for (let i = 0; i < 120; i++) { view.update(p, 1 / 60); heights.add(camera.position.y); }
  assert.ok(heights.size > 100); assert.ok(camera.fov > 87);
  assert.ok(Math.max(...heights) <= 1.618 && Math.min(...heights) >= 1.582, "subtle centred bob");
  assert.equal(camera.rotation.z, 0, "forward running never oscillates the horizon");
  assert.equal(camera.children.length, 0, "no floating block arms in first person");
  view.bob = false;
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
  assert.ok(Math.abs(camera.position.y - 1.6) < 0.0001);
  p.anim = 3; p.knockdownUntil = 2500; view.update(p, 1 / 60);
  assert.ok(camera.position.y > 1.3, "eye does not snap down");
  for (let i = 0; i < 60; i++) view.update(p, 1 / 60);
  assert.ok(camera.position.y < 0.5);
});
test("perspective cycles first/rear/front; third-person camera cannot see through a house", () => {
  const camera = new PerspectiveCamera(75), wall = new Mesh(new BoxGeometry(6, 4, 0.5), new MeshBasicMaterial());
  wall.position.set(0, 2, 2); wall.updateMatrixWorld(true);
  const view = new PlayerView(camera, [wall]), p = C.createBody();
  view.update(p, 1 / 60); view.cycle();
  for (let i = 0; i < 90; i++) view.update(p, 1 / 60);
  assert.ok(camera.position.z > 0 && camera.position.z < 1.75);
  view.cycle(); assert.equal(view.perspective, 2);
  for (let i = 0; i < 90; i++) view.update(p, 1 / 60);
  assert.ok(camera.position.z < 0);
  view.cycle(); assert.equal(view.perspective, 0);
});
test("WASD is camera-relative, stops when released and cannot run faster diagonally", () => {
  assert.deepEqual(keyboardMovement(new Set(["KeyW"]), 0), { x: 0, z: -1 });
  const turned = keyboardMovement(new Set(["KeyW"]), Math.PI / 2);
  assert.ok(turned.x < -0.99 && Math.abs(turned.z) < 1e-10);
  assert.deepEqual(keyboardMovement(new Set(), 0), { x: 0, z: 0 });
  const diagonal = keyboardMovement(new Set(["KeyW", "KeyD"]), 0);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-10);
});
test("airborne camera has no continuing gait; landing compression follows impact and settles", () => {
  const camera = new PerspectiveCamera(82), view = new PlayerView(camera, []), p = C.createBody();
  p.grounded = false; p.y = 2; p.vy = -20; p.vz = 11;
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
  assert.equal(camera.position.y, 3.6);
  p.grounded = true; p.y = 0; p.vy = p.vz = 0; view.update(p, 1 / 60);
  assert.ok(camera.position.y >= 1.525 && camera.position.y < 1.6);
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
  assert.ok(Math.abs(camera.position.y - 1.6) < 0.0001);
});
test("embedded-browser fallback turns at edges, not at the centre, and stays bounded", () => {
  assert.deepEqual(edgeTurn(250, 200, 500, 400), { x: 0, y: 0 });
  assert.deepEqual(edgeTurn(500, 400, 500, 400), { x: 1, y: 1 });
  assert.deepEqual(edgeTurn(0, 0, 500, 400), { x: -1, y: -1 });
});
test("looking changes hit facing while stationary or strafing, without rotating movement", () => {
  const p = C.createBody(), target = C.createBody(); target.x = 2;
  C.stepPlayer(p, { ...C.IDLE_INPUT, aim: true, facing: Math.PI / 2, hit: true }, 1 / 60);
  assert.ok(C.inHitCone(p, target)); assert.equal(p.x, 0);
  C.stepPlayer(p, { ...C.IDLE_INPUT, aim: true, facing: Math.PI / 2, z: -1 }, 1 / 60);
  assert.equal(p.rotY, Math.PI / 2); assert.ok(p.z < 0, "strafe does not change aim");
});
