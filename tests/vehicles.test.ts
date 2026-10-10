import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { GameState, Player } from "../apps/server/src/state.ts";
import { Vehicles, type VehicleHost } from "../apps/server/src/vehicles.ts";

const world = C.zurichWorld;

function setup(names = ["a", "b", "c"]) {
  const state = new GameState();
  const notices: [string, string][] = [], releases: string[] = [], knocks: [string, string, number][] = [];
  const host: VehicleHost = {
    state,
    notice: (id, text) => notices.push([id, text]),
    release: (id, x, y, z) => { releases.push(id); Object.assign(state.players.get(id)!, { x, y, z }); },
    knockDown: (target, from, _ix, _iy, _iz, ms) => { knocks.push([target, from, ms]); state.players.get(target)!.downUntil = now + ms; },
  };
  let now = 1_000_000;
  const vehicles = new Vehicles(host);
  vehicles.reset(now);
  for (const id of names) state.players.set(id, new Player({ name: id }));
  const at = (id: string, p: C.Point) => Object.assign(state.players.get(id)!, { x: p.x, y: p.y, z: p.z });
  return { state, vehicles, notices, releases, knocks, at, get now() { return now; }, set now(t: number) { now = t; } };
}

test("carts: one driver at a time, granted atomically; exit releases beside the cart", () => {
  const s = setup(), cart = s.state.vehicles.get("cart-1")!;
  s.at("a", cart); s.at("b", cart);
  s.vehicles.enter("a", s.state.players.get("a")!, "cart-1", s.now);
  s.vehicles.enter("b", s.state.players.get("b")!, "cart-1", s.now);
  assert.equal(cart.driver, "a");
  assert.equal(s.state.players.get("a")!.vehicle, "cart-1");
  assert.equal(s.state.players.get("b")!.vehicle, "", "second claim refused");
  assert.match(s.notices.at(-1)![1], /already driving/);
  s.at("c", { x: cart.x + 30, y: cart.y, z: cart.z });
  s.vehicles.enter("c", s.state.players.get("c")!, "cart-2", s.now);
  assert.match(s.notices.at(-1)![1], /closer/);
  s.vehicles.exit("a", s.state.players.get("a")!, s.now);
  const a = s.state.players.get("a")!;
  assert.equal(cart.driver, "");
  assert.equal(a.vehicle, "");
  assert.deepEqual(s.releases, ["a"]);
  assert.ok(!world.blocked(a.x, a.y, a.z, C.RADIUS, C.HEIGHT) && Math.hypot(a.x - cart.x, a.z - cart.z) < 5, "on free ground next to it");
});

test("drivers own their cart: valid reports move it, teleports are refused", () => {
  const s = setup(), cart = s.state.vehicles.get("cart-1")!, a = s.state.players.get("a")!;
  s.at("a", cart);
  s.vehicles.enter("a", a, "cart-1", s.now);
  const to = C.findGround(world, cart.x + 0.4, cart.z, C.CART_RADIUS)!;
  assert.ok(s.vehicles.drive("a", a, [0, to.x, to.y, to.z, 0.5, 8, 0, 0, 0], s.now, 1 / 30));
  assert.ok(Math.abs(cart.x - to.x) < 1e-3 && Math.abs(cart.yaw - 0.5) < 1e-6);
  assert.ok(Math.hypot(a.x - cart.x, a.z - cart.z) < 1e-3, "driver sits on the cart");
  assert.equal(s.vehicles.drive("a", a, [0, cart.x + 100, cart.y, cart.z, 0, 0, 0, 0, 0], s.now, 1 / 30), false);
});

test("shuttle: first passenger starts a 10 s countdown, later ones do not reset it, empty cancels", () => {
  const s = setup(), shuttle = s.state.vehicles.get("shuttle")!;
  s.at("a", shuttle); s.at("b", shuttle);
  s.vehicles.enter("a", s.state.players.get("a")!, "shuttle", s.now);
  assert.equal(shuttle.departAt, s.now + C.SHUTTLE_COUNTDOWN_MS);
  const departAt = shuttle.departAt;
  s.now += 3000;
  s.vehicles.enter("b", s.state.players.get("b")!, "shuttle", s.now);
  assert.equal(shuttle.departAt, departAt, "not reset");
  assert.notEqual(s.state.players.get("a")!.seat, s.state.players.get("b")!.seat);
  s.vehicles.exit("a", s.state.players.get("a")!, s.now);
  assert.equal(shuttle.departAt, departAt, "still one passenger");
  s.vehicles.exit("b", s.state.players.get("b")!, s.now);
  assert.equal(shuttle.departAt, 0, "empty shuttle cancels its countdown");
});

