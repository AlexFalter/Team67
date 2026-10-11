import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import * as C from "../packages/shared/src/index.ts";
import { avatar, pose, disposeAvatar, firstPersonBodyVisible } from "../apps/client/src/multiplayer/avatar.ts";
import { PlayerView } from "../apps/client/src/multiplayer/view.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { VehicleManager } from "../apps/server/src/vehicles.ts";

test("a car striking a bike ejects the rider in the car's direction with vehicle severity", () => {
  const state = new RaceState(), manager = new VehicleManager(state);
  let offset = 100;
  for (const v of state.vehicles.values()) { v.x = offset; v.z = 100; offset += 100; }
  const bike = state.vehicles.get("bike-1")!, car = state.vehicles.get("npc-car")!;
  Object.assign(bike, { x: 0, z: 0, driver: "rider", rotY: Math.PI });
  Object.assign(car, { x: -.5, z: 0, vx: 10, vz: 0 });
  state.players.set("rider", new Player({ vehicleId: "bike-1", vehicleKind: 2 }));
  const hits: C.Impulse[] = [];
  manager.bikeContacts(1000, (from, target, _x, _y, _z, ix, iy, iz, down, kind) => {
    assert.equal(target, "rider"); assert.equal(kind, 3);
    hits.push(C.collisionImpact(from, ix, iy, iz, "vehicle", down));
  });
  assert.equal(hits.length, 1); assert.equal(hits[0].from, "npc-car");
  assert.ok(hits[0].ix > 0 && Math.abs(hits[0].iz) < 1e-6);
  assert.ok(hits[0].durationMs! > 2300); assert.equal(bike.driver, "");
});

test("collision severity shares bounded impulses and short-to-long recovery across sources", () => {
  const light = C.collisionImpact("player", 8, 1.5, 0), bike = C.collisionImpact("bike", 8, 2, 0, "bike");
  const car = C.collisionImpact("car", 22, 4, 0, "vehicle"), extreme = C.collisionImpact("car", 1000, 30, 1000, "vehicle");
  assert.ok(light.durationMs! >= 1000 && light.durationMs! <= 2000);
  assert.ok(bike.durationMs! > light.durationMs! && car.durationMs! > bike.durationMs!);
  assert.ok(Math.hypot(extreme.ix, extreme.iy, extreme.iz) <= 25 && extreme.durationMs! <= 4200);
  const p = C.createBody(); C.applyImpulse(p, { ...bike, at: 1000 }, 1080);
  assert.equal(p.knockdownUntil, 1000 + bike.durationMs!); assert.equal(p.impactX, bike.ix);
  C.stepMovement(p, { ...C.IDLE_INPUT, x: -1, jump: true, slide: true }, .05, 1100);
  assert.equal(p.anim, 3); assert.ok(p.vx > 0, "input cannot reverse the impact during knockout");
  assert.equal(p.slideUntil, 0); assert.equal(p.jumpUntil, 0);
});

test("impact sequence recoils, falls, waits on the floor, then gets up only with ground support", () => {
  const p = C.createBody(); C.applyImpulse(p, { ...C.collisionImpact("bike", 8, 0, 0, "bike"), at: 1000 }, 1000);
  p.simTime = 1000; assert.equal(C.impactPose(p).fall, 0); assert.equal(C.impactPose(p).recoil, 1);
  p.simTime = 1500; assert.equal(C.impactPose(p).fall, 1); assert.equal(C.impactPose(p).rise, 0);
  p.simTime = p.knockdownUntil - 325; assert.equal(C.impactPose(p).rise, .5);
  p.grounded = false; assert.equal(C.impactPose(p).rise, 0);
  p.grounded = true; p.simTime = p.knockdownUntil; assert.equal(C.impactPose(p).fall, 0);
  assert.equal(C.impactPose(p).active, false);
  C.respawn(p); assert.equal(p.impactStrength, 0);
});

