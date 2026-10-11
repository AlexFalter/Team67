import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrafficManager } from '../apps/server/src/traffic.ts';
import { Player, RaceState, Vehicle } from '../apps/server/src/state.ts';
import { until, delay, withServer, type WireState } from './fixture.ts';

test('no car collisions prevents pedestrian and bike impacts and lets traffic cross parked vehicles; toggling restores impacts', () => {
  const state = new RaceState(), traffic = new TrafficManager(state, () => 0);
  traffic.replace({ version: 1, laneWidth: 3.2,
    nodes: [{ id: 'a', x: 100, y: 0, z: 100, spawn: true }, { id: 'b', x: 300, y: 0, z: 100, despawn: true }],
    roads: [{ id: 'road', from: 'a', to: 'b', oneWay: true, speed: 25 }] });
  traffic.settings({ density: 1, spawnInterval: .25 });
  for (let i = 0; i < 120; i++) traffic.tick(.05);
  const car = [...state.trafficCars.values()][0];
  const pedestrian = new Player({ x: car.x, y: car.y, z: car.z });
  state.players.set('pedestrian', pedestrian);
  const bike = new Vehicle({ kind: 2, x: car.x, y: car.y, z: car.z });
  state.vehicles.set('bike', bike);
  const obstacle = { ...car, speed: 0 };
  let hits = 0, bikeHits = 0;
  const hit = () => { hits++; }, hitBike = () => { bikeHits++; };
  const before = car.x;
  state.noCarCollisions = true;
  traffic.tick(.05, [obstacle], hit, () => true, hitBike);
  assert.equal(hits, 0); assert.equal(bikeHits, 0);
  assert(car.x > before, 'parked vehicles do not block traffic with collisions disabled');
  assert.equal(pedestrian.x, before); assert.equal(bike.fallenUntil, 0);
  pedestrian.x = bike.x = car.x;
  state.noCarCollisions = false;
  traffic.tick(.05, [], hit, () => true, hitBike);
  assert.equal(hits, 1); assert.equal(bikeHits, 1);
});

test('car collision setting defaults off, replicates and only accepts boolean updates from the host', { timeout: 20000 }, async () => {
  await withServer(async (client, rooms) => {
    const host = await client.create<WireState>('race', { name: 'Host', noCarCollisions: true }); rooms.push(host);
    const guest = await client.joinById<WireState>(host.roomId, { name: 'Guest' }); rooms.push(guest);
    await until(() => guest.state.noCarCollisions === true, 'initial collision setting');
    guest.send('carCollisionSettings', false);
    host.send('carCollisionSettings', 'false');
    await delay(150); assert.equal(host.state.noCarCollisions, true);
    host.send('carCollisionSettings', false);
    await until(() => guest.state.noCarCollisions === false, 'collisions restored for everyone');
    host.send('carCollisionSettings', true);
    await until(() => guest.state.noCarCollisions === true, 'collisions disabled for everyone');
    const normal = await client.create<WireState>('race', { name: 'Normal' }); rooms.push(normal);
    await until(() => normal.state.members?.size === 1, 'default room state');
    assert.equal(normal.state.noCarCollisions, false);
  });
});
