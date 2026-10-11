import { edgeTurn } from "../apps/client/src/multiplayer/gameControls.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import * as C from "../packages/shared/src/index.ts";
import { PlayerView } from "../apps/client/src/multiplayer/view.ts";
import { keyboardMovement } from "../apps/client/src/multiplayer/localPlayer.ts";

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
test("third-person spring arm retracts safely and returns smoothly", () => {
  const camera = new PerspectiveCamera(75), wall = new Mesh(new BoxGeometry(6, 4, 0.5), new MeshBasicMaterial());
  wall.position.set(0, 2, 2); wall.updateMatrixWorld(true);
  const view = new PlayerView(camera, [wall]), p = C.createBody();
  view.update(p, 1 / 60); view.cycle();
  for (let i = 0; i < 90; i++) view.update(p, 1 / 60);
  assert.ok(camera.position.z > 0 && camera.position.z < 1.75);

  wall.position.z = 20; wall.updateMatrixWorld(true);
  view.update(p, 1 / 60);
  assert.ok(camera.position.z < 2.2, "arm does not pop out when obstruction clears");
  for (let i = 0; i < 90; i++) view.update(p, 1 / 60);
  assert.ok(camera.position.z > 4.4, "arm returns to its requested length");

  wall.position.z = 2; wall.updateMatrixWorld(true);
  view.update(p, 1 / 60);
  assert.ok(camera.position.z < 1.75, "arm retracts before the camera enters the wall");

  wall.position.z = 0.15; wall.scale.z = 0.2; wall.updateMatrixWorld(true);
  view.update(p, 1 / 60);
  assert.ok(camera.position.z < 0.1, "arm can collapse fully when a wall is next to the pivot");
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
test("looking changes hit facing while stationary or strafing, without rotating movement", () => {
  const p = C.createBody(), target = C.createBody(); target.x = 2;
  C.stepPlayer(p, { ...C.IDLE_INPUT, aim: true, facing: Math.PI / 2, hit: true }, 1 / 60);
  assert.ok(C.inHitCone(p, target)); assert.equal(p.x, 0);
  C.stepPlayer(p, { ...C.IDLE_INPUT, aim: true, facing: Math.PI / 2, z: -1 }, 1 / 60);
  assert.equal(p.rotY, Math.PI / 2); assert.ok(p.z < 0, "strafe does not change aim");
});

test("rail head offsets stay fixed during mouse look and on-foot slide/gaze offsets return after exiting", () => {
  const camera = new PerspectiveCamera(82), view = new PlayerView(camera, []), p = C.createBody();
  p.vehicleId = "polybahn-1"; p.vehicleKind = C.POLYBAHN_KIND; p.rotY = 0.4;
  for (let i = 0; i < 60; i++) view.update(p, 1 / 60, { rotY: 0.4, pitch: -0.2 });
  const seat = camera.position.clone();
  view.look(400, 400);
  view.update(p, 1 / 60, { rotY: 0.4, pitch: -0.2 });
  assert.ok(camera.position.distanceTo(seat) < 0.0001, "seated look rotates at the head without orbiting into windows");
  p.vehicleId = ""; p.vehicleKind = -1; p.anim = C.SLIDE_ANIM;
  view.yaw = 0; view.pitch = -1.3;
  for (let i = 0; i < 90; i++) view.update(p, 1 / 60);
  assert.ok(Math.abs(camera.position.y - 0.82) < 0.001);
  assert.ok(camera.position.z < -0.25, "on-foot downward gaze clears the torso again");
  assert.ok(camera.rotation.x < view.pitch - 0.19, "slide camera tilt returns after leaving the rail seat");
});

test("slide smoothly lowers the eyes and looking down reveals torso and shoes without entering the chest", () => {
  const camera = new PerspectiveCamera(82), view = new PlayerView(camera, []), p = C.createBody();
  p.anim = C.SLIDE_ANIM; p.vz = 10; view.update(p, 1 / 60);
  assert.ok(camera.position.y > 1.3);
  for (let i = 0; i < 60; i++) view.update(p, 1 / 60);
  assert.ok(Math.abs(camera.position.y - 0.82) < 0.01);
  p.anim = 0; p.vz = 0; view.pitch = -1.3;
  for (let i = 0; i < 60; i++) view.update(p, 1 / 60);
  assert.ok(camera.position.z < -0.35, "eyes move ahead of chest at downward gaze");
  assert.ok(Math.abs(camera.position.y - 1.6) < 0.01);
});

test("Polybahn third-person camera frames the whole cabin in both directions", () => {
  const camera = new PerspectiveCamera(75), view = new PlayerView(camera, []), p = C.createBody();
  p.vehicleId = "polybahn-1"; p.vehicleKind = C.POLYBAHN_KIND;
  view.cycle();
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
  assert.ok(Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > 9.9);
  assert.ok(camera.position.y > p.y + 4.5, "raised view clears the cabin roof");
  view.cycle();
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
  assert.ok(Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > 9.9);
});

test("Polybahn first-person eyes follow the inclined seat without tilting the horizon", () => {
  const camera = new PerspectiveCamera(75), view = new PlayerView(camera, []), p = C.createBody();
  p.vehicleId = "polybahn-1"; p.vehicleKind = C.POLYBAHN_KIND;
  const frame = { rotY: Math.PI / 2, pitch: -.22 };
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60, frame);
  assert.ok(Math.abs(camera.position.y - (p.y + 1.4 * Math.cos(frame.pitch))) < .001);
  assert.ok(Math.abs(camera.position.x - (p.x + 1.4 * Math.sin(frame.pitch))) < .001);
  assert.equal(camera.rotation.z, 0);
  assert.ok(Math.abs(camera.fov - 72) < .001);
});

test("tram cameras use seated first-person height and a wider carriage view", () => {
  const camera = new PerspectiveCamera(75), view = new PlayerView(camera, []), p = C.createBody();
  p.vehicleId = "tram-1"; p.vehicleKind = C.TRAM_KIND;
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60, { rotY: 0, pitch: 0 });
  assert.ok(Math.abs(camera.position.y - p.y - 1.65) < .001);
  assert.ok(Math.abs(camera.fov - 72) < .001);
  view.cycle();
  for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
  assert.ok(Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > 12.9);
  assert.ok(camera.position.y > p.y + 4.8);
});

 test('rail riders never see their own seated body through the first-person camera',async()=>{
  const {firstPersonBodyVisible}=await import('../apps/client/src/multiplayer/avatar.ts');
  const p=C.createBody();
  assert.equal(firstPersonBodyVisible(p,0),true);
  for(const kind of [C.POLYBAHN_KIND,C.TRAM_KIND]){
   p.vehicleId='rail';p.vehicleKind=kind;
   assert.equal(firstPersonBodyVisible(p,0),false);
   assert.equal(firstPersonBodyVisible(p,1),false);
   p.cabinStanding=true;assert.equal(firstPersonBodyVisible(p,0),false,'standing body cannot obstruct the low cabin camera');p.cabinStanding=false;
  }
  p.vehicleKind=2;assert.equal(firstPersonBodyVisible(p,0),true);
  p.vehicleId='';p.vehicleKind=-1;assert.equal(firstPersonBodyVisible(p,0),true);
 });


