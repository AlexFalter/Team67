import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { withServer, until, delay, type WireState } from "./fixture.ts";
import { reportClient } from "./reportClient.ts";

test("main reports preserve rooms, characters, validation, contact separation, clock and leave", { timeout: 30000 }, async () => {
  await withServer(async (client, rooms, port) => {
    const code = `TEST-${port}`;
    const a = await client.create<WireState>("race", { code, character: 1 }); rooms.push(a);
    const b = await client.joinById<WireState>(code, { character: 2 }); rooms.push(b);
    const spectator = await client.joinById<WireState>(code); rooms.push(spectator);
    const bumps: C.Bump[] = [], impulses: C.Impulse[] = [];
    for (const room of rooms) {
      room.onMessage<C.Bump>("bump", hit => bumps.push(hit));
      room.onMessage<C.Impulse>("impulse", hit => impulses.push(hit));
      room.onMessage("playerCorrection", () => {});
    }
    await until(() => rooms.every(room => room.state?.players?.size === 3), "three players");
    assert.equal(a.roomId, code);
    assert.equal(spectator.state.players.get(a.sessionId)!.character, 1);
    assert.equal(a.state.players.get(b.sessionId)!.character, 2);
    const duplicates = await Promise.allSettled([client.create("race", { code }), client.create("race", { code })]);
    assert.ok(duplicates.every(result => result.status === "rejected"));
    await assert.rejects(client.joinById("NO-SUCH-ROOM"));
    await assert.rejects(client.create("race", { code: "!" }));
    const own = a.state.players.get(a.sessionId)!, start = own.x;
    a.send("move", [NaN, 0, 0, 0, 0, 0, 0, 0]);
    a.send("move", [90, 0, 0, 0, 0, 0, 0, 0]); await delay(100);
    assert.equal(own.x, start, "malformed/excessive movement rejected");
    let pong: C.Pong | undefined;
    a.onMessage<C.Pong>("pong", value => pong = value);
    const ping = Date.now(); a.send("ping", { clientTime: ping });
    await until(() => !!pong, "ping/pong");
    assert.equal(pong!.clientTime, ping); assert.ok(Math.abs(pong!.serverTime - Date.now()) < 1000);
    const moving = reportClient(a);
    try {
      moving.input.x = 1; moving.input.sprint = true; await delay(650);
      const target = a.state.players.get(b.sessionId)!;
      assert.ok(own.x > start);
      assert.ok(Math.hypot(own.x - target.x, own.z - target.z) >= 2 * C.CAPSULE_RADIUS - 0.05);
      assert.equal(target.knockdownUntil, 0); assert.equal(bumps.length, 0); assert.equal(impulses.length, 0);
      await b.leave(); await until(() => spectator.state.players.size === 2, "leave removal");
    } finally { moving.stop(); }
  });
});
