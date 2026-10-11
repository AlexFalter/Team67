import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Scene, Vector3, SkinnedMesh, Quaternion } from 'three';
import { BridgeCows } from '../apps/client/src/multiplayer/bridgeCows.ts';
import { bridgeCowPose, cowMooStart, MOOING_COW_IDS, zurichWorld } from '../packages/shared/src/index.ts';
import type { GameAudio } from '../apps/client/src/multiplayer/gameAudio.ts';

test('thirteen animated cow clones load, cue independent moos, and release their scene resources', async () => {
  const original = globalThis.fetch;
  const bytes = new Uint8Array(await readFile(new URL('../apps/client/public/models/animals/cow.glb', import.meta.url)));
  globalThis.fetch = async () => new Response(bytes);
  const scene = new Scene(), calls: number[] = [];
  const audio = { moo(id: number) { calls.push(id); } } as unknown as GameAudio;
  const cows = new BridgeCows(scene, audio);
  try {
    await cows.ready;
    assert.equal(scene.children.length, 13);
    const skeletons = new Set();
    scene.traverse(node => { if (node instanceof SkinnedMesh) skeletons.add(node.skeleton); });
    assert.ok(skeletons.size >= 13, 'every clone has an independent skeleton');
    cows.update(0, new Vector3(), true); assert.equal(calls.length, 0, 'loading does not trigger a chorus');
    const times = MOOING_COW_IDS.map(id => ({ id, now: cowMooStart(id, 0) + 801 })).sort((a, b) => a.now - b.now);
    for (const { id, now } of times) {
      const p = bridgeCowPose(id, now, zurichWorld);
      cows.update(now, new Vector3(p.x, p.y, p.z), true);
      assert.ok(scene.children[id].position.distanceTo(new Vector3(p.x, p.y, p.z)) < .0001);
    }
    assert.deepEqual([...calls].sort(), [...MOOING_COW_IDS].sort());
    cows.update(times.at(-1)!.now + 10, new Vector3(), true); assert.equal(calls.length, 8, 'a moo plays once across frames');
    cows.update(60000, new Vector3(), false); assert.equal(calls.length, 8, 'inactive gameplay is silent');
    const root = scene.children[0], hoof = root.getObjectByName('hoofFL')!, knee = root.getObjectByName('lowerFL')!;
    const heights: number[] = [], strides: number[] = [], knees: Quaternion[] = [];
    for (let now = 2000; now < 7000; now += 40) {
      cows.update(now, new Vector3(), false); scene.updateMatrixWorld(true);
      const foot = root.worldToLocal(hoof.getWorldPosition(new Vector3()));
      heights.push(foot.y); strides.push(foot.z); knees.push(knee.quaternion.clone());
    }
    assert.ok(Math.max(...heights) > .22, 'swinging hooves visibly clear the ground');
    assert.ok(Math.min(...heights) > .08, 'planted hooves stay above the ground');
    assert.ok(Math.max(...strides) - Math.min(...strides) > .48, 'the stride is visibly larger');
    assert.ok(knees.some(q => q.angleTo(knees[0]) > .5), 'knees flex rather than translating a rigid model');

    cows.update(8500, new Vector3(), false);
    const tail = root.getObjectByName('tail')!, stableTail = tail.quaternion.clone();
    for (let frame = 0; frame < 180; frame++) cows.update(8500, new Vector3(), false);
    assert.ok(tail.quaternion.angleTo(stableTail) < .0001, 'idle tail motion does not accumulate frame by frame');
    scene.updateMatrixWorld(true);
    assert.ok(new Vector3(0, 1, 0).applyQuaternion(tail.getWorldQuaternion(new Quaternion())).y < -.9, 'the tail hangs down while swaying');
    root.traverse(node => {
      if (!(node instanceof SkinnedMesh)) return;
      const p = node.geometry.getAttribute('position'), indices = node.geometry.getAttribute('skinIndex'), weights = node.geometry.getAttribute('skinWeight');
      const tailIndex = node.skeleton.bones.findIndex(b => b.name === 'tail');
      for (let i = 0; i < p.count; i++) if (p.getY(i) < .4) for (let slot = 0; slot < 4; slot++) {
        assert.ok(indices.getComponent(i, slot) !== tailIndex || weights.getComponent(i, slot) === 0, 'lower feet are never attached to the tail');
      }
    });
    const skins: SkinnedMesh[] = []; root.traverse(node => { if (node instanceof SkinnedMesh) skins.push(node); });
    const a = new Vector3(), b = new Vector3();
    for (let now = 0; now < 12000; now += 250) {
      cows.update(now, new Vector3(), false); scene.updateMatrixWorld(true);
      for (const skin of skins) {
        skin.skeleton.update();
        const p = skin.geometry.getAttribute('position'), index = skin.geometry.index!;
        for (let i = 0; i < index.count; i++) {
          const left = index.getX(i), right = index.getX(i % 3 === 2 ? i - 2 : i + 1);
          const rest = a.fromBufferAttribute(p, left).distanceTo(b.fromBufferAttribute(p, right));
          if (rest < .02) continue;
          const animated = skin.getVertexPosition(left, a).distanceTo(skin.getVertexPosition(right, b));
          assert.ok(animated < rest * 3, 'skin triangles must not stretch into long strips during turns, walking or idle');
        }
      }
    }

  } finally { cows.dispose(); globalThis.fetch = original; }
  assert.equal(scene.children.length, 0);
});
