import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import { BusRideControls } from '../apps/client/src/multiplayer/busRideControls.ts';

test('passenger mouse look follows the moving bus and clamps vertical viewing', () => {
 const input = new BusRideControls(); input.begin(1000);
 const bus = new Quaternion().setFromEuler(new Euler(.2, 1.4, -.1));
 assert(input.orientation(bus).angleTo(bus) < 1e-7);
 input.look(180, -100, .0025);
 assert(input.orientation(bus).angleTo(bus) > .1);
 const relative = input.orientation(bus).clone().premultiply(bus.clone().invert());
 const direction = new Vector3(0,0,-1).applyQuaternion(relative);
 assert(direction.x > 0 && direction.y > 0, 'look right and up inside bus coordinates');
 input.look(0, -10000, .0025); assert.equal(input.pitch, 1.25);
 input.look(0, 20000, .0025); assert.equal(input.pitch, -1.25);
 input.begin(1000); assert.equal(input.pitch, -1.25, 'network patches do not reset look');
 input.begin(2000); assert.equal(input.pitch, 0); assert.equal(input.yaw, 0);
});

test('thank driver emits once per ride and resets for the next round', () => {
 const input = new BusRideControls();input.begin(1000);
 assert.equal(input.thank(), true);assert.equal(input.thank(), false);
 input.begin(1000);assert.equal(input.thank(), false);
 input.begin(2000);assert.equal(input.hasThanked, false);assert.equal(input.thank(), true);
});
