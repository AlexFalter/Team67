import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { randomTrafficAppearance, TRAFFIC_PALETTES } from '../packages/shared/src/trafficAppearance.ts';
import { RaceState } from '../apps/server/src/state.ts';
import { TrafficManager } from '../apps/server/src/traffic.ts';
import { createTrafficModel } from '../apps/client/src/multiplayer/trafficModels.ts';
import { TrafficRenderer } from '../apps/client/src/multiplayer/traffic.ts';
import type { WorldState } from '../packages/shared/src/types.ts';
import { withServer, until, type WireState } from './fixture.ts';

test('appearance selects 80% sedans, 10% sports cars and 10% tractors with the requested palettes', () => {
  const counts = [0, 0, 0];
  for (let sample = 0; sample < 1000; sample++) {
    let draw = 0;
    const appearance = randomTrafficAppearance(() => draw++ === 0 ? (sample + .5) / 1000 : .99999);
    counts[appearance.kind]++;
    assert.equal(appearance.color, TRAFFIC_PALETTES[appearance.kind].length - 1);
  }
  assert.deepEqual(counts, [800, 100, 100]);
  assert.deepEqual(TRAFFIC_PALETTES.map(palette => palette.length), [5, 3, 2]);
  for (const [choice, expected] of [[.79999, 0], [.8, 1], [.89999, 1], [.9, 2]]) {
    let draw = 0;
    assert.deepEqual(randomTrafficAppearance(() => draw++ === 0 ? choice : 0), { kind: expected, color: 0 });
  }
});

test('server owns appearance for initial cars and replacement spawns, preserving it during movement', () => {
  for (const [choice, kind] of [[.1, 0], [.85, 1], [.95, 2]]) {
    const state = new RaceState(), manager = new TrafficManager(state, () => choice);
    assert(state.trafficCars.size > 0);
    assert([...state.trafficCars.values()].every(car => car.kind === kind));
    manager.replace({ version: 1, laneWidth: 3.2,
      nodes: [{ id: 'start', x: 0, y: 0, z: 0, spawn: true }, { id: 'end', x: 200, y: 0, z: 0, despawn: true }],
      roads: [{ id: 'road', from: 'start', to: 'end', oneWay: true }] });
    manager.settings({ density: 1, spawnInterval: .25 });
    for (let tick = 0; tick < 120; tick++) manager.tick(.05);
    assert.equal(state.trafficCars.size, 1);
    const car = [...state.trafficCars.values()][0], appearance = { kind: car.kind, color: car.color }, startX = car.x;
    assert.equal(car.kind, kind);
    assert.equal(car.color, Math.floor(choice * TRAFFIC_PALETTES[kind].length));
    for (let tick = 0; tick < 20; tick++) manager.tick(.05);
    assert(car.x > startX);
    assert.deepEqual({ kind: car.kind, color: car.color }, appearance);
  }
});

test('low-poly models have finite merged geometry and distinct silhouettes and wheel sizes', () => {
  const heights: number[] = [];
  for (const kind of [0, 1, 2] as const) {
    const model = createTrafficModel(kind);
    let triangles = 0;
    const bounds = new THREE.Box3();
    for (const geometry of [model.paint, model.details, model.tire]) {
      for (const attribute of ['position', 'normal', 'color']) {
        assert(geometry.attributes[attribute]);
        assert(Array.from(geometry.attributes[attribute].array).every(Number.isFinite));
      }
      assert.equal(geometry.groups.length, 0, 'one draw call per merged mesh');
      triangles += geometry.attributes.position.count / 3 * (geometry === model.tire ? 4 : 1);
      if (geometry !== model.tire) bounds.union(geometry.boundingBox!);
    }
    const size = bounds.getSize(new THREE.Vector3());
    assert(size.x < 2.5 && size.z < 4.7);
    assert(triangles < 3000);
    heights.push(bounds.max.y);
    assert.equal(model.wheels.length, 4);
    if (kind === 2) assert(model.wheels[0].radius > model.wheels[1].radius * 1.5);
    for (const geometry of [model.paint, model.details, model.tire]) geometry.dispose();
  }
  assert(heights[1] < heights[0] && heights[0] < heights[2]);
});

