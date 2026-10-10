import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";

// Owned by the tram render root; end points follow the independently posed cars.
export function createTramConnector() {
  const root = new THREE.Group(); root.name = "Tram flexible carriage connector"; root.visible = false;
  // Four walls around an open passage: no end caps across the passenger view.
  const shell: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    shell.push(new THREE.BoxGeometry(.08, 2.02, 1).translate(side * .8, 0, 0));
    shell.push(new THREE.BoxGeometry(1.68, .08, 1).translate(0, side * .97, 0));
  }
  const bodyGeometry = mergeGeometries(shell)!; shell.forEach(part => part.dispose());
  const body = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: "#252c32", roughness: .95 }));
  body.castShadow = true; root.add(body);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(.075, 2.1, .065).translate(side * .86, 0, 0));
    parts.push(new THREE.BoxGeometry(1.8, .075, .065).translate(0, side * 1.025, 0));
  }
  const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose());
  const ribs = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: "#56616b", roughness: .8 }), 10);
  ribs.castShadow = true; ribs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(ribs);
  return root;
}
export function disposeTramConnector(connector: THREE.Group) {
  (connector.children[1] as THREE.InstancedMesh).dispose();
  disposeMap(connector); connector.removeFromParent();
}
const front = new THREE.Vector3(), rear = new THREE.Vector3(), direction = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1), matrix = new THREE.Matrix4();
export function updateTramConnector(connector: THREE.Group, leading: THREE.Group, trailing: THREE.Group) {
  // The authored car faces -Z; +Z is the rear of the leading carriage.
  front.set(0, 1.75, 3.15); rear.set(0, 1.75, -3.15);
  leading.localToWorld(front); trailing.localToWorld(rear);
  connector.parent!.worldToLocal(front); connector.parent!.worldToLocal(rear);
  direction.subVectors(rear, front); const length = direction.length();
  connector.visible = length > .01;
  if (!connector.visible) return;
  connector.position.copy(front).add(rear).multiplyScalar(.5);
  connector.quaternion.setFromUnitVectors(forward, direction.normalize());
  (connector.children[0] as THREE.Mesh).scale.z = length;
  const ribs = connector.children[1] as THREE.InstancedMesh;
  for (let i = 0; i < ribs.count; i++) { matrix.makeTranslation(0, 0, (i / (ribs.count - 1) - .5) * length); ribs.setMatrixAt(i, matrix); }
  ribs.instanceMatrix.needsUpdate = true; ribs.computeBoundingSphere();
}
