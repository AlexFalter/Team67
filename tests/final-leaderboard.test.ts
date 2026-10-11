import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import { Player, RaceState } from '../apps/server/src/state.ts';
import { RoundManager } from '../apps/server/src/round.ts';
import { rankedResults } from '../apps/client/src/multiplayer/roomFlow.ts';

test('final score: ETH arrivals are above 0 with exam points on top, the rest get 1000 minus their metres to ETH', () => {
  assert.equal(C.finalScore({ examStartedAt: 1, examScore: 0, distanceToEth: 0 }), C.ETH_ARRIVAL_POINTS);
  assert.equal(C.finalScore({ examStartedAt: 1, examScore: 650, distanceToEth: 0 }), C.ETH_ARRIVAL_POINTS + 650);
  assert.equal(C.finalScore({ examStartedAt: 0, examScore: 0, distanceToEth: 40.4 }), 960);
  assert.equal(C.finalScore({ examStartedAt: 0, examScore: 0, distanceToEth: 1412.4 }), -412);
});

test('an ETH arrival with no exam points ranks above a player at the entrance who never entered', () => {
  const result = (name: string, examStartedAt: number) => ({ name, hitsLanded: 0, hitsReceived: 0, examScore: 0, examCorrect: 0, examCompleted: false, examStartedAt, distanceToEth: 0 });
  const ranked = rankedResults(new Map([['outside', result('A outside', 0)], ['inside', result('B inside', 1)]]));
  assert.deepEqual(ranked.map(([id]) => id), ['inside', 'outside']);
});

test('the server records distance to ETH at the end and the leaderboard ranks ETH arrivals first', () => {
  const state = new RaceState();
  const rounds = new RoundManager(state, C.ROUND_DURATION_MS, undefined, undefined, { durationMs: 0, leadMs: 0 });
  const portal = C.examPortalPosition;
  for (const [id, name] of [['exam', 'Exam'], ['lazy', 'Lazy'], ['near', 'Near'], ['far', 'Far'], ['gone', 'Gone']]) rounds.join(id, { name });
  for (const id of ['exam', 'lazy']) state.players.set(id, new Player(portal));
  state.players.set('near', new Player({ ...portal, x: portal.x + 30, z: portal.z + 40 }));
  state.players.set('far', new Player({ ...portal, x: portal.x + 300 }));
  state.players.set('gone', new Player(portal));
  rounds.ready('exam', true, 1000);
  for (const id of ['exam', 'lazy']) rounds.beginExam(id, state.startedAt, 1100);
  rounds.examProgress('exam', { roundStartedAt: state.startedAt, score: 800, correct: 1, completed: false }, 1200);
  state.players.delete('gone'); // left mid-round: counted from the bus drop-off
  rounds.finish(1400);

  const r = (id: string) => state.results.get(id)!;
  assert.equal(r('exam').distanceToEth, 0);
  assert.equal(r('near').distanceToEth, 50);
  assert.equal(r('far').distanceToEth, 300);
  assert.equal(r('gone').distanceToEth, Math.round(C.distanceToEth(C.BATTLE_BUS_START)));
  assert.deepEqual(rankedResults(state.results).map(([id, result]) => [id, C.finalScore(result)]), [
    ['exam', C.ETH_ARRIVAL_POINTS + 800],
    ['lazy', C.ETH_ARRIVAL_POINTS],
    ['near', 950],
    ['far', 700],
    ['gone', 1000 - r('gone').distanceToEth],
  ]);
});
