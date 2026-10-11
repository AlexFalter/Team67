import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Vector3 } from 'three';
import * as C from '../packages/shared/src/index.ts';

// NPC UI imports styles; this test exercises its real selection logic without rendering.
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { NpcFeature } = await import('../apps/client/src/npcPrototype/host.js');

test('NPC toolbar identifies Jane Street, limousine, Einstein and scooter actions without stacked E prefixes', () => {
  const npc = Object.create(NpcFeature.prototype);
  const body = C.createBody();
  Object.assign(npc, { local: { body }, position: new Vector3(), poly: new Map(), limo: { laptop: { position: new Vector3() }, state: () => ({ phase: 'idle', pickup: [100, 0, 100] }) } });
  assert.deepEqual(npc.interactionPrompt, { icon: 'computer', label: 'Use Jane Street computer' });
  npc.einstein = { near: () => 'E: TALK TO ALBERT EINSTEIN' };
  assert.deepEqual(npc.interactionPrompt, { icon: 'person', label: 'Talk to Albert Einstein' });
  npc.einstein = null; npc.limo.state = () => ({ phase: 'waiting', pickup: [0, 0, 0] });
  assert.equal(npc.interactionPrompt.label, 'Board your limousine');
  npc.limo.state = () => ({ phase: 'finished' }); npc.scooter = { canTalk: () => true };
  assert.equal(npc.interactionPrompt.label, 'Talk to the scooter riders');
  body.vehicleId = 'lime'; assert.equal(npc.interactionPrompt, null);
  body.vehicleId = ''; npc.scooter.canTalk = () => false;
  assert.equal(npc.interactionPrompt, null);
});

test('Polybahn passenger conversation takes E priority only when a passenger is reachable', () => {
  const npc = Object.create(NpcFeature.prototype), pair = { kid: {}, eater: {} };
  Object.assign(npc, { local: { body: { ...C.createBody(), vehicleId: 'poly' } }, position: new Vector3(), poly: new Map([['poly', pair]]), nearbyPolyPassenger: () => pair.kid });
  assert.deepEqual(npc.interactionPrompt, { icon: 'person', label: 'Talk to 6–7 kid' });
  npc.nearbyPolyPassenger = () => pair.eater;
  assert.equal(npc.interactionPrompt.label, 'Talk to food enthusiast');
  npc.nearbyPolyPassenger = () => null; assert.equal(npc.interactionPrompt, null);
});
