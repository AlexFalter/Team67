import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, Group, BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, Raycaster } from "three";
import { avatar, pose, disposeAvatar, CHARACTERS, gaitRate, equipMateCan } from "../apps/client/src/multiplayer/avatar.ts";
import { PlayerView } from "../apps/client/src/multiplayer/view.ts";
import { createBody, LIME_KIND, LIME_SPEED, LIME_BOOST_SPEED, ATTACK_COOLDOWN_MS } from "../packages/shared/src/index.ts";

test("four low-poly rigs animate locomotion, punches, falls and recovery without snapping", () => {
  for (let i = 0; i < CHARACTERS.length; i++) {
    const mesh = avatar("#d9ab72", i), p = createBody();
    assert.equal(mesh.name, CHARACTERS[i]);
    assert.ok(new Box3().setFromObject(mesh).max.y < 2, "art fits the player collider");
    const torso = mesh.getObjectByName("torso")!, arm = mesh.getObjectByName("left-arm")!;
    p.vz = 11; p.anim = 1;
    for (let n = 0; n < 20; n++) pose(mesh, p);
    const running = arm.rotation.x; pose(mesh, p);
    assert.notEqual(arm.rotation.x, running, "limbs cycle while running");
    p.grounded = false; p.anim = 2; p.vy = 8;
    const leg = mesh.getObjectByName("left-leg")!, beforeJump = leg.rotation.x;
    pose(mesh, p); assert.ok(Math.abs(leg.rotation.x - beforeJump) < 0.25, "jump pose starts blended");
    for (let n = 0; n < 30; n++) pose(mesh, p);
    const airPose = leg.rotation.x;
    p.vy = -8;
    for (let n = 0; n < 60; n++) pose(mesh, p);
    assert.ok(Math.abs(leg.rotation.x) < .01, "airborne legs settle without a jump/flailing animation");
    assert.ok(Math.abs(airPose) < .02);
    p.grounded = true; p.anim = 0; pose(mesh, p);
    assert.ok(torso.position.y < 0.75, "landing compresses the rig");
    p.attackReadyAt = ATTACK_COOLDOWN_MS - 210;
    for (let n = 0; n < 10; n++) pose(mesh, p);
    assert.ok(mesh.getObjectByName("right-arm")!.rotation.x < -1, "punch extends the arm");
    p.anim = 3; p.knockdownUntil = 5000;
    pose(mesh, p); assert.ok(Math.abs(torso.rotation.x) < 0.4, "fall starts blended");
    for (let n = 0; n < 40; n++) pose(mesh, p);
    assert.ok(torso.rotation.x < -1.4, "whole rig lies down");
    p.anim = 0; p.vz = 0; p.simTime = 5001;
    pose(mesh, p); assert.ok(torso.rotation.x < -1, "get-up does not snap upright");
    for (let n = 0; n < 60; n++) pose(mesh, p);
    assert.ok(Math.abs(torso.rotation.x) < 0.03);
    mesh.traverse(c => { if (c instanceof Mesh) assert.ok((c.geometry.index?.count ?? c.geometry.attributes.position.count) < 150, "simple polygon pieces"); });
    disposeAvatar(mesh);
  }
});

