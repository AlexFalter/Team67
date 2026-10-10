// Live-server helpers: start the real server in a child process on a free port, connect SDK clients.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Client, type Room } from "@colyseus/sdk";
import type { StateView } from "../apps/client/src/net/Net.ts";

export type GameRoom = Room<object, StateView>;
export const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function until(check: () => boolean, what: string, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await delay(15);
  }
}

async function freePort() {
  const s = createServer();
  await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>(r => s.close(() => r()));
  return port;
}

export async function withServer(run: (client: Client, rooms: GameRoom[]) => Promise<void>, env: Record<string, string> = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
    env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", d => (log += d));
  child.stderr.on("data", d => (log += d));
  const rooms: GameRoom[] = [];
  const client = new Client(`ws://127.0.0.1:${port}`);
  try {
    const end = Date.now() + 20000;
    for (;;) {
      try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { /* not listening yet */ }
      if (Date.now() > end) throw new Error("server did not start");
      await delay(50);
    }
    await run(client, rooms);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.stack : e}\n--- server log ---\n${log}`);
  } finally {
    await Promise.allSettled(rooms.filter(r => r.connection?.isOpen).map(r => r.leave()));
    child.kill();
  }
}

/** Collect messages of one type. */
export function inbox<T>(room: GameRoom, type: string) {
  const list: T[] = [];
  room.onMessage<T>(type, m => list.push(m));
  return list;
}
