import { spawn } from "node:child_process";
import { createConnection, createServer, type Server } from "node:net";
import { Client, type Room } from "@colyseus/sdk";
import type { Schema } from "@colyseus/schema";
import type { WorldState } from "../packages/shared/src/index.ts";
export type WireState = WorldState & Schema;
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function until(check: () => boolean, description: string, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Timed out: ${description}`); await delay(20); }
}
export async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}
export async function withServer(run: (client: Client, rooms: Room<any, WireState>[], port: number) => Promise<void>, world = "flat", extraEnv: Record<string, string> = {}) {
  const socket = createServer(), port = await listen(socket);
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const server = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"],
    { env: { ...process.env, PORT: String(port), GAME_WORLD: world, BATTLE_BUS_INTRO_MS: "100", BATTLE_BUS_LEAD_MS: "0", ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stdout.on("data", chunk => logs += chunk); server.stderr.on("data", chunk => logs += chunk);
  const rooms: Room<any, WireState>[] = [];
  try {
    await until(() => logs.includes("Multiplayer Framework"), "server startup", 15000);
    const deadline = Date.now() + 15000;
    while (!await new Promise<boolean>(resolve => {
      const probe = createConnection({ port, host: "127.0.0.1" });
      probe.once("connect", () => { probe.destroy(); resolve(true); });
      probe.once("error", () => resolve(false));
    })) { if (Date.now() > deadline) throw new Error("Server did not listen"); await delay(20); }
    await run(new Client(`ws://127.0.0.1:${port}`), rooms, port);
  } catch (error) { throw new Error(`${String(error)}\nServer output:\n${logs}`); }
  finally {
    await Promise.allSettled(rooms.filter(r => r.connection?.isOpen).map(r => r.leave()));
    server.kill();
  }
}

export async function startRound(room: Room<any, WireState>, participants: Room<any, WireState>[]) {
  for (const participant of participants) participant.send("ready", true);
  await until(() => room.state.phase === "Running" && room.state.introComplete, "all players ready and bus arrived");
}
