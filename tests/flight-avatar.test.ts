import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CHARACTERS, avatar, disposeAvatar} from '../apps/client/src/multiplayer/avatar.ts';
import {createFlightAvatar} from '../apps/client/src/multiplayer/flightAvatar.ts';

test('flight scenes use every selected character and hide only the head in first person', () => {
  for (let character = 0; character < CHARACTERS.length; character++) {
    const scene = new THREE.Group(), rig = createFlightAvatar(() => ({color:'#123456', character}));
    const player = rig.start(scene);
    assert.equal(player.name, CHARACTERS[character]);
    rig.pose(.5, false, false);
    assert.equal(player.getObjectByName('head')!.visible, true);
    assert.ok(player.getObjectByName('left-arm')!.rotation.x < -1);
    rig.pose(0, true, true);
    assert.equal(player.getObjectByName('head')!.visible, false);
    assert.equal(player.getObjectByName('torso')!.visible, true);
    assert.equal(player.getObjectByName('left-arm')!.rotation.x, -2.6);
    rig.pose(0, true, false);
    assert.equal(player.getObjectByName('head')!.visible, true);
    rig.reset(); assert.equal(player.visible, false);
    rig.dispose(); assert.equal(scene.children.length, 0);
  }
});

test('appearance is read at scene start and replacing the rig preserves shared avatar geometry', () => {
  let character = 0;
  const scene = new THREE.Group(), rig = createFlightAvatar(() => ({color:'#123456', character}));
  character = 2;
  const einstein = rig.start(scene);
  assert.equal(einstein.name, CHARACTERS[2]);
  rig.reset(); assert.equal(rig.start(scene), einstein);
  const normal = avatar('#ffffff', 2), geometry = (normal.getObjectByName('shoe') as THREE.Mesh).geometry;
  let disposed = false; geometry.addEventListener('dispose', () => {disposed = true;});
  character = 1;
  const replacement = rig.start(scene);
  assert.equal(replacement.name, CHARACTERS[1]); assert.equal(einstein.parent, null);
  assert.equal(scene.children.length, 1); assert.equal(disposed, false);
  rig.dispose(); assert.equal(disposed, false); disposeAvatar(normal);
});

test('parachute touchdown bends the knees and settles into a neutral standing pose', () => {
  const scene = new THREE.Group(), rig = createFlightAvatar(() => ({color:'#ffffff',character:0}));
  const player = rig.start(scene);
  player.position.y = 10;
  rig.land(.5,true);
  assert.equal(player.getObjectByName('head')!.visible,false);
  assert(player.getObjectByName('left-knee')!.rotation.x>.4);
  assert(player.position.y<10);
  player.position.y = 10;
  rig.land(1,false);
  assert.equal(player.getObjectByName('head')!.visible,true);
  for(const name of ['left-arm','right-arm','left-knee','right-knee','left-leg','right-leg'])assert(Math.abs(player.getObjectByName(name)!.rotation.x)<1e-9);
  assert.equal(player.position.y,10);
  rig.dispose();
});
