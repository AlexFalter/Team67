import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withServer, until, type WireState } from './fixture.ts';

test('dev rooms skip the bus for all players, preserve round length and keep the setting on restart', { timeout: 20000 }, async () => {
 await withServer(async (client, rooms) => {
  const host = await client.create<WireState>('race', { name: 'Dev', devMode: true, skipIntro: true }); rooms.push(host);
  const guest = await client.joinById<WireState>(host.roomId, { name: 'Guest', devMode: false, skipIntro: false }); rooms.push(guest);
  await until(() => host.state?.members.size === 2 && guest.state?.members.size === 2, 'both members');
  guest.send('ready', true);
  await until(() => host.state.members.get(guest.sessionId)!.ready, 'guest ready');
  assert.equal(host.state.phase, 'Lobby', 'skip still requires the host to start');
  guest.send('ready', false);
  await until(() => !host.state.members.get(guest.sessionId)!.ready, 'guest unready');
  host.send('ready', true);
  await until(() => host.state.introComplete && guest.state.introComplete, 'shared immediate start');
  assert.equal(host.state.members.get(guest.sessionId)!.ready, false, 'unready guests participate too');
  for (const room of [host, guest]) {
   assert.equal(room.state.devMode, true); assert.equal(room.state.skipIntro, true);
   assert.equal(room.state.startedAt, room.state.introStartedAt);
   assert.equal(room.state.endsAt - room.state.startedAt, 60000);
   for (const player of room.state.players.values()) {
    assert(Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(player.z));
    assert.equal(player.vehicleId, '');
   }
  }
  host.send('finishRound');await until(() => host.state.phase === 'Finished', 'finish');
  host.send('restartRound');await until(() => host.state.phase === 'Lobby', 'restart');
  host.send('ready', true);guest.send('ready', true);
  await until(() => host.state.phase === 'Running' && host.state.introComplete, 'skip next round');
  assert.equal(host.state.skipIntro, true);
 }, 'flat', { BATTLE_BUS_INTRO_MS: '10000', BATTLE_BUS_LEAD_MS: '1000', ROUND_DURATION_MS: '60000' });
});

test('normal rooms cannot skip and dev mode can retain the opening animation', { timeout: 20000 }, async () => {
 await withServer(async (client, rooms) => {
  for (const devMode of [false, true]) {
   const room = await client.create<WireState>('race', { name: 'Tester', devMode, skipIntro: !devMode });rooms.push(room);
   await until(() => !!room.state?.members?.size, 'join');room.send('ready', true);
   await until(() => room.state.phase === 'Running', 'start');
   assert.equal(room.state.devMode, devMode);assert.equal(room.state.skipIntro, false);
   assert.equal(room.state.introComplete, false);
   assert.equal(room.state.startedAt-room.state.introStartedAt, 10000);
  }
 }, 'flat', { BATTLE_BUS_INTRO_MS: '10000', BATTLE_BUS_LEAD_MS: '1000' });
});

test('PubliBikes keep regular colors even with old gold settings and after reset', { timeout: 20000 }, async () => {
 await withServer(async (client, rooms) => {
  for (const goldPubliBikes of [undefined, false, true]) {
   const host = await client.create<WireState>('race', { name: 'Host', devMode: true, skipIntro: true, goldPubliBikes }); rooms.push(host);
   const guest = await client.joinById<WireState>(host.roomId, { name: 'Guest', goldPubliBikes: goldPubliBikes === false }); rooms.push(guest);
   await until(() => host.state?.members.size === 2 && guest.state?.members.size === 2, 'both members');
   assert.equal(host.state.goldPubliBikes, false);
   assert.equal(guest.state.goldPubliBikes, false);
   host.send('ready', true); guest.send('ready', true);
   await until(() => host.state.phase === 'Running', 'start');
   host.send('finishRound'); await until(() => host.state.phase === 'Finished', 'finish');
   host.send('restartRound'); await until(() => host.state.phase === 'Lobby', 'reset');
   assert.equal(host.state.goldPubliBikes, false);
  }
 }, 'flat');
});