test("boarding selects third person once, preserves manual changes and restores the walking view", () => {
  const camera = new PerspectiveCamera();
  const view = new PlayerView(camera, []);
  for (const id of ["tram", "publi-bike", "lime-scooter", "cart", "npc-limousine"]) {
    view.perspective = 0;
    view.setVehicle(id, .5); assert.equal(view.perspective, 1);
    assert.equal(view.yaw, .5 + Math.PI);
    view.cycle(); view.cycle(); assert.equal(view.perspective, 0);
    view.setVehicle(id, .8); assert.equal(view.perspective, 0, "does not force a chosen view every frame");
    view.setVehicle("", .8); assert.equal(view.perspective, 0);
  }
});


test("Lime driver and rear passenger get a third-person follow camera with optional first person", () => {
  for (const seat of [0, 1]) {
    const camera = new PerspectiveCamera(), view = new PlayerView(camera, []), p = C.createBody();
    p.vehicleId = "lime-scooter"; p.vehicleKind = C.LIME_KIND; p.seat = seat;
    view.setVehicle(p.vehicleId, p.rotY);
    for (let i = 0; i < 120; i++) view.update(p, 1 / 60);
    assert.equal(view.perspective, 1);
    assert.ok(Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > 4);
    view.cycle(); view.cycle();
    view.setVehicle(p.vehicleId, p.rotY); assert.equal(view.perspective, 0);
    view.setVehicle("", p.rotY); assert.equal(view.perspective, 0);
  }
});

test("embedded-browser fallback turns at edges, not at the centre, and stays bounded", () => {
  assert.deepEqual(edgeTurn(250, 200, 500, 400), { x: 0, y: 0 });
  assert.deepEqual(edgeTurn(500, 400, 500, 400), { x: 1, y: 1 });
  assert.deepEqual(edgeTurn(0, 0, 500, 400), { x: -1, y: -1 });
});

test("Polybahn boarding defaults to first person once and restores the prior walking perspective", () => {
  const camera = new PerspectiveCamera(), view = new PlayerView(camera, []);
  view.perspective = 2;
  view.setVehicle("polybahn-1", 0.5, C.POLYBAHN_KIND);
  assert.equal(view.perspective, 0); assert.equal(view.pitch, 0);
  view.cycle();
  view.setVehicle("polybahn-1", 0.8, C.POLYBAHN_KIND);
  assert.equal(view.perspective, 1, "manual exterior view is preserved during the ride");
  view.setVehicle("", 0.8, -1);
  assert.equal(view.perspective, 2);
});

test("Polybahn eyes stay clear of the body and stable when standing direction changes", () => {
  const camera = new PerspectiveCamera(82, 1, 0.05), view = new PlayerView(camera, []), p = C.createBody();
  p.vz = 11; p.anim = C.SLIDE_ANIM;
  for (let i = 0; i < 60; i++) view.update(p, 1 / 60);
  p.vehicleId = "polybahn-1"; p.vehicleKind = C.POLYBAHN_KIND; p.cabinStanding = true; p.anim = 0;
  const frame = { rotY: 0.4, pitch: -0.3 };
  view.setVehicle(p.vehicleId, p.rotY, p.vehicleKind);
  view.update(p, 1 / 60, frame);
  const eye = camera.position.clone();
  assert.ok(Math.abs(eye.y - p.y - 1.42 * Math.cos(frame.pitch)) < 1e-8, "boarding clears old slide height immediately");
  assert.equal(camera.near, 0.025);
  p.rotY += Math.PI / 2; view.look(300, 100); view.update(p, 1 / 60, frame);
  assert.ok(camera.position.distanceTo(eye) < 1e-8, "turning and looking cannot push eyes into benches");
  p.vehicleId = ""; p.vehicleKind = -1; p.cabinStanding = false;
  view.setVehicle("", p.rotY); view.update(p, 1 / 60);
  assert.equal(camera.near, 0.05, "ordinary world clipping plane is restored");
});
