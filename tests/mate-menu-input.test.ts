import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { PerspectiveCamera } from 'three';
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { MateFeature } = await import('../apps/client/src/multiplayer/mate.ts');

function fixture() {
  const mate = Object.create(MateFeature.prototype) as InstanceType<typeof MateFeature>;
  const camera = new PerspectiveCamera(), abort = new AbortController();
  let resumes = 0, cancellations = 0;
  Object.assign(mate, { modal: { hidden: false }, pending: true, abort, camera,
    savedView: { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov },
    net: { status: 'Connected', canPlay: true, room: { state: { startedAt: 123 }, send(type: string) { assert.equal(type, 'mate'); cancellations++; } } },
    resumeGameplay: () => resumes++,
  });
  return { mate, abort, counts: () => ({ resumes, cancellations }) };
}

test('closing Mate restores gameplay exactly once and cancels the reservation', () => {
  const { mate, counts } = fixture();
  mate.close();
  assert.equal(mate.active, false);
  assert.deepEqual(counts(), { resumes: 1, cancellations: 1 });
  mate.close();
  assert.deepEqual(counts(), { resumes: 1, cancellations: 1 });
});

test('Mate cleanup releases the reservation without recapturing gameplay', () => {
  const { mate, abort, counts } = fixture();
  abort.abort();
  mate.close();
  assert.equal(mate.active, false);
  assert.deepEqual(counts(), { resumes: 0, cancellations: 1 });
});
