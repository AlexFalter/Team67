import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { RoundManager } from "../apps/server/src/round.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { withServer, until, delay, type WireState } from "./fixture.ts";
import { Network } from "../apps/client/src/multiplayer/net.ts";

test("host start schedules one unskippable intro before the round clock, with stable seats", () => {
  const state = new RaceState(); let arrivals = 0;
  const rounds = new RoundManager(state, 1000, undefined, undefined, { onArrival: () => arrivals++ });
  for (const id of ["a", "b"]) { rounds.join(id, { name: id }); state.players.set(id, new Player()); }
  rounds.ready("b", true, 1000); assert.equal(state.introStartedAt, 0);
  rounds.ready("a", true, 1000);
  assert.equal(state.phase, C.RoomPhase.Running);
  assert.equal(state.introStartedAt, 1000 + C.BATTLE_BUS_LEAD_MS);
  assert.equal(state.startedAt, state.introStartedAt + C.battleBusTiming(2).durationMs);
  assert.equal(state.endsAt, state.startedAt + 1000);
  assert.equal(state.members.get("a")!.introSeat, 0); assert.equal(state.members.get("b")!.introSeat, 1);
  assert.equal(rounds.canPlay("a", state.startedAt - 1), false);
  rounds.finish(state.startedAt - 1); rounds.hit("a", "b");
  assert.equal(state.phase, C.RoomPhase.Running); assert.equal(state.introComplete, false);
  rounds.join("waiting", { name: "Cam" });
  assert.equal(state.members.get("waiting")!.spectator, true); assert.equal(state.members.get("waiting")!.introSeat, -1);
  state.players.delete("a"); rounds.leave("a", state.startedAt - 1);
  assert.equal(state.members.get("b")!.introSeat, 1, "disconnect does not reshuffle seats");
  rounds.tick(state.startedAt - 1); assert.equal(arrivals, 0);
  rounds.tick(state.startedAt); assert.equal(arrivals, 1); assert.equal(rounds.canPlay("b", state.startedAt), true);
  rounds.tick(state.startedAt + 100); assert.equal(arrivals, 1);
  rounds.tick(state.endsAt);
  assert.equal(state.phase, C.RoomPhase.Finished); assert.equal(state.results.get("b")!.hitsReceived, 0);
  rounds.restart("b"); assert.equal(state.introStartedAt, 0); assert.equal(state.introComplete, false);
  assert.ok([...state.members.values()].every(member => member.introSeat === -1));
});

test("passenger-sized exits lead into three seconds of countdown before gameplay", () => {
  for (const passengers of [1, 2, 12, 40]) {
    const state = new RaceState(), rounds = new RoundManager(state);
    for (let i = 0; i < passengers; i++) { rounds.join(String(i), { name: `Player ${i}` }); state.players.set(String(i), new Player()); }
    rounds.ready("0", true, 1000);
    const timing = C.battleBusTiming(passengers);
    assert.equal(state.introPassengerCount, passengers);
    assert.equal(state.startedAt - state.introStartedAt, timing.durationMs);
    assert.equal(timing.exitEndMs, C.BATTLE_BUS_ARRIVAL_MS + C.battleBusExitStartMs(passengers - 1) + C.BATTLE_BUS_EXIT_WALK_MS);
    assert.equal(C.battleBusCountdown(passengers, timing.countdownAtMs - 1), 0);
    for (const [offset, number] of [[0, 3], [1000, 2], [2000, 1]]) {
      assert.equal(C.battleBusCountdown(passengers, timing.countdownAtMs + offset), number);
      rounds.tick(state.introStartedAt + timing.countdownAtMs + offset);
      assert.equal(rounds.canPlay("0", state.introStartedAt + timing.countdownAtMs + offset), false);
    }
    assert.equal(C.battleBusCountdown(passengers, timing.durationMs), 0);
    rounds.tick(state.startedAt);
    assert.equal(rounds.canPlay("0", state.startedAt), true);
  }
  assert.ok(C.battleBusTiming(1).exitEndMs < C.battleBusTiming(40).exitEndMs);
});

test("compressed test intros keep the same passenger timeline and thanking window", () => {
  const state = new RaceState(), rounds = new RoundManager(state, 1000, undefined, undefined, { durationMs: 1200, leadMs: 0 });
  for (const id of ["a", "b"]) { rounds.join(id, { name: id }); state.players.set(id, new Player()); }
  rounds.ready("a", true, 1000);
  const timing = C.battleBusTiming(2);
  const arrival = state.introStartedAt + 1200 * C.BATTLE_BUS_ARRIVAL_MS / timing.durationMs;
  rounds.thankBusDriver("a", state.introStartedAt, arrival - 1);
  rounds.thankBusDriver("b", state.introStartedAt, arrival);
  assert.equal(state.members.get("a")!.thankedBusDriver, true);
  assert.equal(state.members.get("b")!.thankedBusDriver, false);
  const before = C.battleBusElapsed(state, 1600);
  rounds.join("late", { name: "Late" }); rounds.leave("b", 1600);
  assert.equal(state.introPassengerCount, 2);
  assert.equal(state.startedAt, 2200);
  assert.equal(C.battleBusElapsed(state, 1600), before, "membership changes do not retime the camera or countdown");
  assert.equal(C.battleBusElapsed(state, 2200), timing.durationMs / 1000);
});