test("first-person rigs reuse each outfit, hide the head, and show shoes when looking down", () => {
  const camera = new PerspectiveCamera(82, 1); camera.position.set(0, 1.6, -0.15);
  camera.rotation.set(-1.3, 0, 0, "YXZ"); camera.updateMatrixWorld(true);
  for (let character = 0; character < CHARACTERS.length; character++) {
    const mesh = avatar("#d9ab72", character, true), p = createBody(); p.rotY = Math.PI;
    for (let n = 0; n < 60; n++) pose(mesh, p, 1 / 60, -1.3);
    assert.equal(mesh.getObjectByName("head")!.visible, false);
    const shoe = mesh.getObjectByName("shoe")!; mesh.updateMatrixWorld(true);
    const projected = shoe.getWorldPosition(new Vector3()).project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z < 1, "feet inside downward view");
    assert.equal(((shoe as Mesh).material as MeshStandardMaterial).color.getHexString(), character === 3 ? "20252b" : "e8dfcb");
    disposeAvatar(mesh);
  }
});
test("first-person hands stay peripheral and visible while running at upward and downward gaze", () => {
  const mesh = avatar("#ffffff", 0, true), p = createBody(); p.rotY = Math.PI; p.vz = -11;
  const camera = new PerspectiveCamera(82, 1); camera.position.set(0, 1.6, -0.15);
  const hands: Mesh[] = []; mesh.traverse(c => { if (c instanceof Mesh && c.name === "hand") hands.push(c); });
  for (const pitch of [-1.3, 0, 1.2]) {
    camera.rotation.set(pitch, 0, 0, "YXZ"); camera.updateMatrixWorld(true);
    let visible = 0;
    for (let n = 0; n < 120; n++) {
      pose(mesh, p, 1 / 60, pitch); mesh.updateMatrixWorld(true);
      for (const hand of hands) {
        const projected = hand.getWorldPosition(new Vector3()).project(camera);
        if (Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z < 1) {
          visible++; assert.ok(Math.abs(projected.x) > 0.3 || Math.abs(projected.y) > 0.3, "hands never obscure the reticle");
        }
      }
    }
    assert.ok(visible > 30, "articulated hands enter the view throughout the gait");
  }
  disposeAvatar(mesh);
});
test("first-person elbows pump in opposition, track gaze, and blend to airborne/action poses", () => {
  const mesh = avatar("#ffffff", 0, true), p = createBody(); p.vz = -11; p.rotY = Math.PI;
  const left = mesh.getObjectByName("left-arm")!, right = mesh.getObjectByName("right-arm")!;
  for (let n = 0; n < 60; n++) pose(mesh, p);
  assert.ok(Math.abs(left.rotation.x - right.rotation.x) > 0.05);
  for (let n = 0; n < 60; n++) pose(mesh, p, 1 / 60, 0.8);
  assert.equal(left.parent!.rotation.x, -0.8, "arms track gaze without rotating the world-space legs");
  assert.equal(mesh.getObjectByName("left-leg")!.parent!.rotation.y, 0);
  const before = right.rotation.x; p.grounded = false; p.vy = 8; pose(mesh, p);
  assert.ok(Math.abs(right.rotation.x - before) < 0.4, "no jump pose snap");
  p.attackReadyAt = ATTACK_COOLDOWN_MS - 210;
  for (let n = 0; n < 15; n++) pose(mesh, p);
  assert.ok(right.rotation.x < -1.3, "hook raises the right arm");
  assert.ok(mesh.getObjectByName("right-elbow")!.rotation.z > 1.2, "hook keeps the elbow bent sideways");
  assert.ok(right.rotation.y > 0.1, "right shoulder swings across the body");
  assert.ok(gaitRate(11) / Math.PI < 4, "sprint stays below four alternating footfalls per second");
  disposeAvatar(mesh);
});

test("original outfit meshes have chest, elbow, knee, wrist and ankle articulation; slide lowers into asymmetric legs", () => {
  for (let character = 0; character < CHARACTERS.length; character++) {
    const mesh = avatar("#ffffff", character), p = createBody();
    for (const name of ["chest", "left-elbow", "right-elbow", "left-knee", "right-knee", "left-wrist", "right-wrist", "left-ankle", "right-ankle"]) assert.ok(mesh.getObjectByName(name));
    p.anim = 4; p.vz = 10;
    for (let i = 0; i < 40; i++) pose(mesh, p);
    assert.ok(mesh.getObjectByName("torso")!.position.y < 0.5);
    assert.ok(mesh.getObjectByName("right-knee")!.rotation.x > 1.4);
    assert.ok(mesh.getObjectByName("left-knee")!.rotation.x < 0.3);
    disposeAvatar(mesh);
  }
});

test("airborne legs stay calm without flailing; first-person arms sway laterally", () => {
  const mesh = avatar("#ffffff"), p = createBody(); p.grounded = false; p.vy = 4;
  const angles = new Set<number>();
  for (let i = 0; i < 60; i++) { pose(mesh, p); angles.add(mesh.getObjectByName("left-leg")!.rotation.x); }
  assert.ok(Math.max(...angles) - Math.min(...angles) < .01);
  const first = avatar("#ffffff", 0, true); p.grounded = true; p.vz = 11;
  const offsets = new Set<number>();
  for (let i = 0; i < 120; i++) { pose(first, p); offsets.add(first.getObjectByName("left-arm")!.position.x); }
  assert.ok(Math.max(...offsets) - Math.min(...offsets) > 0.09);
  disposeAvatar(first); disposeAvatar(mesh);
});


