import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Reflection } from '@colyseus/schema';
import { getMessageBytes, Protocol } from '@colyseus/core';
import * as C from '../packages/shared/src/index.ts';
import { Player, RaceState, TrafficCar, Vehicle } from '../apps/server/src/state.ts';
import { withServer, until, startRound } from './fixture.ts';
import { reportClient } from './reportClient.ts';

test('compact corrections retain exact transforms and save message bytes', () => {
  for (const vehicleId of ['', 'lime-1']) {
    const correction: C.PlayerCorrection = {
      x: -312.123456789, y: 471.123456789, z: 135.123456789,
      vx: -8.123456789, vy: 0, vz: 11.123456789,
      grounded: true, vehicleId, vehicleKind: vehicleId ? C.LIME_KIND : -1, seat: vehicleId ? 1 : -1,
    };
    const packed = C.packPlayerCorrection(correction);
    assert.deepEqual(C.unpackPlayerCorrection(packed), correction);
    assert.equal(C.unpackPlayerCorrection(correction), correction, 'offline object corrections still work');
    const oldBytes = getMessageBytes.raw(Protocol.ROOM_DATA, 'playerCorrection', correction);
    const bytes = getMessageBytes.raw(Protocol.ROOM_DATA, 'playerCorrection', packed);
    assert(bytes.byteLength < oldBytes.byteLength * .75, 'at least 25% fewer bytes for a typical correction');
  }
});

test('wire transforms have sub-millimeter accuracy without rounding server physics or sending player clocks', () => {
  const state = new RaceState(), deadline = Date.now() + 1500;
  const p = new Player({ x: -312.123456789, y: 471.123456789, z: 135.123456789,
    rotY: Math.PI - .0123456789, vx: -8.123456789, knockdownUntil: deadline, simTime: deadline - 500 });
  state.players.set('p', p);
  state.vehicles.set('v', new Vehicle({ x: p.x, y: p.y, z: p.z }));
  state.trafficCars.set('car', new TrafficCar({ x: p.x, y: p.y, z: p.z, rotY: p.rotY, speed: 12.123456789 }));
  const encoder = new Encoder(state), decoder = Reflection.decode(Reflection.encode(encoder));
  decoder.decode(encoder.encodeAll());
  const wire = decoder.state as RaceState;
  assert.equal(p.x, -312.123456789, 'server simulation is not quantized');
  for (const actual of [wire.players.get('p')!, wire.vehicles.get('v')!, wire.trafficCars.get('car')!])
    for (const axis of ['x', 'y', 'z'] as const) assert(Math.abs(actual[axis] - p[axis]) < .0001);
  assert.equal(wire.players.get('p')!.knockdownUntil, deadline, 'absolute deadlines retain millisecond precision');
  assert.equal(wire.players.get('p')!.simTime, undefined, 'shared server clock replaces replicated player clocks');
  encoder.discardChanges(); p.simTime += 1000;
  assert.equal(encoder.encode().byteLength, 0, 'clock-only player updates generate no patch');
});

test('live compact collision corrections keep two players separated with finite client clocks', { timeout: 15000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create('race', { name: 'A', devMode: true, skipIntro: true }); rooms.push(a);
    const b = await client.joinById(a.roomId, { name: 'B' }); rooms.push(b);
    for (const room of rooms) room.onMessage('*', () => {});
    await startRound(a, [a, b]);
    const first = reportClient(a), second = reportClient(b);
    try {
      const received: C.PlayerCorrectionMessage[] = [];
      b.onMessage<C.PlayerCorrectionMessage>('playerCorrection', message => received.push(message));
      await new Promise(resolve => setTimeout(resolve, 200));
      first.body.x = 0; first.body.z = 0; second.body.x = .2; second.body.z = 0;
      first.report(); second.report();
      await until(() => received.some(Array.isArray), 'compact player collision correction');
      const correction = C.unpackPlayerCorrection(received.find(Array.isArray)!);
      assert(Number.isFinite(correction.x) && Number.isFinite(correction.z));
      await until(() => {
        const p = a.state.players.get(a.sessionId)!, q = a.state.players.get(b.sessionId)!;
        return Math.hypot(p.x - q.x, p.z - q.z) >= 2 * C.CAPSULE_RADIUS - .005;
      }, 'collision separation is replicated');
      assert.equal(second.body.vehicleId, '');
      assert(Number.isFinite(second.body.simTime), 'headless client initializes from the shared clock');
    } finally { first.stop(); second.stop(); }
  });
});
