import type { Room } from 'colyseus';
import type { RaceState } from '../apps/server/src/state.ts';
import { registerExamDebug } from '../apps/server/src/examDebug.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examPortalPosition, examDebugPosition, examMapPoint, FINAL_EXAM_LOCATION, insideExamPortal, examSecondsRemaining, zurichWorld } from '../packages/shared/src/index.ts';
import { withServer, until, startRound, delay } from './fixture.ts';

test('exam portal stays in LV95 coordinates and distinguishes the terrace from the underpass', () => {
  assert.deepEqual(examMapPoint(FINAL_EXAM_LOCATION.originLV95), { x: 0, y: 0, z: 0 });
  assert(insideExamPortal(examPortalPosition));
  assert(!insideExamPortal({ ...examPortalPosition, y: examPortalPosition.y - 8 }));
  assert(!insideExamPortal(examDebugPosition));
  for (const point of [examPortalPosition, examDebugPosition]) {
    const ground = zurichWorld.height(point.x, point.z)!;
    assert(Math.abs(ground - point.y) < 0.1, 'anchor sits on Polyterrasse');
    assert(!zurichWorld.blocked(point.x, ground, point.z, 0.5, 1.8), 'player can reach the anchor');
  }
});

test('exam clock uses the existing deadline, including time spent in the intro', () => {
  const deadline = 180000;
  assert.equal(examSecondsRemaining(deadline, 150000), 30);
  assert.equal(examSecondsRemaining(deadline, 154650), 25.35);
  assert.equal(examSecondsRemaining(deadline, 180100), 0);
});

test('debug teleport is server-confirmed, only works in an active round and leaves other players alone', { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create('race', { name: 'Portal tester', code: 'examtest' }); rooms.push(a);
    const b = await client.joinById(a.roomId, { name: 'Other player' }); rooms.push(b);
    await until(() => a.state.players.size === 2, 'both players');
    const own = () => a.state.players.get(a.sessionId)!;
    const initialX = own().x;
    a.send('debugTeleportToPolyterrasse'); await delay(100);
    assert.equal(own().x, initialX, 'lobby cannot teleport');
    await startRound(a, [a, b]);
    const other = a.state.players.get(b.sessionId)!;
    const otherPosition = { x: other.x, y: other.y, z: other.z };
    let correction = false;
    a.onMessage('playerCorrection', () => { correction = true; });
    a.send('debugTeleportToPolyterrasse');
    await until(() => correction && Math.abs(own().x - examDebugPosition.x) < 0.01, 'server teleport');
    assert(Math.abs(own().z - examDebugPosition.z) < 0.01);
    assert.deepEqual({ x: other.x, y: other.y, z: other.z }, otherPosition);
    await delay(80);
    const x = own().x + 0.05;
    a.send('move', [x, own().y, own().z, 0, 0, 0, 0, 0]);
    await until(() => Math.abs(own().x - x) < 0.01, 'movement accepted after teleport');
    a.send('debugTeleportToPolyterrasse', 'portal');
    await until(() => insideExamPortal(own()), 'direct portal shortcut');
    const spectator = await client.joinById(a.roomId, { name: 'Waiting player' }); rooms.push(spectator);
    spectator.onMessage('playerCorrection', () => assert.fail('spectator must not teleport'));
    spectator.send('debugTeleportToPolyterrasse', 'portal'); await delay(100);
    assert(!a.state.players.has(spectator.sessionId));
  }, 'zurich');
});


test('debug teleport handler is absent in production', () => {
  const previous = process.env.NODE_ENV;
  let registered = false;
  const room = { onMessage: () => { registered = true; } } as unknown as Room<{ state: RaceState }>;
  try {
    process.env.NODE_ENV = 'production';
    registerExamDebug(room, zurichWorld, new Map(), () => true);
    assert.equal(registered, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});