test("downward first-person shoes are inside the screen and not occluded by the torso at narrow and wide aspects", () => {
  for (const aspect of [0.69, 1, 16 / 9]) {
    const mesh = avatar("#ffffff", 0, true), p = createBody(); p.rotY = Math.PI;
    const camera = new PerspectiveCamera(82, aspect, 0.05, 100), view = new PlayerView(camera, []); view.pitch = -1.3;
    for (let i = 0; i < 60; i++) { view.update(p, 1 / 60); pose(mesh, p, 1 / 60, view.pitch, camera); }
    mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    mesh.traverse(child => {
      if (child.name !== "shoe") return;
      const position = child.getWorldPosition(new Vector3()), screen = position.clone().project(camera);
      assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && screen.z < 1);
      const ray = new Raycaster(camera.position, position.sub(camera.position).normalize());
      assert.equal(ray.intersectObject(mesh, true)[0]?.object, child, "torso does not hide a projected shoe");
    });
    disposeAvatar(mesh);
  }
});

test("first-person slide shows its leading shoe at neutral gaze after the camera settles", () => {
  const mesh = avatar("#ffffff", 0, true), p = createBody(); p.anim = 4; p.vz = 11;
  const camera = new PerspectiveCamera(82, 16 / 9, 0.05, 100), view = new PlayerView(camera, []); view.yaw = Math.PI;
  for (let i = 0; i < 40; i++) { view.update(p, 1 / 60); pose(mesh, p, 1 / 60, 0, camera); }
  mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const shoe = mesh.getObjectByName("shoe")!, position = shoe.getWorldPosition(new Vector3());
  const screen = position.clone().project(camera);
  assert.ok(Math.abs(screen.x) < 1 && screen.y > -1 && screen.y < -0.5 && screen.z < 1, "leading foot is in the lower view");
  const ray = new Raycaster(camera.position, position.sub(camera.position).normalize());
  assert.equal(ray.intersectObject(mesh, true)[0]?.object, shoe, "body does not cover the foot");
  disposeAvatar(mesh);
});


test("drinking lifts the right hand with the matching can in both rigs, then lowers it", () => {
  const can = new Group(), material = new MeshStandardMaterial({ color: "#8dcf61" });
  const geometry = new BoxGeometry(.06, .16, .06); can.add(new Mesh(geometry, material));
  for (const first of [false, true]) {
    const mesh = avatar("#fff", 0, first), p = createBody();
    equipMateCan(mesh, can, 2);
    p.simTime = 1000; pose(mesh, p);
    const held = mesh.getObjectByName("held-mate-2")!;
    assert.equal(held.visible, false);
    const hand = mesh.getObjectByName("right-arm")!.getObjectByName("hand")!;
    const before = hand.getWorldPosition(new Vector3());
    p.mateDrinkStartedAt = 1000; p.simTime = 1600;
    for (let i = 0; i < 20; i++) pose(mesh, p);
    assert.equal(held.visible, true);
    assert.ok(hand.getWorldPosition(new Vector3()).y > before.y + .15, "right hand rises toward the mouth");
    p.simTime = 2500; pose(mesh, p); assert.equal(held.visible, false);
    equipMateCan(mesh, can, 3); assert.ok(mesh.getObjectByName("held-mate-3")); assert.equal(held.parent, null);
    disposeAvatar(mesh);
  }
  geometry.dispose(); material.dispose();
});


test("Lime riders brace on the deck and the driver leans further during boost", () => {
  for (let character = 0; character < CHARACTERS.length; character++) {
    const mesh = avatar("#ffffff", character), p = createBody();
    p.vehicleId = "lime"; p.vehicleKind = LIME_KIND; p.seat = 0; p.vz = LIME_SPEED;
    const torso = mesh.getObjectByName("torso")!, arm = mesh.getObjectByName("left-arm")!;
    for (let n = 0; n < 90; n++) pose(mesh, p);
    const normalLean = torso.rotation.x;
    assert.ok(arm.rotation.x < -1.2, "driver reaches the handlebars");
    mesh.updateMatrixWorld(true);
    for (const side of ["left", "right"]) {
      assert.ok(mesh.getObjectByName(`${side}-knee`)!.rotation.x > .1);
      const foot = mesh.getObjectByName(`${side}-ankle`)!.getWorldPosition(new Vector3());
      assert.ok(foot.y > -.04 && foot.y < .15, "feet stay near the deck");
    }
    p.vz = LIME_BOOST_SPEED; for (let n = 0; n < 90; n++) pose(mesh, p);
    assert.ok(torso.rotation.x > normalLean + .08);
    p.seat = 1; for (let n = 0; n < 90; n++) pose(mesh, p);
    assert.ok(Math.abs(torso.rotation.x) < .01, "rear passenger keeps a balanced stance");
    disposeAvatar(mesh);
  }
});