test('renderer batches all three kinds, honors colors, spins wheels and cleans up every resource', () => {
  const scene = new THREE.Scene(), renderer = new TrafficRenderer(scene);
  const cars = new Map([0, 1, 2].map(kind => [`car-${kind}`, { kind, color: 1, x: kind * 6, y: 0, z: 0, rotY: 0, speed: 8 }]));
  renderer.patch({ serverTime: 1000, trafficCars: cars } as WorldState);
  renderer.render(1000);
  assert.equal(scene.children.length, 9);
  const matrix = new THREE.Matrix4();
  for (const kind of [0, 1, 2]) {
    const body = scene.children[kind * 3] as THREE.InstancedMesh;
    const wheels = scene.children[kind * 3 + 2] as THREE.InstancedMesh;
    assert.equal(body.count, 1); assert.equal(wheels.count, 4);
    const color = new THREE.Color(); body.getColorAt(0, color);
    const expected = new THREE.Color(TRAFFIC_PALETTES[kind][1]);
    assert(Math.abs(color.r - expected.r) + Math.abs(color.g - expected.g) + Math.abs(color.b - expected.b) < .00001);
  }
  const wheels = scene.children[2] as THREE.InstancedMesh;
  wheels.getMatrixAt(0, matrix); const before = matrix.clone();
  cars.get('car-0')!.z = 1;
  renderer.patch({ serverTime: 1100, trafficCars: cars } as WorldState); renderer.render(1100);
  wheels.getMatrixAt(0, matrix);
  assert.notDeepEqual(matrix.elements.slice(0, 12), before.elements.slice(0, 12));
  const stopped = matrix.clone(); renderer.render(1200); wheels.getMatrixAt(0, matrix);
  assert.deepEqual(matrix.elements, stopped.elements, 'wheels stop at the newest pose');
  cars.delete('car-1'); renderer.patch({ serverTime: 1300, trafficCars: cars } as WorldState); renderer.render(1300);
  assert.equal((scene.children[3] as THREE.InstancedMesh).count, 0);
  let geometriesDisposed = 0, materialsDisposed = 0;
  const materials = new Set<THREE.Material>();
  for (const object of scene.children) {
    const mesh = object as THREE.InstancedMesh;
    mesh.geometry.addEventListener('dispose', () => geometriesDisposed++);
    materials.add(mesh.material as THREE.Material);
  }
  for (const material of materials) material.addEventListener('dispose', () => materialsDisposed++);
  renderer.dispose();
  assert.equal(geometriesDisposed, 9); assert.equal(materialsDisposed, 2); assert.equal(scene.children.length, 0);
});

test('late-joining clients see the same server-owned traffic models and colors', { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const host = await client.create<WireState>('race', { name: 'Host', devMode: true }); rooms.push(host);
    await until(() => (host.state.trafficCars?.size ?? 0) > 0, 'initial traffic received');
    const guest = await client.joinById<WireState>(host.roomId, { name: 'Guest' }); rooms.push(guest);
    await until(() => (guest.state.trafficCars?.size ?? 0) > 0, 'late-joining client received traffic');
    let checked = 0;
    for (const [id, car] of host.state.trafficCars!) {
      const remote = guest.state.trafficCars!.get(id);
      if (!remote) continue;
      assert.deepEqual({ kind: remote.kind, color: remote.color }, { kind: car.kind, color: car.color });
      assert(car.kind! >= 0 && car.kind! <= 2);
      assert(car.color! >= 0 && car.color! < TRAFFIC_PALETTES[car.kind!].length);
      checked++;
    }
    assert(checked > 0);
  });
});
