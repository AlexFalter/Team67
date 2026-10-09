import * as THREE from "three";
import { CAPSULE_RADIUS, CAPSULE_HEIGHT, type PlayerState } from "@race/shared";
const geometry = new THREE.CapsuleGeometry(
  CAPSULE_RADIUS,
  CAPSULE_HEIGHT - 2 * CAPSULE_RADIUS,
  6,
  12,
);
const coneGeometry = new THREE.ConeGeometry(0.16, 0.4, 8);
export function avatar(color: string) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
  );
  body.position.y = CAPSULE_HEIGHT / 2;
  body.castShadow = true;
  root.add(body);
  const cone = new THREE.Mesh(
    coneGeometry,
    new THREE.MeshStandardMaterial({ color: "#ffffff" }),
  );
  cone.rotation.x = Math.PI / 2;
  cone.position.set(0, 1.1, 0.65);
  root.add(cone);
  return root;
}
export function pose(
  mesh: THREE.Group,
  p: Pick<PlayerState, "x" | "y" | "z" | "rotY" | "anim">,
) {
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.set(0, p.rotY, 0);
  mesh.children[0].rotation.z = p.anim === 3 ? 1.1 : 0;
}
export function disposeAvatar(mesh: THREE.Group) {
  mesh.children.forEach((child) => {
    const m = child as THREE.Mesh;
    (m.material as THREE.Material).dispose();
  });
  mesh.removeFromParent();
}