test("directional fall and articulated get-up agree with the first-person camera", () => {
  for (const direction of [-1, 1]) {
    const p = C.createBody(), mesh = avatar("#fff");
    C.applyImpulse(p, { ...C.collisionImpact("car", direction * 10, 0, 0, "vehicle"), at: 1000 }, 1000);
    p.simTime = 1600;
    const camera = new PerspectiveCamera(), view = new PlayerView(camera, []);
    for (let i = 0; i < 60; i++) { pose(mesh, p); view.update(p, 1 / 60); }
    assert.ok(mesh.getObjectByName("torso")!.rotation.z * direction < -1);
    assert.ok(camera.position.y < .5); assert.ok(camera.rotation.z * direction > .4);
    assert.ok(firstPersonBodyVisible(p, 0), "hands and body remain available during the fall");
    p.simTime = p.knockdownUntil - 325;
    for (let i = 0; i < 30; i++) pose(mesh, p);
    assert.ok(mesh.getObjectByName("left-knee")!.rotation.x > .6);
    assert.ok(mesh.getObjectByName("neck")!.rotation.x < -.2);
    assert.ok(mesh.getObjectByName("left-toe")!.rotation.x > .4);
    p.anim = 0; p.vx = p.vz = 0; p.simTime = p.knockdownUntil + 1;
    for (let i = 0; i < 90; i++) { pose(mesh, p); view.update(p, 1 / 60); }
    assert.ok(Math.abs(mesh.getObjectByName("torso")!.rotation.z) < .01);
    assert.ok(camera.position.y > 1.59); disposeAvatar(mesh);
  }
});

test('recovery protection blocks repeat impulses for 3s after cars, 2s after bikes and 1s after punches', () => {
  for (const kind of ["vehicle", "bike", "punch"] as const) {
    const p = C.createBody();
    const hit = kind !== 'punch' ? C.collisionImpact(kind, 12, 4, 0, kind)
      : { from: 'punch', ix: 8, iy: 1.5, iz: 0, knockdown: true, durationMs: 1600 };
    C.applyImpulse(p, hit, 1000);
    const expiry = p.knockdownUntil + (kind === "vehicle" ? 3000 : kind === "bike" ? 2000 : 1000);
    assert.equal(p.invincibleUntil, expiry);
    const before = { vx: p.vx, vy: p.vy, until: p.knockdownUntil };
    for (const at of [1500, p.knockdownUntil, expiry - 1]) {
      C.applyImpulse(p, { ...C.collisionImpact('bike', 9, 2, 0, 'bike'), at }, at);
      assert.equal(p.vx, before.vx); assert.equal(p.vy, before.vy); assert.equal(p.knockdownUntil, before.until);
    }
    C.applyImpulse(p, { ...hit, at: expiry }, expiry);
    assert.ok(p.knockdownUntil > expiry, 'can be hit again exactly when protection ends');
    C.respawn(p); assert.equal(p.invincibleUntil, 0);
  }
});

test('car ejection carries bike riders farther than a solo bike crash and protection preserves remounted riders', () => {
  const travel = (car: boolean) => {
    const state = new RaceState(), manager = new VehicleManager(state), v = state.vehicles.get('bike-1')!;
    v.driver = 'rider'; v.rotY = Math.PI / 2;
    const p = C.createBody(); Object.assign(p, { vehicleId: 'bike-1', vehicleKind: 2 });
    state.players.set('rider', new Player(p));
    manager.crashBike('bike-1', 1000, (from, _target, _x, _y, _z, ix, iy, iz, down, kind) => {
      p.vehicleId = ''; C.applyImpulse(p, C.collisionImpact(from, ix, iy, iz, kind === 3 ? 'vehicle' : 'bike', down), 1000);
    }, 10, car ? { from: 'car', rotY: Math.PI / 2, kind: 3 } : undefined);
    for (let i = 0; i < 60; i++) C.stepMovement(p, C.IDLE_INPUT, 1 / 60, 1000 + i * 1000 / 60);
    return p.x;
  };
  assert.ok(travel(true) > travel(false) * 2, 'car impact launches the rider farther in actual movement');
  const state = new RaceState(), manager = new VehicleManager(state), v = state.vehicles.get('bike-1')!;
  state.serverTime = 5000; v.driver = 'rider';
  state.players.set('rider', new Player({ vehicleId: 'bike-1', vehicleKind: 2, invincibleUntil: 6000 }));
  let hits = 0;
  manager.runOver('bike-1', 5000, () => hits++, 20, { from: 'car', rotY: 0, kind: 3 });
  assert.equal(hits, 0); assert.equal(v.driver, 'rider'); assert.equal(v.fallenUntil, 0);
});
