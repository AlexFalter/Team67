import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Client, type Room } from "@colyseus/sdk";
import type {
  WorldState,
  Bump,
  Impulse,
  Move,
  Pong,
  VehicleResult,
} from "../packages/shared/src/index.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(
  check: () => boolean,
  description: string,
  timeout = 5000,
) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await delay(20);
  }
}

test(
  "live room sync, validation, impulses, cooldown, spectator bumps, stomps, and leave",
  { timeout: 30000 },
  async () => {
    const socket = createServer();
    await new Promise<void>((resolve) =>
      socket.listen(0, "127.0.0.1", resolve),
    );
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/src/index.ts"],
      {
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    server.stdout.on("data", (chunk) => (logs += chunk));
    server.stderr.on("data", (chunk) => (logs += chunk));
    const rooms: Room<any, WorldState>[] = [];
    try {
      await until(
        () => logs.includes("Multiplayer Framework"),
        "server startup",
        15000,
      );
      const client = new Client(`ws://127.0.0.1:${port}`);
      for (let i = 0; i < 3; i++)
        rooms.push(await client.joinOrCreate<WorldState>("race"));
      const [a, b, spectator] = rooms;
      await until(
        () => rooms.every((r) => r.state?.players?.size === 3),
        "three synchronized players",
      );
      assert.equal(a.roomId, b.roomId);
      assert.ok(a.state.serverTime > Date.now() - 1000);
      for (const p of a.state.players.values()) assert.match(p.color, /^hsl\(/);

      let pong: Pong | undefined;
      a.onMessage<Pong>("pong", (message) => (pong = message));
      const pingTime = Date.now();
      a.send("ping", { clientTime: pingTime });
      await until(() => !!pong, "pong");
      assert.equal(pong!.clientTime, pingTime);
      assert.ok(Math.abs(pong!.serverTime - Date.now()) < 500);

      const hitsA: Impulse[] = [],
        hitsB: Impulse[] = [],
        bumps: Bump[] = [];
      a.onMessage<Impulse>("impulse", (hit) => hitsA.push(hit));
      b.onMessage<Impulse>("impulse", (hit) => hitsB.push(hit));
      a.onMessage("bump", () => {});
      b.onMessage("bump", () => {});
      spectator.onMessage<Bump>("bump", (bump) => bumps.push(bump));
      spectator.onMessage("impulse", () => {});
      const send = (room: Room<any, WorldState>, move: Move) =>
        room.send("move", move);

      // Allow enough elapsed time to reposition the random join spawns legitimately.
      await delay(450);
      send(spectator, [0, 0, 5, 0, 0, 0, 0, 0]);
      send(a, [-0.45, 0, 0, 0, 11, 0, 0, 1]);
      send(b, [0.45, 0, 0, 0, 0, 0, 0, 0]);
      await until(
        () => hitsA.length === 1 && hitsB.length === 1 && bumps.length === 1,
        "sprint collision",
      );
      assert.equal(hitsA[0].from, b.sessionId);
      assert.equal(hitsB[0].from, a.sessionId);
      assert.equal(hitsB[0].knockdown, true);
      assert.ok(hitsB[0].ix > 13);
      assert.equal(bumps[0].x, 0);
      assert.equal(bumps[0].y, 0.9);
      assert.ok(bumps[0].t > pingTime);
      await delay(150);
      assert.equal(bumps.length, 1, "cooldown suppresses repeated hits");

      send(a, [-0.45, 0, 0, 0, -11, 0, 0, 1]);
      await delay(200);
      assert.equal(bumps.length, 1, "separating players do not hit");
      await until(
        () => a.state.players.get(a.sessionId)?.vx === -11,
        "move state patch",
      );
      const before = a.state.players.get(a.sessionId)!.x;
      send(a, [90, 0, 0, 0, 0, 0, 0, 0]);
      send(a, [NaN, 0, 0, 0, 0, 0, 0, 0]);
      await delay(80);
      assert.equal(
        a.state.players.get(a.sessionId)!.x,
        before,
        "invalid movement rejected",
      );

      send(a, [0, 1.6, 0, 0, 0, -8, 0, 2]);
      send(b, [0, 0, 0, 0, 0, 0, 0, 0]);
      await until(
        () => hitsA.length === 2 && hitsB.length === 2 && bumps.length === 2,
        "stomp",
      );
      assert.equal(hitsA[1].iy, 9);
      assert.equal(hitsB[1].knockdown, true);
      send(a, [0, 1.6, 0, 0, 0, 0, 0, 2]);
      await delay(320);
      send(a, [0, 0, 0, 0, 0, 0, 0, 0]);
      send(b, [0, 1.6, 0, 0, 0, -8, 0, 2]);
      await until(
        () => hitsA.length === 3 && hitsB.length === 3,
        "mirrored stomp",
      );
      assert.equal(hitsB[2].iy, 9);
      assert.equal(hitsA[2].knockdown, true);
      await b.leave();
      await until(
        () =>
          spectator.state.players.size === 2 &&
          !spectator.state.players.has(b.sessionId),
        "leave removal",
      );
      const results: VehicleResult[] = [];
      a.onMessage<VehicleResult>("vehicleResult", (result) =>
        results.push(result),
      );
      spectator.onMessage<VehicleResult>("vehicleResult", (result) =>
        results.push(result),
      );
      await delay(350);
      send(a, [-5, 0, 0, 0, 0, 0, 0, 0]);
      send(spectator, [-5, 0, 0, 0, 0, 0, 0, 0]);
      await until(
        () =>
          [a, spectator].every(
            (room) => room.state.players.get(room.sessionId)?.x === -5,
          ),
        "cart boarding positions",
      );
      a.send("vehicleEnter", "cart-1");
      spectator.send("vehicleEnter", "cart-1");
      await until(
        () => results.length === 2,
        "simultaneous cart claim responses",
      );
      assert.equal(
        results.filter((result) => result.ok).length,
        1,
        "only one simultaneous claim succeeds",
      );
      await until(
        () => !!a.state.vehicles.get("cart-1")!.driver,
        "driver state patch",
      );
      const driver = a.state.vehicles.get("cart-1")!.driver;
      const owner = driver === a.sessionId ? a : spectator,
        other = owner === a ? spectator : a;
      other.send("vehicleMove", ["cart-1", -4.5, 0, Math.PI / 2, 12, 0]);
      await delay(80);
      assert.equal(
        a.state.vehicles.get("cart-1")!.x,
        -5,
        "unauthorized cart update rejected",
      );
      send(owner, [-4.9, 0, 0, 0, 0, 0, 0, 0]);
      await delay(80);
      assert.ok(
        Math.abs(a.state.players.get(driver)!.y - 0.8) < 1e-6,
        "onboard foot update ignored",
      );
      owner.send("vehicleMove", ["cart-1", -4.5, 0, Math.PI / 2, 12, 0]);
      await until(
        () =>
          a.state.vehicles.get("cart-1")!.x === -4.5 &&
          a.state.players.get(driver)!.x === -4.5,
        "cart and driver sync",
      );
      owner.send("vehicleExit");
      await until(
        () =>
          a.state.vehicles.get("cart-1")!.driver === "" &&
          a.state.players.get(driver)!.vehicleId === "",
        "cart exit",
      );
    } catch (error) {
      throw new Error(`${String(error)}\nServer output:\n${logs}`);
    } finally {
      await Promise.allSettled(
        rooms.filter((r) => r.connection?.isOpen).map((r) => r.leave()),
      );
      server.kill();
    }
  },
);
