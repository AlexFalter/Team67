import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../apps/client/src/multiplayer/gameAudio.ts';

test('nearby and middle-distance moos are audible, overlap, and respect pause/mute', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  const levels: number[] = [], starts: number[] = [];
  const context = {
    state: 'running', currentTime: 1,
    createGain: () => ({ gain: { set value(value: number) { levels.push(value); } }, connect() {}, disconnect() {} }),
    createBiquadFilter: () => ({ frequency: { value: 0 }, Q: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({ playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() { starts.push(1); } }),
  };
  const audio = Object.create(GameAudio.prototype) as GameAudio;
  Object.assign(audio, { context, master: {}, buffers: new Map([['cow-moo', {}]]), cooldowns: new Map(), shots: new Set(), paused: false, settings: { vehicleSounds: true } });
  try {
    audio.moo(0, 3); audio.moo(1, 30);
    assert.equal(starts.length, 2, 'two cows can call together');
    assert.ok(levels[0] > .8 && levels[1] > .45, 'moos carry across the bridge instead of fading to near silence');
    audio.moo(2, 66); assert.equal(starts.length, 2, 'faraway cows stay out of hearing range');
    Object.assign(audio, { paused: true }); audio.moo(3, 0); assert.equal(starts.length, 2);
    Object.assign(audio, { paused: false }); audio.settings.vehicleSounds = false;
    audio.moo(4, 0); assert.equal(starts.length, 2, 'the game sound setting still works');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