test("shuttle: six seats, travels the route to ETH, no exit while moving, everyone off on arrival, then back", () => {
  const names = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
  const s = setup(names), shuttle = s.state.vehicles.get("shuttle")!;
  for (const id of names) { s.at(id, shuttle); s.vehicles.enter(id, s.state.players.get(id)!, "shuttle", s.now); }
  assert.equal([...s.state.players.values()].filter(p => p.vehicle === "shuttle").length, C.SHUTTLE_SEATS);
  assert.match(s.notices.at(-1)![1], /full/);
  s.now = shuttle.departAt;
  s.vehicles.tick(s.now);
  assert.equal(shuttle.tripStart, s.now, "departed");
  s.vehicles.enter("p7", s.state.players.get("p7")!, "shuttle", s.now + 10);
  s.now += 60_000;
  s.vehicles.tick(s.now);
  const mid = s.vehicles.poseOf(shuttle, s.now, { kind: 1, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 });
  assert.ok(Math.hypot(mid.vx, mid.vz) > 7, "moving");
  s.vehicles.exit("p1", s.state.players.get("p1")!, s.now);
  assert.equal(s.state.players.get("p1")!.vehicle, "shuttle", "cannot get off while moving");
  s.now = shuttle.tripStart + C.shuttleTripMs(world) + 1;
  s.vehicles.tick(s.now);
  assert.equal(shuttle.tripStart, 0);
  assert.equal(shuttle.dir, 1, "waits for the trip back");
  const eth = world.stops[1];
  for (const id of names.slice(0, 6)) {
    const p = s.state.players.get(id)!;
    assert.equal(p.vehicle, "");
    assert.ok(Math.hypot(p.x - eth.x, p.z - eth.z) < 15, `${id} got off at ETH`);
  }
  // Route clearance: every metre of the route is on ground, the shuttle fits between buildings.
  const pose = { kind: 1, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
  let blocked = 0;
  for (let d = 0; d <= world.routeLength; d += 1) {
    C.routePoint(world, d, false, pose);
    assert.ok(!Number.isNaN(world.height(pose.x, pose.z)), `ground at ${d} m`);
    if (world.blocked(pose.x, pose.y, pose.z, 1, 1)) blocked++;
  }
  assert.ok(blocked / world.routeLength < 0.02, `route mostly clear (${blocked} blocked metres)`);
});

test("run-overs: moving carts knock foot players down and credit the driver; slow carts do not", () => {
  const s = setup(), cart = s.state.vehicles.get("cart-1")!;
  s.at("a", cart);
  s.vehicles.enter("a", s.state.players.get("a")!, "cart-1", s.now);
  s.at("b", { x: cart.x + 0.5, y: cart.y, z: cart.z });
  cart.vx = 1;
  s.vehicles.tick(s.now);
  assert.equal(s.knocks.length, 0, "too slow");
  cart.vx = 10;
  s.vehicles.tick(s.now);
  assert.deepEqual(s.knocks[0], ["b", "a", C.RUN_OVER_KNOCKDOWN_MS]);
  s.vehicles.tick(s.now);
  assert.equal(s.knocks.length, 1, "no repeat hit while down");
});

test("bikes fall and throw their rider off on a crash; heavy traffic ejects drivers", () => {
  const s = setup(), bike = s.state.vehicles.get("bike-1")!, a = s.state.players.get("a")!;
  s.at("a", bike);
  s.vehicles.enter("a", a, "bike-1", s.now);
  bike.vx = 9;
  s.vehicles.crash("a", a, s.now);
  assert.equal(a.vehicle, "");
  assert.ok(bike.fallenUntil > s.now);
  assert.deepEqual(s.knocks[0], ["a", "a", C.RUN_OVER_KNOCKDOWN_MS], "own crash: no credit");
  s.vehicles.enter("a", a, "bike-1", s.now);
  assert.equal(a.vehicle, "", "fallen bikes cannot be ridden");
  // Traffic: put a driven cart right where the car is.
  const cart = s.state.vehicles.get("cart-2")!, b = s.state.players.get("b")!;
  s.at("b", cart);
  s.vehicles.enter("b", b, "cart-2", s.now);
  const car = s.vehicles.poseOf(s.state.vehicles.get("traffic")!, s.now, { kind: 3, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 });
  Object.assign(cart, { x: car.x, y: car.y, z: car.z });
  s.vehicles.tick(s.now);
  assert.equal(b.vehicle, "", "driver knocked out of the cart");
  assert.equal(s.knocks.at(-1)![0], "b");
});
