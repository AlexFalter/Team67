import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { ContactWorld } from "../apps/server/src/physics.ts";
import { Vehicle } from "../apps/server/src/state.ts";

test("Rapier capsule contacts follow authoritative transforms and clean up removed players", async () => {
  const world = await ContactWorld.create();
  try {
    const a = C.createBody(), b = C.createBody(); b.x = 0.9;
    const players = new Map([["a", a], ["b", b]]);
    world.sync(players); assert.ok(world.intersects("a", "b"));
    b.x = 2; world.sync(players); assert.equal(world.intersects("a", "b"), false);
    players.delete("b"); world.sync(players); assert.equal(world.intersects("a", "b"), false);
  } finally { world.dispose(); }
});
test("house collision meshes block sideways movement and support roof landing", () => {
  const h = C.HOUSES[0], p = C.createBody();
  p.x = h.x - h.width / 2 - C.CAPSULE_RADIUS; p.z = h.z;
  for (let i = 0; i < 60; i++) C.stepPlayer(p, { x: 1, z: 0, sprint: true, jump: false }, 1 / 30);
  assert.equal(p.x, h.x - h.width / 2 - C.CAPSULE_RADIUS);
  p.x = h.x; p.y = h.height + 0.01; p.vy = -3;
  C.stepPlayer(p, C.IDLE_INPUT, 1 / 30);
  assert.equal(p.y, h.height); assert.ok(p.grounded);
});
test("loose Rapier object bounces off the same house mesh and produces player contacts", async () => {
  const world = await ContactWorld.create();
  try {
    const h = C.HOUSES[0], ball = new Vehicle(C.createVehicle(4, h.x - h.width / 2 - 1.1, h.z));
    ball.vx = 8;
    const vehicles = new Map([["ball", ball]]);
    for (let i = 0; i < 10; i++) world.sync(new Map(), vehicles);
    assert.ok(ball.vx < 0, "dynamic body rebounds off the static house collider");
    const player = C.createBody(); player.x = ball.x; player.z = ball.z;
    world.sync(new Map([["p", player]]), vehicles);
    assert.ok(world.intersects("p", "v:ball"));
  } finally { world.dispose(); }
});
test("occupied vehicles push parked vehicles through Rapier and occupancy changes preserve position", async () => {
  const world = await ContactWorld.create();
  try {
    const parked = new Vehicle(C.createVehicle(0, 0, 0)), driven = new Vehicle(C.createVehicle(0, -2.1, 0));
    driven.driver = "owner"; driven.vx = 6;
    const vehicles = new Map([["parked", parked], ["driven", driven]]);
    for (let i = 0; i < 15; i++) { driven.x += 0.1; world.sync(new Map(), vehicles); }
    assert.ok(parked.x > 0.3, "parked car moves after impact");
    const before = parked.x; parked.driver = "second";
    world.sync(new Map(), vehicles);
    assert.ok(Math.abs(parked.x - before) < 0.01, "boarding switches to kinematic without teleporting");
  } finally { world.dispose(); }
});
