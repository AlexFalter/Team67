import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Triangle, Vector3, type Intersection } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createBody } from "../packages/shared/src/index.ts";
import { accelerateMapRaycasts } from "../apps/client/src/multiplayer/mapRaycast.ts";
import { PlayerView } from "../apps/client/src/multiplayer/view.ts";

function onEdge(hit: Intersection) {
  const mesh = hit.object as Mesh, index = mesh.geometry.index!, position = mesh.geometry.attributes.position;
  const [a, b, c] = [0, 1, 2].map(k => new Vector3().fromBufferAttribute(position, index.getX(hit.faceIndex! * 3 + k)).applyMatrix4(mesh.matrixWorld));
  const bary = new Triangle(a, b, c).getBarycoord(hit.point, new Vector3());
  return !!bary && Math.min(bary.x, bary.y, bary.z) < 1e-6;
}

test("BVH nearest hits match the original city geometry from both sides without changing its buffers", async () => {
  const bytes = readFileSync(new URL("../apps/client/public/maps/zurich/zurich.glb", import.meta.url));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  scene.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  const buffers = meshes.map(mesh => ({
    geometry: mesh.geometry, index: mesh.geometry.index!, positions: mesh.geometry.attributes.position,
    indices: mesh.geometry.index!.array.slice(),
  }));
  const ray = new Raycaster(); ray.far = 4.5; ray.firstHitOnly = true;
  const probes: { origin: Vector3; direction: Vector3 }[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry, index = geometry.index!, positions = geometry.attributes.position;
    const triangles = index.count / 3;
    for (let i = 0; i < 20; i++) {
      const triangle = Math.floor((i + 0.5) * triangles / 20) * 3;
      a.fromBufferAttribute(positions, index.getX(triangle)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(positions, index.getX(triangle + 1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(positions, index.getX(triangle + 2)).applyMatrix4(mesh.matrixWorld);
      const centre = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.lengthSq() === 0) continue;
      for (const side of [-1, 1]) probes.push({ origin: centre.clone().addScaledVector(normal, side * 3), direction: normal.clone().multiplyScalar(-side) });
    }
  }
  // Include clear rays from spawn and terrain hits as well as nearby building faces.
  for (let i = 0; i < 16; i++) probes.push({ origin: new Vector3(-273, 9.13, -106), direction: new Vector3(Math.sin(i * Math.PI / 8), i % 2 ? 0 : -1, Math.cos(i * Math.PI / 8)).normalize() });
  const reference = probes.map(({ origin, direction }) => {
    ray.set(origin, direction);
    const hit = ray.intersectObject(scene, true)[0];
    // A ray lying inside a wall's plane only grazes its edge; that hit is not well defined.
    return hit && Math.abs(hit.face!.normal.dot(direction)) < 1e-6 ? null : hit;
  });
  assert.ok(reference.filter(Boolean).length >= 60, "exercise actual intersections, not only misses");
  const dispose = accelerateMapRaycasts(scene);
  try {
    probes.forEach(({ origin, direction }, i) => {
      ray.set(origin, direction);
      const actual = ray.intersectObject(scene, true)[0], expected = reference[i];
      if (expected === null) return;
      if (!!actual !== !!expected && onEdge((actual ?? expected)!)) return; // edge-only hit, ambiguous
      assert.equal(!!actual, !!expected);
      if (expected) {
        // Hits exactly on a triangle edge are ambiguous (the BVH and three's brute force may disagree).
        if (Math.abs(actual.distance - expected.distance) >= 1e-5 && (onEdge(actual) || onEdge(expected))) return;
        if (actual.object !== expected.object) assert.ok(Math.abs(actual.distance - expected.distance) < 1e-5, "coplanar tie");
        assert.ok(Math.abs(actual.distance - expected.distance) < 1e-5);
        assert.ok(actual.point.distanceTo(expected.point) < 1e-5);
      }
    });
    for (const { geometry, index, positions, indices } of buffers) {
      assert.equal(geometry.index, index);
      assert.equal(geometry.attributes.position, positions);
      assert.deepEqual(index.array, indices, "indirect BVH preserves triangle order");
    }
  } finally {
    dispose();
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    }
  }
});

test("camera acceleration is limited to map instances and releases shared trees on cleanup", () => {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const map = new Group(), a = new Mesh(geometry, material), b = new Mesh(geometry, material);
  const unrelated = new Mesh(new BoxGeometry(), material);
  map.add(a, b);
  const original = a.raycast, prototype = Mesh.prototype.raycast;
  const dispose = accelerateMapRaycasts(map), tree = geometry.boundsTree;
  assert.ok(tree);
  assert.notEqual(a.raycast, original);
  assert.equal(a.raycast, b.raycast);
  assert.equal(Mesh.prototype.raycast, prototype);
  assert.equal(unrelated.raycast, prototype);
  dispose(); dispose();
  assert.equal(geometry.boundsTree, undefined);
  assert.equal(a.raycast, original); assert.equal(b.raycast, original);
  const again = accelerateMapRaycasts(map);
  assert.ok(geometry.boundsTree); assert.notEqual(geometry.boundsTree, tree);
  again();
  geometry.dispose(); unrelated.geometry.dispose(); material.dispose();
});

test("accelerated rear and front cameras keep the original obstruction and smoothing behavior", () => {
  const walls = new Group(), material = new MeshBasicMaterial();
  for (const z of [-2, 2]) {
    const wall = new Mesh(new BoxGeometry(6, 4, 0.5), material);
    wall.position.set(0, 2, z); walls.add(wall);
  }
  walls.updateMatrixWorld(true);
  const plain = new PlayerView(new PerspectiveCamera(75), [walls]), body = createBody();
  const poses: Vector3[] = [];
  for (const perspective of [1, 2]) {
    plain.perspective = perspective;
    for (let i = 0; i < 90; i++) { plain.update(body, 1 / 60); poses.push(plain.camera.position.clone()); }
    assert.ok(Math.abs(plain.camera.position.z) < 1.75);
  }
  const dispose = accelerateMapRaycasts(walls);
  const accelerated = new PlayerView(new PerspectiveCamera(75), [walls]);
  let frame = 0;
  for (const perspective of [1, 2]) {
    accelerated.perspective = perspective;
    for (let i = 0; i < 90; i++) {
      accelerated.update(body, 1 / 60);
      assert.ok(accelerated.camera.position.distanceTo(poses[frame++]) < 1e-6);
    }
  }
  dispose();
  walls.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); }); material.dispose();
});
