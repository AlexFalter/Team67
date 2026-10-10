import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { RoundManager } from "../apps/server/src/round.ts";
import { withServer, until, delay, type WireState } from "./fixture.ts";

function fixture() {
  const state = new RaceState(), rounds = new RoundManager(state, 1000, undefined, undefined, { durationMs: 0, leadMs: 0 });
  const join = (id: string, name = id) => {
    const member = rounds.join(id, { name });
    if (!member.spectator) state.players.set(id, new Player());
  };
  return { state, rounds, join };
}

test("names are required, bounded and normalized; invalid joins do not create members", () => {
  const { state, rounds } = fixture();
  for (const name of [undefined, "", "  ", "\n\t", 4, "a".repeat(25)]) {
    assert.throws(() => rounds.join("invalid", { name }));
    assert.equal(state.members.size, 0); assert.equal(state.hostId, "");
  }
  rounds.join("a", { name: "  Ada   Lovelace\n " });
  assert.equal(state.members.get("a")!.name, "Ada Lovelace");
  assert.equal(C.playerName("<b>Ada</b>"), "<b>Ada</b>", "names stay text, rather than markup");
});

test("every lobby member must ready; readiness can be cancelled and disconnects recheck it", () => {
  const { state, rounds, join } = fixture(); join("a"); join("b"); join("c");
  rounds.ready("a", true, 1000); rounds.ready("b", "true", 1000);
  assert.equal(state.phase, C.RoomPhase.Lobby); assert.equal(state.members.get("b")!.ready, false);
  rounds.ready("a", false, 1000); assert.equal(state.members.get("a")!.ready, false);
  rounds.ready("a", true, 1000); rounds.ready("b", true, 1000);
  assert.equal(state.phase, C.RoomPhase.Lobby);
  state.players.delete("c"); rounds.leave("c", 1000);
  assert.equal(state.phase, C.RoomPhase.Running);
  assert.equal(state.startedAt, 1000); assert.equal(state.endsAt, 2000);
  rounds.ready("a", false, 1200); assert.equal(state.phase, C.RoomPhase.Running);
});

test("late arrivals wait; timed results retain departed players and remain frozen until the host restarts", () => {
  const { state, rounds, join } = fixture(); join("a", "Ada"); join("b", "Ben");
  rounds.ready("a", true, 1000); rounds.ready("b", true, 1000); join("waiting", "Cam");
  assert.equal(state.members.get("waiting")!.spectator, true);
  assert.equal(state.players.has("waiting"), false);
  assert.equal(rounds.canPlay("waiting", 1500), false); assert.equal(rounds.canPlay("a", 1500), true);
  assert.equal(rounds.canPlay("a", 2000), false, "play stops at the deadline");
  rounds.hit("a", "b"); rounds.hit("a", "a");
  state.players.delete("b"); rounds.leave("b", 1500);
  rounds.tick(1999); assert.equal(state.phase, C.RoomPhase.Running);
  rounds.tick(2000); assert.equal(state.phase, C.RoomPhase.Finished);
  assert.equal(state.results.size, 2); assert.equal(state.results.get("b")!.name, "Ben");
  assert.equal(state.results.get("a")!.hitsLanded, 1); assert.equal(state.results.get("b")!.hitsReceived, 1);
  assert.equal(state.results.has("waiting"), false);
  rounds.hit("a", "b"); rounds.ready("waiting", true, 3000);
  assert.equal(state.results.get("a")!.hitsLanded, 1);
  rounds.restart("waiting"); assert.equal(state.phase, C.RoomPhase.Finished);
  rounds.restart("a"); assert.equal(state.phase, C.RoomPhase.Lobby);
  assert.equal(state.results.size, 0); assert.equal(state.startedAt, 0);
  assert.ok([...state.members.values()].every(m => !m.ready && !m.spectator));
});

test("the last participant leaving finishes for waiting members and transfers the host", () => {
  const { state, rounds, join } = fixture(); join("a"); rounds.ready("a", true, 1000); join("waiting");
  state.players.delete("a"); rounds.leave("a", 1200);
  assert.equal(state.phase, C.RoomPhase.Finished); assert.equal(state.hostId, "waiting");
  assert.equal(state.results.get("a")!.name, "a");
  rounds.restart("waiting"); assert.equal(state.phase, C.RoomPhase.Lobby);
  assert.equal(state.members.get("waiting")!.spectator, false);
});

