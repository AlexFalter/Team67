import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Client, type Room } from "@colyseus/sdk";
import * as C from "../packages/shared/src/index.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, description: string, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Timed out: ${description}`); await delay(20); }
}

test("live fixed-input server owns movement and player contact never knocks down without a hit", { timeout: 30000 }, async () => {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"],
    { env: { ...process.env, PORT: String(port), GAME_WORLD: "flat" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stdout.on("data", (chunk) => logs += chunk);
  server.stderr.on("data", (chunk) => logs += chunk);
  const rooms: Room<any, C.WorldState>[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  try {
    await until(() => logs.includes("Multiplayer Framework"), "server startup", 15000);
    const client = new Client(`ws://127.0.0.1:${port}`);
    const code = `TEST-${port}`;
    rooms.push(await client.create<C.WorldState>("race", { code, character: 1 }));
    for (let i = 0; i < 2; i++) rooms.push(await client.joinById<C.WorldState>(code, { character: 2 }));
    const [a, b, spectator] = rooms;
    await until(() => rooms.every((r) => r.state?.players?.size === 3), "three synchronized players");
    assert.equal(a.roomId, b.roomId);
    assert.equal(a.roomId, code);
    assert.equal(spectator.state.players.get(a.sessionId)!.character, 1);
    assert.equal(a.state.players.get(b.sessionId)!.character, 2);
    const duplicates = await Promise.allSettled([client.create("race", { code }), client.create("race", { code })]);
    assert.ok(duplicates.every(r => r.status === "rejected"), "simultaneous duplicate codes rejected");
    await assert.rejects(client.joinById("NO-SUCH-ROOM"));
    await assert.rejects(client.create("race", { code: "!" }));
    const input = a.input({ type: C.MoveInput });
    assert.equal(input.tickRate, C.COLLISION_TICK_RATE);
    const bumps: C.Bump[] = [];
    for (const room of rooms) room.onMessage<C.Bump>("bump", (hit) => { if (room === spectator) bumps.push(hit); });
    const start = a.state.players.get(a.sessionId)!.x;
    await delay(100);
    assert.equal(a.state.players.get(a.sessionId)!.x, start, "idle player remains at spawn");
    input.data.x = 1; input.data.sprint = true;
    timers.push(setInterval(() => input.send(), 1000 / input.tickRate!));
    await delay(650);
    const pa = a.state.players.get(a.sessionId)!, pb = a.state.players.get(b.sessionId)!;
    assert.ok(pa.x > start, "player reaches the blocking target");
    assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) >= 2 * C.CAPSULE_RADIUS - 0.05, "capsules separate");
    assert.equal(pb.knockdownUntil, 0, "sprinting into a player does not knock them down");
    assert.equal(bumps.length, 0, "ordinary contact has no impact effect");
    assert.ok(input.lastProcessed > 0, "native input acknowledgements");
    input.data.x = 0;
    await until(() => a.clock.rtt() > 0, "native room clock");
    await b.leave();
    await until(() => spectator.state.players.size === 2, "leave removal");
  } catch (error) { throw new Error(`${String(error)}\nPlayers: ${JSON.stringify([...rooms[0]?.state?.players?.values() ?? []])}\nServer output:\n${logs}`); }
  finally { timers.forEach(clearInterval); await Promise.allSettled(rooms.filter(r => r.connection?.isOpen).map(r => r.leave())); server.kill(); }
});
