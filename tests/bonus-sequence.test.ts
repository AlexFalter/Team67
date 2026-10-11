import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import { createBody, examPortalPosition, examFlyoverPosition, FINAL_EXAM_LOCATION, examMapPoint } from '../packages/shared/src/index.ts';
import { ExamSequence, EXAM_FLYOVER_MS, emptyExamSession } from '../apps/client/src/exam/ExamSequence.ts';

async function withSequence(check: (harness: ReturnType<typeof createHarness>) => void | Promise<void>) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, strokeRect() {}, fillText() {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout } });
  const harness = createHarness();
  try {
    await check(harness);
  } finally {
    harness.sequence.dispose();
    assert.equal(harness.scene.children.length, 0);
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function createHarness() {
  const scene = new Scene(), camera = new PerspectiveCamera();
  camera.position.set(5, 6, 7);
  let session = { ...emptyExamSession };
  const sequence = new ExamSequence(scene, camera, value => { session = value; });
  const body = { ...createBody(), ...examPortalPosition, vx: 2 };
  return { scene, camera, sequence, body, session: () => session };
}

test('spectating cancels the room handoff and preserves the exam score and deadline', async () => {
  await withSequence(async ({ sequence, body, session }) => {
    sequence.update(body, true, true, 1, 30, 1000);
    sequence.update(body, true, true, 1, 26, 1000 + EXAM_FLYOVER_MS);
    sequence.spectate();
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(session().stage, 'spectate');
    sequence.complete(600);
    assert.equal(session().stage, 'spectate');
    sequence.update(body, true, false, 1, 23, 8000);
    sequence.returnToExam();
    assert.equal(session().stage, 'exam');
    assert.equal(session().score, 600);
    assert.equal(session().remainingSeconds, 23);
  });
});

test('terrace entrance orbits ETH, takes a seat, then opens the exam with the existing clock', async () => {
  await withSequence(async ({ camera, sequence, body, session }) => {
    const position = camera.position.clone();
    sequence.update(body, true, false, 1, 30, 1000);
    assert.equal(session().stage, 'world', 'paused players do not enter');
    assert(camera.position.equals(position));
    sequence.update(body, true, true, 1, 30, 1100);
    assert.equal(session().stage, 'flyover');
    assert(sequence.active);
    assert(!sequence.screenVisible);
    assert.equal(body.vx, 0);
    const start = examFlyoverPosition(0);
    assert(camera.position.equals(new Vector3(start.x, start.y, start.z)), 'orbit begins outside ETH, not at the player camera');

    sequence.update(body, true, true, 1, 28, 1100 + EXAM_FLYOVER_MS / 2);
    assert.equal(session().stage, 'flyover');
    assert(!camera.position.equals(position));
    const focus = examMapPoint(FINAL_EXAM_LOCATION.ethFocusLV95);
    assert(Math.abs(camera.position.y - focus.y - 100) < 0.001);
    assert(Math.abs(Math.hypot(camera.position.x - focus.x, camera.position.z - focus.z) - 105) < 0.001);
    const direction = camera.getWorldDirection(new Vector3());
    const towardsETH = new Vector3(focus.x, focus.y, focus.z).sub(camera.position).normalize();
    assert(direction.dot(towardsETH) > 0.999);

    sequence.update(body, true, true, 1, 26, 1100 + EXAM_FLYOVER_MS);
    assert.equal(session().stage, 'room');
    assert(!sequence.screenVisible);
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(session().stage, 'exam');
    assert(sequence.screenVisible);
    assert.equal(session().remainingSeconds, 26, 'the transition does not start a new countdown');
    sequence.complete(800);
    assert.equal(session().score, 800);
    assert.equal(session().stage, 'complete');
    sequence.returnToWorld();
    sequence.update(body, true, true, 1, 25, 6000);
    assert.equal(session().stage, 'world', 'each player can enter once per round');
    sequence.update(body, true, true, 2, 30, 7000);
    assert.equal(session().stage, 'flyover', 'the next round resets entry');
  });
});

test('an inside-building camera is moved outside before the first flyover frame', async () => {
  await withSequence(({ camera, sequence, body }) => {
    const focus = examMapPoint(FINAL_EXAM_LOCATION.ethFocusLV95);
    camera.position.set(focus.x, focus.y, focus.z);
    for (const progress of [0, .01, .1, .25, .5, .75]) {
      sequence.update(body, true, true, 1, 30 - progress * 4, 1000 + progress * EXAM_FLYOVER_MS);
      assert.equal(camera.position.y, focus.y + 100);
      assert(Math.abs(Math.hypot(camera.position.x - focus.x, camera.position.z - focus.z) - 105) < .001);
    }
  });
});

test('skip works during the orbit and seating; cancelled seating cannot reopen a later round', async () => {
  await withSequence(async ({ camera, sequence, body, session }) => {
    sequence.update(body, true, true, 1, 30, 1000);
    sequence.skipTransition();
    assert.equal(session().stage, 'exam');
    const position = camera.position.clone();
    sequence.update(body, true, true, 1, 29, 2000);
    assert(camera.position.equals(position), 'the orbit stops after skipping');

    sequence.update(body, true, true, 2, 30, 3000);
    sequence.update(body, true, true, 2, 26, 3000 + EXAM_FLYOVER_MS);
    assert.equal(session().stage, 'room');
    sequence.skipTransition();
    assert.equal(session().stage, 'exam');
    sequence.returnToWorld();
    sequence.update(body, false, false, 3, 30, 8000);
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(session().stage, 'world', 'the aborted room animation stays cancelled');
  });
});

test('round expiry opens the score screen without waiting for the intro', async () => {
  await withSequence(({ sequence, body, session }) => {
    sequence.update(body, true, true, 1, 2, 1000);
    sequence.update(body, true, true, 1, 0, 3000);
    assert.equal(session().stage, 'exam');
    assert(sequence.screenVisible);
    sequence.complete(100);
    sequence.update(body, false, false, 1, 0, 3100);
    assert.equal(session().stage, 'complete');
    assert.equal(session().score, 100);
  });
});
