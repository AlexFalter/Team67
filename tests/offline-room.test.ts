import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as C from '@race/shared';
import { OfflineRoom } from '../apps/client/src/multiplayer/offlineRoom.ts';

test('offline room starts immediately and remains playable without a round deadline', async () => {
  const room = new OfflineRoom(3);
  assert.equal(room.state.phase, C.RoomPhase.Running);
  assert.equal(room.state.introComplete, true);
  assert.equal(room.state.adminMode, true);
  assert.equal(room.state.endsAt, Number.MAX_SAFE_INTEGER);
  assert.equal(room.state.players.get(room.sessionId)!.character, 3);
  room.tick(Date.now() + 86400000);
  assert.equal(room.state.phase, C.RoomPhase.Running);
  let patches = 0;
  room.onStateChange(() => patches++);
  room.start(); assert.equal(patches, 1);
  await room.leave();
  room.send('uiTools'); room.tick();
  assert.equal(patches, 1, 'disposed rooms emit nothing and ignore commands');
});

test('offline shortcuts use real Mate, ticket and bike replies; closing releases reservations', async () => {
  const room = new OfflineRoom();
  try {
    room.send('uiTeleport', 'mate');
    assert(C.nearMate(room.state.players.get(room.sessionId)!, C.zurichWorld));
    let reply: C.MateResult | undefined;
    room.onMessage<C.MateResult>('mateResult', result => { reply = result; });
    room.send('mate', { action: 'select', flavor: 0, roundStartedAt: room.state.startedAt });
    assert.equal(reply?.ok, true);
    assert.equal(room.state.mates.get(room.sessionId)!.phase, 'payment');
    room.send('mate', { action: 'close', roundStartedAt: room.state.startedAt });
    assert.equal(room.state.mates.get(room.sessionId)!.phase, 'idle');
    room.send('uiTeleport', 'ticket');
    assert(C.nearTicket(room.state.players.get(room.sessionId)!, C.zurichWorld));
    room.send('ticket', { action: 'pay', tiles: [0, 4, 8], roundStartedAt: room.state.startedAt });
    assert(room.state.npcs.get(room.sessionId)!.ticketReadyAt > Date.now());
    room.send('uiTeleport', 'bikes');
    let bikeReply: C.BikeUnlockResult | undefined;
    room.onMessage<C.BikeUnlockResult>('bikeUnlockResult', result => { bikeReply = result; });
    room.send('bikeScanBegin', { bikeId: 'publibike-4', requestId: 'offline-scan' });
    assert.equal(bikeReply?.ok, true);
    assert(bikeReply?.token);
    room.send('bikeScanCancel', { bikeId: 'publibike-4', requestId: 'offline-scan' });
    assert.equal(room.state.publiBikes.get('publibike-4')!.reservedBy, '');
  } finally { await room.leave(); }
});

test('offline item grants, Moodle and encounter reset preserve an unlimited playable world', async () => {
  const room = new OfflineRoom();
  try {
    room.send('uiTools');
    const player = room.state.players.get(room.sessionId)!;
    assert.equal(player.karambitOwned, true); assert.equal(player.emotesUnlocked, true); assert.equal(player.mateCount, 5);
    assert.equal(room.state.footballs.get(`football-${room.sessionId}`)!.owner, room.sessionId);
    room.send('uiMoodle');
    assert(room.state.moodleEventId > 0); assert(room.state.moodleDeadline > Date.now());
    room.send('uiReset');
    assert.equal(room.state.phase, C.RoomPhase.Running);
    assert.equal(room.state.players.get(room.sessionId)!.karambitOwned, false);
    assert.equal(room.state.npcs.get(room.sessionId)!.teleportUsed, false);
    assert.equal(room.state.footballs.size, 0);
    assert.equal(room.state.publiBikes.get('publibike-4')!.broken, false);
    assert.equal(room.state.endsAt, Number.MAX_SAFE_INTEGER);
  } finally { await room.leave(); }
});

test('offline viewer previews real player identities and bus thanks, then resets instantly', async () => {
  const room = new OfflineRoom();
  try {
    room.send('uiPlayers');
    assert(room.state.players.size > 5);
    assert.equal(room.state.players.size, room.state.members.size);
    room.send('uiBus');
    assert.equal(room.state.introComplete, false);
    assert.equal(room.state.skipIntro, false);
    room.send('thankBusDriver', room.state.introStartedAt);
    assert.equal(room.state.members.get(room.sessionId)!.thankedBusDriver, true);
    room.send('uiReset');
    assert.equal(room.state.introComplete, true);
    assert.equal(room.state.skipIntro, true);
    assert.equal(room.state.players.size, 1);
    assert.equal(room.state.members.size, 1);
    assert.equal(room.state.endsAt, Number.MAX_SAFE_INTEGER);
  } finally { await room.leave(); }
});

test('offline viewer uses the new tomato manager and resets its stock with the live game rules', async () => {
  const room = new OfflineRoom();
  try {
    room.send('uiTeleport', 'fruit');
    let stock = 0;
    room.onMessage<C.TomatoEvent>('tomatoEvent', event => { if (event.kind === 'stock') stock = event.count ?? 0; });
    room.send('fruit', { action: 'take', roundStartedAt: room.state.startedAt });
    assert.equal(stock, 1, 'each pickup grants one tomato');
    assert.equal(room.state.fruitStock, C.TOMATO_STAND_SUPPLY - 1);
    for(let i=1;i<C.TOMATO_CAPACITY;i++)room.send('fruit',{action:'take',roundStartedAt:room.state.startedAt});
    assert.equal(stock,C.TOMATO_CAPACITY);
    assert.equal(room.state.fruitStock,C.TOMATO_STAND_SUPPLY-C.TOMATO_CAPACITY);
    room.send('uiReset');
    assert.equal(room.state.fruitStock, C.TOMATO_STAND_SUPPLY);
  } finally { await room.leave(); }
});
