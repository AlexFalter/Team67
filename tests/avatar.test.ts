import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three";
import { avatar, pose, disposeAvatar, CHARACTERS, gaitRate } from "../apps/client/src/multiplayer/avatar.ts";
import { createBody, ATTACK_COOLDOWN_MS } from "../packages/shared/src/index.ts";

test("three original low-poly rigs animate locomotion, punches, falls and recovery without snapping", () => {
  for (let i = 0; i < 3; i++) {
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
    assert.ok(Math.abs(leg.rotation.x + 0.35) < 0.01, "jump tucks legs");
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
  for (let character = 0; character < 3; character++) {
    const mesh = avatar("#d9ab72", character, true), p = createBody(); p.rotY = Math.PI;
    for (let n = 0; n < 60; n++) pose(mesh, p, 1 / 60, -1.3);
    assert.equal(mesh.getObjectByName("head")!.visible, false);
    const shoe = mesh.getObjectByName("shoe")!; mesh.updateMatrixWorld(true);
    const projected = shoe.getWorldPosition(new Vector3()).project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z < 1, "feet inside downward view");
    p.shoes = true; pose(mesh, p);
    assert.equal(((shoe as Mesh).material as MeshStandardMaterial).color.getHexString(), "86efad");
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
  assert.ok(right.rotation.x < -2, "punch reaches forward");
  assert.ok(gaitRate(11) / Math.PI < 4, "sprint stays below four alternating footfalls per second");
  disposeAvatar(mesh);
});
