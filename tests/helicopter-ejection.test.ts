import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
// @ts-expect-error Prototype animation module is JavaScript.
import { helicopterEjectionPose, EJECTION_DURATION } from '../apps/client/src/npcPrototype/src/npcs/interview/helicopter-ejection.js';

test('helicopter throw starts at the occupied seat, clears the local side door and preserves downward velocity', () => {
  for (const yaw of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
    const origin = new THREE.Vector3(20, 70, -100), orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yaw);
    const seat = new THREE.Vector3(-.58,.25,1.12).applyQuaternion(orientation).add(origin);
    assert(helicopterEjectionPose(0,seat,origin,orientation).position.distanceTo(seat)<1e-9);
    const exit = helicopterEjectionPose(.35,seat,origin,orientation).position.clone().sub(origin).applyQuaternion(orientation.clone().invert());
    assert(Math.abs(exit.x-1.65)<1e-9);assert(Math.abs(exit.z-.8)<1e-9);
    const end = helicopterEjectionPose(EJECTION_DURATION,seat,origin,orientation);
    const before = helicopterEjectionPose(EJECTION_DURATION-.0001,seat,origin,orientation);
    assert(Math.abs((before.position.y-end.position.y)/.0001-end.fallSpeed)<.001);
    assert(end.fallSpeed>7);assert(Math.abs(end.roll)<1e-9,'no upside-down reset at the parachute transition');
    const localEnd = end.position.clone().sub(origin).applyQuaternion(orientation.clone().invert());
    assert(localEnd.x>6,'throw travels away from the cabin regardless of helicopter heading');
  }
});
