import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { Network } from "../apps/client/src/multiplayer/net.ts";

function fixture() {
  const net = new Network(), messages: { type: string; data: unknown }[] = [];
  net.initialized = true;
  const body = Object.assign(C.createBody(), C.zurichWorld.spawn, { simTime: Date.now() });
  net.room = { sessionId: "local", state: { phase: C.RoomPhase.Running, endsAt: Date.now() + 60000, players: new Map([["local", body]]),
    members: new Map([["local", { name: "Player", spectator: false }]]) },
    send: (type: string, data: unknown) => messages.push({ type, data }) } as unknown as typeof net.room;
  return { net, body, messages };
}

test("actual client frame keeps feature jump, shoes and look direction; one-shot actions run once across substeps", () => {
  const { net, body, messages } = fixture();
  net.frame(0.1, body, () => ({ ...C.IDLE_INPUT, x: 1, jump: true, toggleShoes: true, hit: true, aim: true, facing: 1.2 }));
  assert.equal(body.shoes, true, "shoe toggle is consumed only once");
  assert.equal(body.rotY, 1.2, "stationary/strafe facing comes from camera");
  assert.ok(!body.grounded && body.vy > C.JUMP_VELOCITY * 0.8);
  assert.deepEqual(messages.map(m => m.type), ["move", "toggleShoes", "hit"]);
  assert.equal((messages[0].data as C.Move)[3], 1.2, "pose reaches server before punch");
  const takeoff = body.vx;
  net.frame(0.1, body, () => ({ ...C.IDLE_INPUT, aim: true, facing: 1.2 }));
  assert.ok(Math.abs(body.vx - takeoff) < 0.001, "airborne release preserves momentum");
  assert.equal(messages.length, 3);
});

test("actual client frame reports the current driven pose before vehicle actions", () => {
  const { net, body, messages } = fixture(), anchor = C.zurichWorld.carts[0];
  Object.assign(body, anchor, { y: anchor.y + C.CART_SEAT_HEIGHT, vehicleId: "bike-1", vehicleKind: 2, seat: 0 });
  const x = body.x;
  net.frame(0.1, body, () => ({ ...C.IDLE_INPUT, x: 1, toggleShoes: true }));
  assert.ok(body.x > x);
  const report = messages.find(m => m.type === "vehicleMove")!.data as C.VehicleMove;
  assert.equal(report[0], "bike-1");
  assert.equal(report[1], body.x);
  assert.equal(report[2], body.z);
  assert.equal(report[4], body.vx);
});

test("knockdown recovers on the synchronized clock after a background tab", () => {
  const { net, body } = fixture();
  net.offset = 30000;
  body.simTime = net.now() - 10000;
  body.knockdownUntil = net.now() - 1000;
  body.anim = 3;
  net.frame(1 / 60, body, () => ({ ...C.IDLE_INPUT, x: 1 }));
  assert.ok(body.simTime >= body.knockdownUntil);
  assert.notEqual(body.anim, 3);
  assert.ok(body.vx > 0);
});


test("client refuses simulation and actions in lobby, after finish, and for waiting members", () => {
  const { net, body, messages } = fixture(), x = body.x;
  for (const phase of [C.RoomPhase.Lobby, C.RoomPhase.Finished]) {
    net.room.state.phase = phase;
    net.frame(0.1, body, () => ({ ...C.IDLE_INPUT, x: 1, hit: true, toggleShoes: true }));
    assert.equal(body.x, x); assert.equal(messages.length, 0); assert.equal(net.canPlay, false);
  }
  net.room.state.phase = C.RoomPhase.Running;
  net.room.state.members.get("local")!.spectator = true;
  net.frame(0.1, body, () => ({ ...C.IDLE_INPUT, x: 1, hit: true }));
  assert.equal(body.x, x); assert.equal(messages.length, 0);
});
