import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrafficRenderer } from '../apps/client/src/multiplayer/traffic.ts';
import { TrafficRoadSurface } from '../apps/client/src/multiplayer/trafficRoadSurface.ts';
import type { WorldState } from '../packages/shared/src/types.ts';

test('traffic interpolates server snapshots, wraps yaw, clamps and releases instanced resources', () => {
  const scene = new THREE.Scene(), renderer = new TrafficRenderer(scene);
  const patch = (serverTime: number, x: number, rotY: number) => renderer.patch({ serverTime, trafficCars: new Map([['traffic-1', { x, y: 2, z: 3, rotY, speed: 8 }]]) } as WorldState);
  patch(1000, 0, Math.PI - 0.1); patch(1100, 10, -Math.PI + 0.1);
  renderer.render(1050);
  const body = scene.children[0] as THREE.InstancedMesh, wheels = scene.children[2] as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(); body.getMatrixAt(0, matrix);
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(); matrix.decompose(position, rotation, new THREE.Vector3());
  assert.equal(position.x, 5); assert(Math.abs(position.y - 2) < 0.001); assert.equal(wheels.count, 4);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation); assert(forward.z < -0.99);
  renderer.render(5000); body.getMatrixAt(0, matrix); assert.equal(new THREE.Vector3().setFromMatrixPosition(matrix).x, 10);
  renderer.patch({ serverTime: 1200, trafficCars: new Map() } as WorldState); renderer.render(1200); assert.equal(body.count, 0); assert.equal(wheels.count, 0);
  patch(1300, 20, 0); renderer.render(1300); assert.equal(body.count, 1);
  renderer.clear(); assert.equal(body.count, 0); assert.equal(wheels.count, 0);
  let disposed = false; body.geometry.addEventListener('dispose', () => { disposed = true; }); renderer.dispose();
  assert(disposed); assert.equal(scene.children.length, 0);
});

test('cars ground on sloped asphalt at their lane position and preserve separate bridge levels', () => {
  const map = new THREE.Group(), geometry = new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, 8 + positions.getZ(i) * 0.1 + positions.getX(i) * 0.04);
  const material = new THREE.MeshBasicMaterial(); material.name = 'G_Road';
  map.add(new THREE.Mesh(geometry, material));
  const surface = TrafficRoadSurface.forMap(map);
  assert.equal(TrafficRoadSurface.forMap(map), surface, 'reuse the map index across editor and gameplay');
  const scene = new THREE.Scene(), renderer = new TrafficRenderer(scene, surface);
  const patch = (y: number) => renderer.patch({ serverTime: 1000, trafficCars: new Map([['traffic-1', { x: 4, y, z: 3, rotY: 0.7, speed: 8 }]]) } as WorldState);
  patch(9); renderer.render(1000);
  const wheels = scene.children[2] as THREE.InstancedMesh, matrix = new THREE.Matrix4();
  for (let wheel = 0; wheel < 4; wheel++) {
    wheels.getMatrixAt(wheel, matrix);
    const center = new THREE.Vector3().setFromMatrixPosition(matrix), up = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
    assert(Math.abs(center.y - 0.35 * up.y - surface.height(center.x, center.z, 8)!) < 0.02, 'all wheels sit on the sloped road');
  }
  patch(20); renderer.render(1000);
  wheels.getMatrixAt(0, matrix);
  assert(Math.abs(new THREE.Vector3().setFromMatrixPosition(matrix).y - 20.35) < 0.001, 'do not drop an elevated vehicle to a road below');
  renderer.dispose(); geometry.dispose(); material.dispose();
});