test("live room lifecycle gates gameplay, shows identical results to late joiners, and admits them next round", { timeout: 20000 }, async () => {
  await withServer(async (client, rooms) => {
    const a = await client.create<WireState>("race", { name: "Ada", character: 1 }); rooms.push(a);
    const b = await client.joinById<WireState>(a.roomId, { name: "Ben", character: 2 }); rooms.push(b);
    for (const room of rooms) {
      room.onMessage("bump", () => {}); room.onMessage("impulse", () => {}); room.onMessage("playerCorrection", () => {});
    }
    await until(() => a.state?.members?.size === 2 && b.state?.members?.size === 2, "lobby members");
    assert.equal(a.state.phase, C.RoomPhase.Lobby);
    assert.equal(a.state.members.get(a.sessionId)!.name, "Ada");
    const initial = a.state.players.get(a.sessionId)!;
    const position = { x: initial.x, y: initial.y, z: initial.z };
    a.send("move", [initial.x + 0.1, initial.y, initial.z, 0, 1, 0, 0, 1]);
    a.send("vehicleEnter", "cart-1"); a.send("hit");
    a.send("ready", true);
    await until(() => a.state.members.get(a.sessionId)!.ready, "first ready");
    assert.equal(a.state.phase, C.RoomPhase.Lobby);
    assert.equal(initial.x, position.x); assert.equal(initial.vehicleId, "");
    b.send("ready", true);
    await until(() => a.state.phase === C.RoomPhase.Running && b.state.phase === C.RoomPhase.Running && a.state.introComplete && b.state.introComplete, "start");
    const waiting = await client.joinById<WireState>(a.roomId, { name: "Cam", character: 2 }); rooms.push(waiting);
    waiting.onMessage("bump", () => {});
    await until(() => waiting.state?.members?.size === 3, "late member");
    assert.equal(waiting.state.members.get(waiting.sessionId)!.spectator, true);
    assert.equal(waiting.state.players.has(waiting.sessionId), false);
    waiting.send("ready", true); waiting.send("hit");
    waiting.send("vehicleEnter", "cart-1"); waiting.send("finishRound");
    await delay(100);
    assert.equal(a.state.phase, C.RoomPhase.Running);
    assert.equal(waiting.state.members.get(waiting.sessionId)!.ready, false);
    assert.equal(a.state.vehicles.get("cart-1")!.driver, "");
    const attacker = a.state.players.get(a.sessionId)!, victim = a.state.players.get(b.sessionId)!;
    const facing = Math.atan2(victim.x - attacker.x, victim.z - attacker.z);
    a.send("move", [attacker.x, attacker.y, attacker.z, facing, 0, 0, 0, 0]); a.send("hit");
    await until(() => b.state.players.get(b.sessionId)!.knockdownUntil > Date.now(), "punch");
    a.send("finishRound");
    await until(() => rooms.every(room => room.state.phase === C.RoomPhase.Finished && room.state.results.size === 2), "everyone sees results");
    const results = (room: typeof a) => [...room.state.results].map(([id, r]) => [id, r.name, r.hitsLanded, r.hitsReceived]);
    assert.deepEqual(results(a), results(b)); assert.deepEqual(results(a), results(waiting));
    assert.equal(a.state.results.get(a.sessionId)!.hitsLanded, 1);
    const frozen = results(a);
    a.send("hit"); a.send("move", [0, 0, 0, 0, 0, 0, 0, 0]);
    waiting.send("restartRound"); await delay(100);
    assert.equal(a.state.phase, C.RoomPhase.Finished); assert.deepEqual(results(a), frozen);
    const lateFinished = await client.joinById<WireState>(a.roomId, { name: "Dee" }); rooms.push(lateFinished);
    await until(() => lateFinished.state?.results?.size === 2, "finished join gets results");
    assert.deepEqual(results(lateFinished), frozen);
    a.send("restartRound");
    await until(() => rooms.every(room => room.state.phase === C.RoomPhase.Lobby && room.state.players.size === 4), "next lobby");
    assert.ok([...a.state.members.values()].every(m => !m.ready && !m.spectator));
    assert.equal(a.state.players.get(waiting.sessionId)!.character, 2);
    assert.equal(a.state.results.size, 0);
    for (const room of rooms) room.send("ready", true);
    await until(() => rooms.every(room => room.state.phase === C.RoomPhase.Running && room.state.introComplete), "next round includes waiters");
  }, "flat", { ROUND_DURATION_MS: "60000" });
});

test("live timer finishes without client input and replicates the result", { timeout: 15000 }, async () => {
  await withServer(async (client, rooms) => {
    await assert.rejects(client.create("race", { name: " " }));
    const room = await client.create<WireState>("race", { name: "Solo" }); rooms.push(room);
    room.onMessage("playerCorrection", () => {});
    await until(() => room.state?.members?.size === 1, "lobby");
    room.send("ready", true);
    await until(() => room.state.phase === C.RoomPhase.Finished, "timer finish");
    assert.equal(room.state.results.get(room.sessionId)!.name, "Solo");
    assert.equal(room.state.results.get(room.sessionId)!.hitsLanded, 0);
    assert.ok(room.state.finishedAt >= room.state.endsAt);
  }, "flat", { ROUND_DURATION_MS: "250" });
});
