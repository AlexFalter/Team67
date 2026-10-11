import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examPortalPosition, RoomPhase, ROUND_DURATION_MS, type ExamProgress } from '../packages/shared/src/index.ts';
import { Player, RaceState } from '../apps/server/src/state.ts';
import { RoundManager } from '../apps/server/src/round.ts';
import { buildings } from '../apps/client/src/minigames/eth-blur/buildings.ts';
import { EXAM_BUILDING_COUNT } from '../packages/shared/src/finalExam.ts';
import { withServer, until, startRound } from './fixture.ts';

function fixture() {
  const state = new RaceState();
  const rounds = new RoundManager(state, ROUND_DURATION_MS, undefined, undefined, { durationMs: 0, leadMs: 0 });
  rounds.join('player', { name: 'Student' });
  state.players.set('player', new Player(examPortalPosition));
  rounds.ready('player', true, 1000);
  const report = (score: number, correct: number, completed = false): ExamProgress => ({ roundStartedAt: state.startedAt, score, correct, completed });
  return { state, rounds, report };
}

test('exam score bounds match the deck and use the global three-minute deadline', () => {
  const { state } = fixture();
  assert.equal(buildings.length, EXAM_BUILDING_COUNT);
  assert.equal(state.endsAt - state.startedAt, 180000);
});

test('scores require server-confirmed portal entry and survive expiry without a final report', () => {
  const { state, rounds, report } = fixture();
  rounds.examProgress('player', report(1000, 1), 1100);
  rounds.beginExam('player', state.startedAt - 1, 1100);
  rounds.examProgress('player', report(1000, 1), 1100);
  rounds.beginExam('player', state.startedAt, 1200);
  rounds.examProgress('player', report(1000, 1), 1300);
  rounds.examProgress('player', report(1600, 2), 1400);
  rounds.examProgress('player', report(1600, 2), 1500);
  rounds.tick(state.endsAt);
  const result = state.results.get('player')!;
  assert.equal(result.examScore, 1600);
  assert.equal(result.examCorrect, 2);
  assert.equal(result.examStartedAt, 1200);
  assert.equal(result.examCompleted, true);
  rounds.examProgress('player', report(2600, 3, true), state.endsAt + 1);
  assert.equal(result.examScore, 1600, 'results remain frozen');
});

test('malformed, impossible, stale and spectator reports do not change exam scores', () => {
  const { state, rounds, report } = fixture();
  rounds.beginExam('player', state.startedAt, 1100);
  rounds.examProgress('player', report(800, 1), 1200);
  rounds.join('spectator', { name: 'Spectator' });
  rounds.beginExam('spectator', state.startedAt, 1200);
  rounds.examProgress('spectator', report(1000, 1), 1200);
  for (const invalid of [null, 1000, {}, report(-1, 1), report(20000, 2), report(2000, 3), report(801, 1),
    report(700, 1), report(900, 1), report(800, 0), report(1000, 1.5), report(NaN, 1),
    { ...report(1800, 2), roundStartedAt: state.startedAt - 1 }, { ...report(1800, 2), completed: 'true' }]) {
    rounds.examProgress('player', invalid, 1300);
  }
  rounds.finish(1400);
  assert.equal(state.results.get('player')!.examScore, 800);
  assert.equal(state.results.get('player')!.examCorrect, 1);
  assert(!state.results.has('spectator'));
});

test('completion locks scores, departed players retain them and a new round resets them', () => {
  const { state, rounds, report } = fixture();
  rounds.beginExam('player', state.startedAt, 1100);
  rounds.examProgress('player', report(1000, 1, true), 1200);
  rounds.examProgress('player', report(2000, 2), 1300);
  rounds.finish(1400);
  assert.equal(state.results.get('player')!.examScore, 1000);
  const stale = report(1000, 1);
  rounds.restart('player');
  rounds.ready('player', true, 2000);
  rounds.examProgress('player', stale, 2100);
  rounds.beginExam('player', state.startedAt, 2100);
  rounds.examProgress('player', report(600, 1), 2200);
  state.players.delete('player'); rounds.leave('player', 2300);
  assert.equal(state.phase, RoomPhase.Finished);
  assert.equal(state.results.get('player')!.examScore, 600);
});

test('entered exam participants keep their scores when spectating and returning to the exam', () => {
  const { state, rounds, report } = fixture();
  rounds.beginExam('player', state.startedAt, 1100);
  rounds.examProgress('player', report(1000, 1), 1200);
  state.players.delete('player');
  state.members.get('player')!.spectator = true;
  rounds.examProgress('player', report(1600, 2), 1300);
  rounds.tick(state.endsAt);
  assert.equal(state.results.get('player')!.examScore, 1600);
  assert.equal(state.results.get('player')!.examCorrect, 2);
});

test('remote entry or entry on a vehicle cannot submit exam points', () => {
  const { state, rounds, report } = fixture();
  const player = state.players.get('player')!;
  player.x += 100;
  rounds.beginExam('player', state.startedAt, 1100);
  player.x = examPortalPosition.x; player.vehicleId = 'cart';
  rounds.beginExam('player', state.startedAt, 1200);
  rounds.examProgress('player', report(1000, 1), 1300);
  rounds.finish(1400);
  assert.equal(state.results.get('player')!.examScore, 0);
  assert.equal(state.results.get('player')!.examStartedAt, 0);
});

test('live server retains progress at the global deadline and replicates it to all clients', { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const student = await client.create('race', { name: 'Exam student' }); rooms.push(student);
    const observer = await client.joinById(student.roomId, { name: 'Other student' }); rooms.push(observer);
    for (const room of rooms) room.onMessage('playerCorrection', () => {});
    await startRound(student, [student, observer]);
    student.send('debugTeleportToPolyterrasse', 'portal');
    await until(() => Math.abs(student.state.players.get(student.sessionId)!.x - examPortalPosition.x) < .01, 'portal entry');
    student.send('examStart', student.state.startedAt);
    student.send('examProgress', { roundStartedAt: student.state.startedAt, score: 1000, correct: 1, completed: false });
    student.send('examProgress', { roundStartedAt: student.state.startedAt, score: 1800, correct: 2, completed: false });
    await until(() => rooms.every(room => room.state.phase === RoomPhase.Finished && room.state.results.size === 2), 'global deadline results');
    for (const room of rooms) {
      const result = room.state.results.get(student.sessionId)!;
      assert.equal(result.examScore, 1800);
      assert.equal(result.examCorrect, 2);
      assert.equal(result.examCompleted, true);
      assert(result.examStartedAt >= room.state.startedAt);
      assert.equal(room.state.results.get(observer.sessionId)!.examScore, 0);
    }
  }, 'zurich', { ROUND_DURATION_MS: '2000' });
});
