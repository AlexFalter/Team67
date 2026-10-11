import test from 'node:test';
import assert from 'node:assert/strict';
import { stepScooterPursuit, flatWorld, zurichWorld, NPC_LAYOUT, type ScooterPursuit } from '../packages/shared/src/index.ts';
const start = (): ScooterPursuit => ({ x: 0, y: 0, z: 0, homeX: 0, homeZ: 0, heading: -Math.PI / 2, speed: 0, lean: 0, chasing: false, returning: false });

test('nearby scooter riders accelerate, steer toward the player and stop before contact', () => {
  const s = start(), player = { x: 9, y: 0, z: 0 };
  stepScooterPursuit(s, player, .05, flatWorld);
  assert.equal(s.chasing, true); assert.ok(s.speed > 0 && s.speed < 1, 'starts with acceleration');
  for (let i = 0; i < 100; i++) stepScooterPursuit(s, player, .05, flatWorld);
  assert.ok(s.x > 6 && s.x <= 6.35, 'follows and leaves a safe interaction gap');
  player.z = 6;
  for (let i = 0; i < 12; i++) stepScooterPursuit(s, player, .05, flatWorld);
  assert.ok(s.z > 0 && Math.abs(s.lean) > .001, 'turns and leans while chasing');
  assert.ok(Math.abs(s.lean) <= .15);
});

test('riders stay idle for distant players and return home when their player leaves the plaza', () => {
  const s = start(); stepScooterPursuit(s, { x: 18, y: 0, z: 0 }, .1, flatWorld);
  assert.equal(s.chasing, false); assert.equal(s.x, 0);
  for (let i = 0; i < 30; i++) stepScooterPursuit(s, { x: 10, y: 0, z: 0 }, .1, flatWorld);
  assert.ok(s.x > 4);
  for (let i = 0; i < 180; i++) stepScooterPursuit(s, { x: 40, y: 0, z: 0 }, .1, flatWorld);
  assert.equal(s.chasing, false); assert.ok(Math.hypot(s.x,s.z) <= .3);
  stepScooterPursuit(s, { x: 4, y: 5, z: 0 }, .1, flatWorld);
  assert.equal(s.chasing, false, 'a player on a different floor does not trigger pursuit');
});

test('scooter pursuit cannot cross walls, water or sudden terrain drops', () => {
  for (const obstacle of ['wall', 'water', 'drop']) {
    const s = start(), world = {
      height: (x: number) => x >= 1 && obstacle === 'water' ? undefined : x >= 1 && obstacle === 'drop' ? -3 : 0,
      blocked: (x: number) => x >= 1 && obstacle === 'wall',
    };
    for (let i = 0; i < 80; i++) stepScooterPursuit(s, { x: 10, y: 0, z: 0 }, .05, world);
    assert.ok(s.x < 1, obstacle); assert.equal(s.y, 0);
  }
});

test('independent plaza encounters follow their own player over real walkable terrain', () => {
  const [x,z] = NPC_LAYOUT.scooter.ridePoints.at(-1)!, y = zurichWorld.height(x,z)!;
  const a = { ...start(), x, y, z, homeX:x,homeZ:z }, b = { ...a };
  for (let i = 0; i < 60; i++) {
    stepScooterPursuit(a, { x:x+8,y,z }, .05, zurichWorld);
    stepScooterPursuit(b, { x,y,z:z+8 }, .05, zurichWorld);
    for (const state of [a,b]) {
      assert.equal(zurichWorld.blocked(state.x,state.y+.15,state.z,.65,3),false);
      assert.equal(state.y,zurichWorld.height(state.x,state.z));
    }
  }
  assert.ok(a.x > x+3 && b.z > z+3);
});