test("shared cinematic time catches up independently of frame count, with forty clear drop-offs", () => {
  const state = { introStartedAt: 2000, startedAt: 2000 + C.BATTLE_BUS_DURATION_MS };
  assert.equal(C.battleBusElapsed(state, 1000), 0);
  assert.ok(Math.abs(C.battleBusElapsed(state, 2000 + 3500) - 3.5) < 1e-10);
  assert.equal(C.battleBusElapsed(state, state.startedAt + 60000), C.BATTLE_BUS_DURATION_MS / 1000);
  const points = C.battleBusDropoffs(C.zurichWorld, 40);
  assert.equal(points[0].x, C.BATTLE_BUS_START.x); assert.equal(points[0].z, C.BATTLE_BUS_START.z);
  for (const [i, point] of points.entries()) {
    assert.equal(point.y, C.zurichWorld.height(point.x, point.z));
    assert.equal(C.zurichWorld.blocked(point.x, point.y, point.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT), false);
    for (const other of points.slice(0, i)) assert.ok(Math.hypot(point.x - other.x, point.z - other.z) > C.CAPSULE_RADIUS * 2);
    const seat = C.battleBusSeat(i);
    assert.ok(Number.isFinite(seat.x) && Number.isFinite(seat.y) && Number.isFinite(seat.z));
  }
});

test("client gameplay gate cannot unlock using the clock alone before server arrival", () => {
  const net = new Network(), body = C.createBody(), messages: string[] = [];
  net.initialized = true;
  net.room = { sessionId: "a", state: { phase: C.RoomPhase.Running, startedAt: 0, endsAt: Date.now() + 60000,
    introComplete: false, players: new Map([["a", body]]), members: new Map([["a", { spectator: false }]]) },
    send: (type: string) => messages.push(type) } as unknown as typeof net.room;
  net.frame(0.1, body, () => ({ ...C.IDLE_INPUT, x: 1, jump: true, hit: true }));
  assert.equal(net.canPlay, false); assert.equal(body.x, 0); assert.deepEqual(messages, []);
  net.room.state.introComplete = true;
  assert.equal(net.canPlay, true);
});

test("live clients share the intro deadline; host cannot skip, late joiners wait, and arrival uses prototype start", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race", { name: "Ada" }); rooms.push(a);
    const b = await client.joinById<WireState>(a.roomId, { name: "Ben" }); rooms.push(b);
    for (const room of rooms) for (const type of ["bump", "impulse", "playerCorrection"]) room.onMessage(type, () => {});
    await until(() => a.state.members.size === 2 && b.state.members.size === 2, "both in lobby");
    a.send("ready", true); b.send("ready", true);
    await until(() => a.state.introStartedAt > 0 && b.state.introStartedAt > 0, "shared intro");
    assert.equal(a.state.introStartedAt, b.state.introStartedAt); assert.equal(a.state.startedAt, b.state.startedAt);
    assert.equal(a.state.introPassengerCount, 2); assert.equal(b.state.introPassengerCount, 2);
    assert.equal(a.state.introComplete, false); assert.equal(a.state.endsAt - a.state.startedAt, 60000);
    const p = a.state.players.get(a.sessionId)!, original = { x: p.x, y: p.y, z: p.z };
    a.send("finishRound"); a.send("ready", false); a.send("hit");
    a.send("vehicleEnter", "bike-1"); a.send("move", [500, 20, 500, 0, 12, 0, 12, 1]);
    const late = await client.joinById<WireState>(a.roomId, { name: "Cam" }); rooms.push(late);
    late.onMessage("bump", () => {});
    await until(() => late.state.members?.size === 3, "late arrival");
    await delay(100);
    assert.equal(a.state.phase, C.RoomPhase.Running); assert.equal(a.state.introComplete, false);
    assert.deepEqual({ x: p.x, y: p.y, z: p.z }, original);
    assert.equal(p.vehicleId, "");
    assert.equal(late.state.members.get(late.sessionId)!.spectator, true); assert.equal(late.state.players.has(late.sessionId), false);
    await until(() => rooms.every(room => room.state.introComplete), "synchronized server arrival");
    const points = C.battleBusDropoffs(C.zurichWorld, 40);
    for (const room of [a, b]) {
      const slot = room.state.members.get(room.sessionId)!.introSeat, player = room.state.players.get(room.sessionId)!;
      assert.ok(Math.abs(player.x - points[slot].x) < 0.001 && Math.abs(player.z - points[slot].z) < 0.001);
      assert.ok(Math.abs(player.y - points[slot].y) < 0.001);
    }
    a.send("finishRound"); await until(() => rooms.every(room => room.state.phase === C.RoomPhase.Finished), "normal finish");
    a.send("restartRound"); await until(() => rooms.every(room => room.state.phase === C.RoomPhase.Lobby), "reset");
    for (const room of rooms) room.send("ready", true);
    await until(() => rooms.every(room => room.state.phase === C.RoomPhase.Running && !room.state.introComplete), "second intro");
    assert.equal(late.state.members.get(late.sessionId)!.spectator, false);
    assert.equal(late.state.players.size, 3);
  }, "zurich", { BATTLE_BUS_INTRO_MS: "1200", BATTLE_BUS_LEAD_MS: "200", ROUND_DURATION_MS: "60000" });
});
