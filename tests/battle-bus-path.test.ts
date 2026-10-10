import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as C from "@race/shared";
import { busCurve, busFlightProgress, busParkingHeading, busPathBlocked, busPathPose, battleBusPaths } from "../apps/client/src/multiplayer/battleBusPath.ts";

const originalHeading = C.BATTLE_BUS_HEADING + Math.PI;
const heading = originalHeading;
const forward = new THREE.Vector3(-Math.sin(originalHeading), 0, -Math.cos(originalHeading));
const right = new THREE.Vector3(Math.cos(originalHeading), 0, -Math.sin(originalHeading));
const origin = new THREE.Vector3(C.BATTLE_BUS_START.x, 0, C.BATTLE_BUS_START.z).addScaledVector(right, -4.05).addScaledVector(forward, -2.6);
origin.y = C.zurichWorld.height(origin.x, origin.z)!;

test("default arrival and departure clear the city grid with the bus footprint", () => {
  const paths = battleBusPaths(origin);
  for (const route of ["arrival", "departure"] as const) {
    const curve = busCurve(paths[route]);
    for (let i = 0; i <= 500; i++) {
      const { position, quaternion } = busPathPose(curve, i / 500, busParkingHeading(paths, originalHeading), route === "departure");
      assert.equal(busPathBlocked(position, quaternion), false, `${route} sample ${i}: ${position.toArray()}`);
      assert.ok(quaternion.toArray().every(Number.isFinite), "vertical flight never produces invalid orientation");
    }
  }
});

test("arrival and departure share the exact parking location and approach heading", () => {
  const paths = battleBusPaths(origin);
  const parked = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, busParkingHeading(paths, originalHeading), 0, "YXZ"));
  for (const [route, progress] of [["arrival", 1], ["departure", 0]] as const) {
    const p = busPathPose(busCurve(paths[route]), progress, busParkingHeading(paths, originalHeading), route === "departure");
    assert.ok(p.position.distanceTo(origin) < 1e-8);
    assert.ok(p.quaternion.angleTo(parked) < 1e-7);
  }
});

test("flight poses depend only on elapsed time, independent of previous frames", () => {
  const paths = battleBusPaths(origin);
  const curve = busCurve(paths.arrival);
  const first = busPathPose(curve, .43, heading);
  busPathPose(curve, .99, heading);
  const second = busPathPose(curve, .43, heading);
  assert.deepEqual(second.position.toArray(), first.position.toArray());
  assert.deepEqual(second.quaternion.toArray(), first.quaternion.toArray());
  assert.equal(busPathBlocked(new THREE.Vector3(0, -100, 0), new THREE.Quaternion()), true);
});


test("authored flight rounds bends without altitude reversals or sudden rotation", () => {
  const paths = battleBusPaths(origin), parking = busParkingHeading(paths, originalHeading);
  for (const route of ["arrival", "departure"] as const) {
    const curve = busCurve(paths[route]);
    const bounds = new THREE.Box3().setFromPoints(paths[route].map(p => new THREE.Vector3(...p)));
    let previous = busPathPose(curve, 0, parking, route === "departure");
    for (let i = 1; i <= 1000; i++) {
      const next = busPathPose(curve, busFlightProgress(i / 1000), parking, route === "departure");
      assert.ok(bounds.clone().expandByScalar(1e-7).containsPoint(next.position), "smoothing stays inside the guide-point envelope");
      assert.ok(route === "arrival" ? next.position.y <= previous.position.y + 1e-7 : next.position.y >= previous.position.y - 1e-7, "no bobbing during descent or climb");
      assert.ok(next.quaternion.angleTo(previous.quaternion) < .015, "heading changes remain gradual, including takeoff");
      previous = next;
    }
    const epsilon = .001;
    const nearStart = curve.getPointAt(busFlightProgress(epsilon)).distanceTo(curve.getPointAt(0));
    const nearEnd = curve.getPointAt(busFlightProgress(1 - epsilon)).distanceTo(curve.getPointAt(1));
    assert.ok(nearStart < .001 && nearEnd < .001, "launch and stop ease to zero speed");
  }
  const arrival = busPathPose(busCurve(paths.arrival), 1, parking);
  const departure = busPathPose(busCurve(paths.departure), 0, parking, true);
  assert.ok(arrival.position.distanceTo(departure.position) < 1e-8);
  assert.ok(arrival.quaternion.angleTo(departure.quaternion) < 1e-7, "no snap between arrival, parked cabin, and departure");
});

test("short routes and vertical approaches have finite, stable poses", () => {
  for (const points of [[[0, 20, 0], [0, 0, 0]], [[0, 20, 0], [0, 10, 0], [0, 0, 0]]]) {
    const curve = busCurve(points);
    assert.deepEqual(curve.getPointAt(0).toArray(), points[0]);
    assert.deepEqual(curve.getPointAt(1).toArray(), points.at(-1));
    for (let i = 0; i <= 100; i++) {
      const pose = busPathPose(curve, i / 100, heading);
      assert.ok([...pose.position.toArray(), ...pose.quaternion.toArray()].every(Number.isFinite));
      assert.ok(pose.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0))) < 1e-7);
    }
  }
});
