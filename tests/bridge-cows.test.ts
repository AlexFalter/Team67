import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../apps/server/src/race.ts';
import { Player, RaceState } from '../apps/server/src/state.ts';
import type { Client } from 'colyseus';
import * as C from '../packages/shared/src/index.ts';

test('thirteen cows wander visibly on the real bridge, stay separated and use deterministic poses', () => {
  assert.equal(C.BRIDGE_COWS.length, 13);
  for (let time = 0; time < 360000; time += 1000) {
    const poses = C.BRIDGE_COWS.map(({ id }) => C.bridgeCowPose(id, time, C.zurichWorld));
    for (let id = 0; id < 13; id++) {
      const p = poses[id], next = C.bridgeCowPose(id, time + 1000, C.zurichWorld);
      assert.deepEqual(p, C.bridgeCowPose(id, time, C.zurichWorld));
      assert.equal(C.zurichWorld.blocked(p.x, p.y, p.z, 1, 1.5), false);
      assert.ok(p.y > 8 && p.y < 9, 'cows stay on the bridge deck');
      assert.ok(Math.hypot(next.x - p.x, next.z - p.z) < 1.65, 'bounded faster walking speed');
      for (let other = id + 1; other < 13; other++) assert.ok(Math.hypot(p.x - poses[other].x, p.z - poses[other].z) >= 3.19);
    }
  }
});

test('wandering uses varied directions and crosses the bridge sideways', () => {
  const headings = new Set<number>(), zs: number[] = [];
  for (let now = 0; now < 360000; now += 12000) {
    const pose = C.bridgeCowPose(0, now + 4500, C.zurichWorld);
    headings.add(Math.floor((pose.rotY + Math.PI) / (Math.PI / 4)));
    zs.push(pose.z);
  }
  assert.ok(headings.size >= 5, 'routes are not alternating forwards and backwards');
  assert.ok(Math.max(...zs) - Math.min(...zs) > 2, 'sideways wandering is visible');
});

test('cow moos vary independently around 30 seconds and tolerate late joins', () => {
  const intervals = new Set<number>();
  for (const id of C.MOOING_COW_IDS) for (let slot = 0; slot < 100; slot++) {
    const at = C.cowMooStart(id, slot), next = C.cowMooStart(id, slot + 1), interval = next - at;
    assert.ok(interval >= 20000 && interval <= 40000);
    intervals.add(Math.round(interval));
    assert.equal(C.cowMooAge(id, at + 800).slot, slot);
    assert.ok(Math.abs(C.cowMooAge(id, at + 800).age - 800) < .001);
  }
  assert.ok(intervals.size > 100, 'independent randomized intervals');
});

test('exactly eight cows moo, with enough space between every recording', () => {
  assert.equal(C.MOOING_COW_IDS.length, 8);
  const times = [];
  for (let slot = 0; slot < 100; slot++) for (let id = 0; id < 13; id++) {
    const time = C.cowMooStart(id, slot);
    if (Number.isFinite(time)) times.push(time);
    else assert.equal(C.cowMooAge(id, slot * 30000).age, Infinity);
  }
  times.sort((a,b) => a-b);
  assert.equal(times.length, 800);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i-1] >= 2950, 'moos are staggered even across the half-minute boundary');
});

test('cow bodies block walkers, sprinting and vehicles without moving the cow or blocking elevated players', () => {
  const now = 1700000000000, cow = C.bridgeCowPose(0, now, C.zurichWorld);
  assert.equal(C.bridgeCowBlocked(cow.x, cow.y, cow.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT, now, C.zurichWorld), true);
  assert.equal(C.bridgeCowBlocked(cow.x, cow.y + 2, cow.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT, now, C.zurichWorld), false);
  assert.equal(C.bridgeCowBlocked(cow.x, cow.y, cow.z, 1, 2, now, C.flatWorld), false);
  const p = C.createBody(); Object.assign(p, cow, { vx: 5, vz: 3 });
  C.resolveBridgeCows(p, now, C.zurichWorld, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT);
  assert.equal(C.bridgeCowBlocked(p.x, p.y, p.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT, now, C.zurichWorld), false);
  assert.deepEqual(cow, C.bridgeCowPose(0, now, C.zurichWorld), 'contact cannot alter a cow');
  for (const riding of [false, true]) {
    const body = C.createBody(); Object.assign(body, { x: cow.x - 5, y: C.zurichWorld.height(cow.x - 5, cow.z), z: cow.z, simTime: now });
    if (riding) Object.assign(body, { vehicleId: 'bike', vehicleKind: 2, seat: 0, y: body.y + C.BIKE_SEAT_HEIGHT });
    for (let i = 0; i < 40; i++) {
      C.stepPlayer(body, { ...C.IDLE_INPUT, x: 1, sprint: true }, .05, C.zurichWorld);
      assert.equal(C.bridgeCowBlocked(body.x, riding ? body.y - C.BIKE_SEAT_HEIGHT : body.y, body.z, riding ? .65 : C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT, body.simTime, C.zurichWorld), false);
    }
    assert.ok(body.x < cow.x + 1, 'movement cannot pass through the cow');
  }
});


test('fast crossings are swept and two client reports cannot move cows or bypass server collision', () => {
  const now = Date.now(), cow = C.bridgeCowPose(0, now, C.zurichWorld);
  const nx = Math.cos(cow.rotY), nz = -Math.sin(cow.rotY);
  const from = { x: cow.x - nx * 2, y: cow.y, z: cow.z - nz * 2 };
  const x = cow.x + nx * 2, z = cow.z + nz * 2;
  assert.equal(C.bridgeCowBlocked(x, cow.y, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT, now, C.zurichWorld), false);
  assert.equal(C.bridgeCowSweepBlocked(from, x, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT, now, C.zurichWorld), true, 'blocks tunneling even with clear endpoints');
  const state = new RaceState(), corrections: string[] = [];
  const race = Object.create(Race.prototype) as Race;
  Object.defineProperty(race, "state", { value: state });
  Object.assign(race, { world: C.zurichWorld, rounds: { canPlay: () => true }, npcs: { busy: () => false }, lastMoves: new Map([['a', now - 500], ['b', now - 500]]) });
  for (const sessionId of ['a', 'b']) {
    state.players.set(sessionId, new Player(from));
    const client = { sessionId, send: (type: string) => corrections.push(type) } as unknown as Client;
    (race as unknown as { move(client: Client, data: unknown): void }).move(client, [x, cow.y, z, 0, 20, 0, 0, 1]);
    assert.equal(state.players.get(sessionId)!.x, from.x);
    assert.equal(state.players.get(sessionId)!.z, from.z);
  }
  assert.deepEqual(corrections, ['playerCorrection', 'playerCorrection']);
  assert.deepEqual(cow, C.bridgeCowPose(0, now, C.zurichWorld));
});
