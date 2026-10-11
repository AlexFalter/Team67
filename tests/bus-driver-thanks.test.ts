import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import { RaceState, Player } from '../apps/server/src/state.ts';
import { RoundManager } from '../apps/server/src/round.ts';
import { ActivityFeed } from '../apps/client/src/multiplayer/activityFeed.ts';
import { withServer, until, delay, type WireState } from './fixture.ts';

test('only bus participants can thank once during the ride; new rounds reset thanks', () => {
  const state = new RaceState(), rounds = new RoundManager(state);
  for (const id of ['a', 'b']) { rounds.join(id, { name: id }); state.players.set(id, new Player()); }
  rounds.thankBusDriver('a', 0, 1000); assert.equal(state.members.get('a')!.thankedBusDriver, false);
  rounds.ready('a', true, 1000);
  const run = state.introStartedAt;
  rounds.thankBusDriver('a', run, run - 1); assert.equal(state.members.get('a')!.thankedBusDriver, false);
  rounds.thankBusDriver('a', String(run), run); assert.equal(state.members.get('a')!.thankedBusDriver, false);
  rounds.thankBusDriver('a', run, run); rounds.thankBusDriver('a', run, run + 100);
  assert.equal(state.members.get('a')!.thankedBusDriver, true);
  rounds.join('spectator', { name: 'Cam' }); rounds.thankBusDriver('spectator', run, run);
  assert.equal(state.members.get('spectator')!.thankedBusDriver, false);
  rounds.thankBusDriver('b', run, run + C.BATTLE_BUS_ARRIVAL_MS);
  assert.equal(state.members.get('b')!.thankedBusDriver, false, 'disembarking is too late to thank');
  rounds.tick(state.startedAt); rounds.finish(state.startedAt); rounds.restart('a');
  assert([...state.members.values()].every(member => !member.thankedBusDriver));
  rounds.ready('a', true, 50000); rounds.thankBusDriver('a', run, state.introStartedAt);
  assert.equal(state.members.get('a')!.thankedBusDriver, false, 'reject messages from an earlier round');
});

test('shared feed shows all thank-yous once and clears exactly ten seconds into gameplay', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const lines: { textContent: string }[] = [];
  const root = { hidden: true, append(line: { textContent: string }) { lines.push(line); },
    replaceChildren() { lines.length = 0; }, get childElementCount() { return lines.length; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelector: () => root, createElement: () => ({ textContent: '' }),
  } });
  try {
    const feed = new ActivityFeed(), state = new RaceState(), rounds = new RoundManager(state);
    for (const [id, name] of [['a', 'Ada'], ['b', '<Ben>']]) { rounds.join(id, { name }); state.players.set(id, new Player()); }
    rounds.ready('a', true, 1000);
    for (const id of ['a', 'b']) rounds.thankBusDriver(id, state.introStartedAt, state.introStartedAt);
    feed.updateBusDriverThanks(state, state.introStartedAt);
    assert.deepEqual(lines.map(line => line.textContent), ['Ada thanked the bus driver.', '<Ben> thanked the bus driver.']);
    feed.updateBusDriverThanks(state, state.introStartedAt + 100); assert.equal(lines.length, 2);
    rounds.tick(state.startedAt);
    feed.updateBusDriverThanks(state, state.startedAt + 9999); assert.equal(root.hidden, false);
    feed.updateBusDriverThanks(state, state.startedAt + 10000); assert.equal(root.hidden, true); assert.equal(lines.length, 0);
    feed.updateBusDriverThanks(state, state.startedAt + 11000); assert.equal(lines.length, 0, 'expired messages stay hidden');
    rounds.finish(state.startedAt + 11000); rounds.restart('a');
    feed.updateBusDriverThanks(state, state.startedAt); assert.equal(root.hidden, true);
    rounds.ready('a', true, 50000); rounds.thankBusDriver('a', state.introStartedAt, state.introStartedAt);
    feed.updateBusDriverThanks(state, state.introStartedAt); assert.equal(lines.length, 1, 'fresh round can thank again');
    feed.updateBusDriverThanks(undefined, 60000); assert.equal(root.hidden, true);
    feed.dispose();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('Colyseus replicates bus-driver thanks to both players and late spectators, then resets them', { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>('race', { name: 'Ada' }); rooms.push(a);
    const b = await client.joinById<WireState>(a.roomId, { name: 'Ben' }); rooms.push(b);
    await until(() => a.state.members?.size === 2 && b.state.members?.size === 2, 'both clients joined');
    a.send('thankBusDriver', 0); await delay(100);
    assert.equal(a.state.members.get(a.sessionId)!.thankedBusDriver, false);
    a.send('ready', true);
    await until(() => a.state.introStartedAt > 0 && b.state.introStartedAt > 0 && Date.now() >= a.state.introStartedAt, 'bus ride started');
    const run = a.state.introStartedAt;
    a.send('thankBusDriver', run); b.send('thankBusDriver', run);
    await until(() => [a, b].every(room => [a, b].every(player => room.state.members.get(player.sessionId)?.thankedBusDriver)), 'both clients see both thank-yous');
    a.send('thankBusDriver', run);
    const late = await client.joinById<WireState>(a.roomId, { name: 'Cam' }); rooms.push(late);
    await until(() => late.state.members?.get(a.sessionId)?.thankedBusDriver === true, 'late spectator sees prior thanks');
    assert.equal(late.state.members.get(a.sessionId)!.name, 'Ada');
    late.send('thankBusDriver', run); await delay(100);
    assert.equal(late.state.members.get(late.sessionId)!.thankedBusDriver, false);
    await until(() => a.state.introComplete, 'bus arrival');
    a.send('finishRound'); await until(() => a.state.phase === C.RoomPhase.Finished, 'finish');
    a.send('restartRound'); await until(() => [a, b, late].every(room => room.state.phase === C.RoomPhase.Lobby), 'reset');
    assert([a, b, late].every(room => [...room.state.members.values()].every(member => !member.thankedBusDriver)));
  }, 'flat', { BATTLE_BUS_INTRO_MS: '2000', BATTLE_BUS_LEAD_MS: '200' });
});
