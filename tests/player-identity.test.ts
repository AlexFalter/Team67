import { test } from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, Sprite } from "three";
import { createBody } from "../packages/shared/src/index.ts";
import { avatar, pose, disposeAvatar, CHARACTERS } from "../apps/client/src/multiplayer/avatar.ts";
import { decoratePlayer } from "../apps/client/src/multiplayer/playerIdentity.ts";

test("opponent identity follows articulated poses, keeps a faint occluded outline and disposes owned resources", () => {
  const mesh = avatar("#ffffff", 3), p = createBody();
  decoratePlayer(mesh, "Ada", true);
  const label = mesh.getObjectByName("player-name") as Sprite;
  const outline = mesh.getObjectByName("opponent-outline") as Mesh;
  const material = outline.material as MeshBasicMaterial;
  assert.equal(label.userData.playerName, "Ada");
  assert.ok(material.opacity < 0.4 && material.depthTest && !material.depthWrite);
  pose(mesh, p);
  const standing = outline.geometry.attributes.position.array.slice();
  p.anim = 4; p.vz = 10;
  for (let i = 0; i < 40; i++) pose(mesh, p);
  assert.notDeepEqual(outline.geometry.attributes.position.array, standing, "outline follows moving limbs and slide pose");
  assert.ok([...outline.geometry.attributes.position.array].every(Number.isFinite));
  assert.equal(label.position.y, 1.3);
  decoratePlayer(mesh, "Grace", true);
  assert.equal(mesh.getObjectByName("player-name"), label, "name updates reuse the label");
  assert.equal(label.userData.playerName, "Grace");
  let disposed = 0;
  outline.geometry.addEventListener("dispose", () => disposed++);
  material.addEventListener("dispose", () => disposed++);
  label.material.addEventListener("dispose", () => disposed++);
  disposeAvatar(mesh); assert.equal(disposed, 3);
});

test("local third-person name has no enemy outline and new characters share the existing joints", () => {
  const male = avatar("#fff", 0), female = avatar("#fff", 1), rector = avatar("#fff", 3);
  assert.equal(CHARACTERS.length, 4);
  assert.ok(female.getObjectByName("ponytail"));
  decoratePlayer(male, "You"); assert.ok(male.getObjectByName("player-name"));
  assert.equal(male.getObjectByName("opponent-outline"), undefined);
  for (const mesh of [female, rector]) for (const joint of ["left-elbow", "right-knee", "chest"]) assert.ok(mesh.getObjectByName(joint));
  [male, female, rector].forEach(disposeAvatar);
});
